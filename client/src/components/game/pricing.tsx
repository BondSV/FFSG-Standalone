import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { DollarSign, AlertCircle } from "lucide-react";

interface PricingProps {
  gameSession: any;
  currentState: any;
}

// Use a unified elasticity across SKUs for this screen
const UNIFIED_ELASTICITY = -1.40;

// Product configuration mapped to the required SkuCard contract
const products = [
  {
    skuId: 'jacket',
    name: 'Vintage Denim Jacket',
    base_units: 100000,
    hmp: 80,
    hi_low: [300, 550] as [number, number],
    elasticity: UNIFIED_ELASTICITY,
  },
  {
    skuId: 'dress',
    name: 'Floral Print Dress',
    base_units: 150000,
    hmp: 50,
    hi_low: [180, 210] as [number, number],
    elasticity: UNIFIED_ELASTICITY,
  },
  {
    skuId: 'pants',
    name: 'Corduroy Pants',
    base_units: 120000,
    hmp: 60,
    hi_low: [190, 220] as [number, number],
    elasticity: UNIFIED_ELASTICITY,
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value);
}

function currency(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function percentGap(price: number, hmp: number) {
  if (!price || !hmp) return '0%';
  const pct = ((price - hmp) / hmp) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

function badgeColour(price: number, hmp: number) {
  if (!price || !hmp) return "bg-gray-100 text-gray-700";
  const pct = ((price - hmp) / hmp) * 100;
  // green (−20% – +10%), amber (+10% – +40%), red (outside)
  if (pct >= -20 && pct <= 10) return "bg-green-100 text-green-800";
  if (pct > 10 && pct <= 40) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

// Saturating S-shaped position effect around the reference price.
// - Gentle near the reference price (small deltas => tiny effect)
// - Accelerates through psychologically significant gaps
// - Slows as it approaches saturation (ceiling/floor)
function computePositionEffect(price: number, ref_price: number): number {
  const signedDelta = (price / ref_price) - 1; // relative gap to reference
  const delta = Math.abs(signedDelta);

  const ceil = 0.95;    // max amplitude of positioning influence
  const p = 3;          // curvature (higher => flatter near zero, steeper mid)
  const s = 0.21;       // scale where acceleration becomes noticeable (~21%)
  const base = 1 - Math.exp(-Math.pow(delta / s, p));

  // Small-delta bump to reflect noticeable response around ~5-8% gaps, decays quickly
  const bumpGamma = 40;
  const bumpWidth = 0.08;
  const bump = bumpGamma * (delta * delta) * Math.exp(-Math.pow(delta / bumpWidth, 2));

  const magnitude = Math.min(1, ceil * base + bump);
  const raw = 1 + (signedDelta < 0 ? magnitude : -magnitude);
  // Allow full floor at 0 and ceiling at 2 for extreme cases
  return clamp(raw, 0, 2.0);
}

function demand(price: number, hmp: number, ref_price: number, base_units: number, elasticity: number) {
  const ratio = price / ref_price;
  const price_effect = Math.pow(ratio, elasticity);
  const position_effect = computePositionEffect(price, ref_price);
  const demand_units = base_units * price_effect * position_effect;
  return demand_units;
}

function PricingMetrics({ price, hmp, ref_price, base_units, elasticity }: { price: number; hmp: number; ref_price: number; base_units: number; elasticity: number; }) {
  const hasValidPrice = Number.isFinite(price) && price > 0 && Number.isFinite(hmp) && hmp > 0 && Number.isFinite(ref_price) && ref_price > 0;

  let demand_units_raw = 0;
  let demand_pct_raw = 0;

  if (hasValidPrice) {
    const ratio = price / ref_price;
    const price_effect = Math.pow(ratio, elasticity);
    const position_effect = computePositionEffect(price, ref_price);
    demand_units_raw = base_units * price_effect * position_effect;
    demand_pct_raw = demand_units_raw / base_units;
  }

  // Clamp both displays consistently
  const demand_pct_clamped = clamp(demand_pct_raw, 0, 2);
  const demand_units_clamped = round(base_units * demand_pct_clamped);

  return (
    <div className="space-y-3 text-sm">
      <Label className="text-slate-800 font-semibold">Demand Insight</Label>
      <div className="grid grid-cols-1 gap-1 text-slate-800">
        <div className="flex justify-between">
          <span>Estimated demand at this RRP</span>
          <span className="font-medium">{hasValidPrice ? `${demand_units_clamped.toLocaleString()} units` : '—'}{!hasValidPrice && ' '}</span>
        </div>
        <div className="flex justify-between text-slate-700">
          <span>Relative to baseline</span>
          <span className="font-medium">{hasValidPrice ? `${(demand_pct_clamped * 100).toFixed(0)}%` : '—'}</span>
        </div>
      </div>
      <TooltipWrapper content={"Price elasticity describes how sensitive demand is to price changes. When elasticity is negative, increasing price tends to reduce demand, and lowering price tends to raise demand. Consider: What price signals ‘accessible premium’ versus ‘value’? How might reference brands shape shopper expectations? How would a higher or lower RRP influence your forecast mix and launch risk?"}>
        <span className="text-xs text-slate-600 cursor-help">What is price elasticity?</span>
      </TooltipWrapper>
    </div>
  );
}

function SkuCard({
  skuId,
  name,
  hmp,
  base_units,
  elasticity,
  hi_low,
  price,
  onChange,
  isLocked,
}: {
  skuId: string;
  name: string;
  hmp: number;
  base_units: number;
  elasticity: number;
  hi_low: [number, number];
  price: number;
  onChange: (skuId: string, price: number) => void;
  isLocked: boolean;
}) {
  const ref_price = useMemo(() => hmp * 1.2, [hmp]);

  return (
    <Card className="p-6 rounded-2xl shadow-md grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="md:col-span-2">
        <CardTitle className="text-slate-800 font-semibold">{name}</CardTitle>
      </div>

      {/* Benchmark strip */}
      <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 p-4 bg-white">
          <Label className="text-sm md:text-base text-slate-700 font-semibold">H&M Benchmark Price</Label>
          <div className="text-base font-medium text-slate-800">{currency(hmp)}</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4 bg-white">
          <Label className="text-sm md:text-base text-slate-700 font-semibold">High‑End Benchmark Range</Label>
          <div className="text-base font-medium text-slate-800">{currency(hi_low[0])} – {currency(hi_low[1])}</div>
        </div>
      </div>

      {/* LEFT – Decision inputs */}
      <div className="space-y-4">
        <Label className="text-slate-800 font-semibold">Recommended Retail Price (RRP) £</Label>
        <Input
          type="number"
          value={Number.isFinite(price) && price > 0 ? price : ''}
          step={1}
          onChange={(e) => onChange(skuId, parseFloat(e.target.value))}
          className="w-40"
          disabled={isLocked}
        />

        <Badge className={badgeColour(price, hmp)}>
          {percentGap(price, hmp)} vs H&M
        </Badge>

        <small className="text-slate-500 italic">
          Consider where your RRP positions you: below, near, or above H&M — and how far from the high‑end.
        </small>
      </div>

      {/* RIGHT – Live insight */}
      <div>
        <PricingMetrics
          price={price || 0}
          hmp={hmp}
          ref_price={ref_price}
          base_units={base_units}
          elasticity={elasticity}
        />
      </div>
    </Card>
  );
}

export default function Pricing({ gameSession, currentState }: PricingProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [pricingData, setPricingData] = useState(() => {
    const productData = currentState?.productData || {};
    const initialData: any = {};

    products.forEach((product) => {
      initialData[product.skuId] = {
        rrp: productData[product.skuId]?.rrp || '',
      };
    });

    return initialData;
  });

  // Load existing pricing data when currentState changes
  useEffect(() => {
    if (currentState?.productData) {
      const productData = currentState.productData;
      const newData: any = {};

      products.forEach((product) => {
        newData[product.skuId] = {
          rrp: productData[product.skuId]?.rrp || '',
        };
      });

      setPricingData(newData);
    }
  }, [currentState]);

  const updateStateMutation = useMutation({
    mutationFn: async (updates: any) => {
      await apiRequest('PATCH', `/api/game/${gameSession.id}/week/${currentState.weekNumber}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({
        title: "Saved",
        description: "Your pricing decisions have been saved.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to save pricing data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePriceChange = (productId: string, value: number) => {
    setPricingData((prev: any) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        rrp: value,
      },
    }));
  };

  const handleSave = () => {
    // Require all RRPs before locking
    const allSet = products.every(p => Number(pricingData[p.skuId]?.rrp) > 0);
    if (!allSet) {
      toast({
        title: "Set all RRPs",
        description: "Please enter an RRP for each SKU before locking.",
        variant: "destructive",
      });
      return;
    }

    const updates = {
      productData: {
        ...currentState?.productData,
        ...Object.fromEntries(
          products.map((p) => [
            p.skuId,
            {
              ...currentState?.productData?.[p.skuId],
              rrp: pricingData[p.skuId].rrp,
              rrpLocked: true,
            },
          ])
        ),
      },
    };
    updateStateMutation.mutate(updates);
  };

  const rrpsLocked = ['jacket', 'dress', 'pants'].every((p) => currentState?.productData?.[p]?.rrpLocked);
  const isLocked = rrpsLocked || (currentState?.weekNumber > 1);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-2">
          <DollarSign size={24} />
          Price Positioning
        </h1>
        <p className="text-slate-700 mb-2">
          Positioning is how your price signals brand intent and competitive stance. Set it first to anchor all downstream decisions.
        </p>
        <ul className="text-slate-700 text-sm list-disc ml-5 space-y-1">
          <li>Choose a compelling RRP for each SKU relative to H&M and the high‑end set.</li>
          <li>Watch how demand responds as you move up or down from the target zone.</li>
          <li>Consider: What price feels ‘accessible premium’? What trade‑offs in volume vs. status? How might this influence launch risk?</li>
        </ul>
        {isLocked && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
            <AlertCircle size={16} className="text-yellow-600" />
            <span className="text-sm text-yellow-800">
              RRPs are locked. You can proceed to the next steps.
            </span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {products.map((product) => {
          const price = parseFloat(pricingData[product.skuId]?.rrp) || 0;

          return (
            <SkuCard
              key={product.skuId}
              skuId={product.skuId}
              name={product.name}
              hmp={product.hmp}
              base_units={product.base_units}
              elasticity={product.elasticity}
              hi_low={product.hi_low}
              price={price}
              onChange={handlePriceChange}
              isLocked={isLocked}
            />
          );
        })}
      </div>

      {/* Lock Button */}
      <div className="flex justify-end mt-8">
        <Button
          onClick={handleSave}
          disabled={updateStateMutation.isPending || isLocked}
          className="flex items-center gap-2"
        >
          {updateStateMutation.isPending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Locking...
            </>
          ) : (
            <>
              <DollarSign size={16} />
              Lock RRP
            </>
          )}
        </Button>
      </div>
    </div>
  );
}