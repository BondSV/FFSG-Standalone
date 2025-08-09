import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Palette, Shirt, AlertCircle } from "lucide-react";

interface DesignProps {
  gameSession: any;
  currentState: any;
}

const products = [
  {
    id: 'jacket',
    name: 'Vintage Denim Jacket',
    forecast: 100000,
    hmPriceKey: 'jacket',
    fabricOptions: [
      { id: 'selvedgeDenim', name: 'Selvedge Denim', description: 'Premium, authentic vintage appeal' },
      { id: 'standardDenim', name: 'Standard Denim', description: 'Durable and cost‑effective' },
    ],
  },
  {
    id: 'dress',
    name: 'Floral Print Dress',
    forecast: 150000,
    hmPriceKey: 'dress',
    fabricOptions: [
      { id: 'egyptianCotton', name: 'Egyptian Cotton', description: 'Luxurious, breathable' },
      { id: 'polyesterBlend', name: 'Polyester Blend', description: 'Easy care, great value' },
    ],
  },
  {
    id: 'pants',
    name: 'Corduroy Pants',
    forecast: 120000,
    hmPriceKey: 'pants',
    fabricOptions: [
      { id: 'fineWaleCorduroy', name: 'Fine‑Wale Corduroy', description: 'Premium texture' },
      { id: 'wideWaleCorduroy', name: 'Wide‑Wale Corduroy', description: 'Classic, more affordable' },
    ],
  },
];

// Demand helpers matched to Price Positioning behavior
const UNIFIED_ELASTICITY = -1.40;
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function round(value: number) { return Math.round(value); }
function currency(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
}
function computePositionEffect(price: number, ref_price: number): number {
  const signedDelta = (price / ref_price) - 1;
  const delta = Math.abs(signedDelta);
  const ceil = 0.95, p = 3, s = 0.21;
  const base = 1 - Math.exp(-Math.pow(delta / s, p));
  const bump = 40 * (delta * delta) * Math.exp(-Math.pow(delta / 0.08, 2));
  const magnitude = Math.min(1, ceil * base + bump);
  const raw = 1 + (signedDelta < 0 ? magnitude : -magnitude);
  return clamp(raw, 0, 2);
}

// Small demand lift by fabric quality, and optional print lift
const fabricDemandLift: Record<string, number> = {
  selvedgeDenim: 0.06,
  standardDenim: 0.00,
  egyptianCotton: 0.05,
  polyesterBlend: -0.02,
  fineWaleCorduroy: 0.04,
  wideWaleCorduroy: 0.00,
};
const printDemandLift = 0.03;

export default function Design({ gameSession, currentState }: DesignProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load constants for material prices and product anchors
  const { data: constants } = useQuery({ queryKey: ['/api/game/constants'] });

  const [designData, setDesignData] = useState(() => {
    const productData = currentState?.productData || {};
    const initialData: any = {};
    products.forEach(product => {
      initialData[product.id] = {
        fabric: productData[product.id]?.fabric || '',
        hasPrint: productData[product.id]?.hasPrint || false,
      };
    });
    return initialData;
  });

  // Load existing design data when currentState changes
  useEffect(() => {
    if (currentState?.productData) {
      const productData = currentState.productData;
      const newData: any = {};
      products.forEach(product => {
        newData[product.id] = {
          fabric: productData[product.id]?.fabric || '',
          hasPrint: productData[product.id]?.hasPrint || false,
        };
      });
      setDesignData(newData);
    }
  }, [currentState]);

  const getAvgMaterialPrice = (materialId: string): number => {
    if (!constants) return 0;
    const s1 = (constants.SUPPLIERS?.supplier1?.materials || {})[materialId]?.price;
    const s2 = (constants.SUPPLIERS?.supplier2?.materials || {})[materialId]?.price;
    const vals = [s1, s2].filter((v) => typeof v === 'number');
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + (b as number), 0) / vals.length;
  };
  const getAvgPrintSurcharge = (materialId: string): number => {
    if (!constants) return 0;
    const s1 = (constants.SUPPLIERS?.supplier1?.materials || {})[materialId]?.printSurcharge;
    const s2 = (constants.SUPPLIERS?.supplier2?.materials || {})[materialId]?.printSurcharge;
    const vals = [s1, s2].filter((v) => typeof v === 'number');
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + (b as number), 0) / vals.length;
  };
  const getMaterialAvailability = (materialId: string): 'both' | 'supplier1' | 'supplier2' | 'none' => {
    const s1 = Boolean(constants?.SUPPLIERS?.supplier1?.materials?.[materialId]);
    const s2 = Boolean(constants?.SUPPLIERS?.supplier2?.materials?.[materialId]);
    if (s1 && s2) return 'both';
    if (s1) return 'supplier1';
    if (s2) return 'supplier2';
    return 'none';
  };

  const projectedDemand = (productId: string, fabricId: string | undefined, hasPrint: boolean): number | null => {
    if (!constants) return null;
    const p = products.find((x) => x.id === productId)!;
    const rrp = Number(currentState?.productData?.[productId]?.rrp);
    if (!rrp) return null;
    const hm = constants.PRODUCTS?.[productId]?.hmPrice || 0;
    const ref = hm * 1.2;
    const baseUnits = p.forecast;
    const priceEffect = Math.pow(rrp / ref, UNIFIED_ELASTICITY);
    const positionEffect = computePositionEffect(rrp, ref);
    const fabricLift = fabricDemandLift[fabricId || ''] || 0;
    const designEffect = 1 + fabricLift + (hasPrint ? printDemandLift : 0);
    const units = baseUnits * priceEffect * positionEffect * designEffect;
    const pct = clamp(units / baseUnits, 0, 2);
    return round(baseUnits * pct);
  };

  const updateStateMutation = useMutation({
    mutationFn: async (updates: any) => {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({
        title: "Saved",
        description: "Your design decisions have been saved.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to save design data. Please try again.", variant: "destructive" });
    },
  });

  const handleFabricChange = (productId: string, fabric: string) => {
    setDesignData((prev: any) => ({ ...prev, [productId]: { ...prev[productId], fabric } }));
  };
  const handlePrintChange = (productId: string, hasPrint: boolean) => {
    setDesignData((prev: any) => ({ ...prev, [productId]: { ...prev[productId], hasPrint } }));
  };

  const handleSave = () => {
    // Persist selected fabric/print and a reference confirmedMaterialCost (avg base + print surcharge)
    const updates = {
      productData: {
        ...currentState?.productData,
        ...Object.fromEntries(
          products.map((prod) => {
            const sel = designData[prod.id] || {};
            const base = sel.fabric ? getAvgMaterialPrice(sel.fabric) : 0;
            const surcharge = sel.fabric && sel.hasPrint ? getAvgPrintSurcharge(sel.fabric) : 0;
            const confirmedMaterialCost = base + surcharge;
            return [
              prod.id,
              {
                ...currentState?.productData?.[prod.id],
                fabric: sel.fabric || '',
                hasPrint: !!sel.hasPrint,
                confirmedMaterialCost,
              },
            ];
          })
        ),
      },
    };
    updateStateMutation.mutate(updates);
  };

  const isLocked = currentState?.weekNumber > 1;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Palette size={24} />
          Product Design
        </h1>
        <p className="text-gray-700">Choose materials and features. Each choice shows a reference material cost and its demand influence. Forecast updates live using your locked RRP.</p>
        {isLocked && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
            <AlertCircle size={16} className="text-yellow-600" />
            <span className="text-sm text-yellow-800">Design decisions are locked after Week 1. Current designs are final.</span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {products.map((product) => {
          const sel = designData[product.id] || {};
          const base = sel.fabric ? getAvgMaterialPrice(sel.fabric) : 0;
          const surcharge = sel.fabric && sel.hasPrint ? getAvgPrintSurcharge(sel.fabric) : 0;
          const projected = projectedDemand(product.id, sel.fabric, !!sel.hasPrint);

          return (
            <Card key={product.id} className="border border-gray-100">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><Shirt size={20} /> {product.name}</span>
                  <span className="text-sm text-gray-600">Baseline demand: {product.forecast.toLocaleString()} units</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Fabric Selection */}
                <div className="space-y-3">
                  <Label className="text-base font-medium">Fabric Choice</Label>
                  <RadioGroup
                    value={sel.fabric || ''}
                    onValueChange={(value) => handleFabricChange(product.id, value)}
                    disabled={isLocked}
                    className="space-y-2"
                  >
                    {product.fabricOptions.map((fabric) => {
                      const matCost = getAvgMaterialPrice(fabric.id);
                      const lift = fabricDemandLift[fabric.id] || 0;
                      const avail = getMaterialAvailability(fabric.id);
                      const availText = avail === 'both' ? 'Both suppliers' : avail === 'supplier1' ? 'Only Supplier‑1' : avail === 'supplier2' ? 'Only Supplier‑2' : 'Availability TBD';
                      const availClass = avail === 'both' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-800';
                      const availTip = avail === 'both' ? 'Available from both suppliers for maximum flexibility.' : `Only available from ${avail === 'supplier1' ? 'Supplier‑1' : 'Supplier‑2'}. This may limit procurement options or require mixed sourcing across SKUs.`;
                      return (
                        <div key={fabric.id} className="flex items-center justify-between p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
                          <div className="flex items-center gap-3 min-w-0">
                            <RadioGroupItem value={fabric.id} id={`${product.id}-${fabric.id}`} disabled={isLocked} />
                            <div className="truncate">
                              <Label htmlFor={`${product.id}-${fabric.id}`} className="font-medium cursor-pointer truncate">{fabric.name}</Label>
                              <div className="text-xs text-gray-500 truncate">{fabric.description}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs whitespace-nowrap">
                            <span className="px-2 py-1 rounded bg-gray-100 text-gray-700">Ref cost {currency(matCost)}</span>
                            <span className={`px-2 py-1 rounded ${lift >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>Demand {lift >= 0 ? `+${Math.round(lift*100)}%` : `${Math.round(lift*100)}%`}</span>
                            <TooltipWrapper content={availTip}>
                              <span className={`px-2 py-1 rounded ${availClass}`}>{availText}</span>
                            </TooltipWrapper>
                          </div>
                        </div>
                      );
                    })}
                  </RadioGroup>
                </div>

                {/* Print Option */}
                <div className="space-y-2">
                  <Label className="text-base font-medium">Design Feature</Label>
                  <div className="flex items-center justify-between p-2 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Checkbox id={`print-${product.id}`} checked={!!sel.hasPrint} onCheckedChange={(checked) => handlePrintChange(product.id, !!checked)} disabled={isLocked} />
                      <Label htmlFor={`print-${product.id}`} className="font-medium cursor-pointer">Add Custom Print/Pattern</Label>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="px-2 py-1 rounded bg-gray-100 text-gray-700">Surcharge {currency(sel.fabric ? getAvgPrintSurcharge(sel.fabric) : 0)}</span>
                      <span className="px-2 py-1 rounded bg-green-100 text-green-700">Demand +{Math.round(printDemandLift*100)}%</span>
                    </div>
                  </div>
                </div>

                {/* Live Metrics */}
                {(sel.fabric || sel.hasPrint) && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                    <div>
                      <div className="text-blue-900 font-medium">Ref material cost</div>
                      <div className="text-blue-800">{currency(base)}{surcharge ? ` + ${currency(surcharge)}` : ''}</div>
                    </div>
                    <div>
                      <div className="text-blue-900 font-medium">Projected demand</div>
                      <div className="text-blue-800">{projected != null ? `${projected.toLocaleString()} units` : '—'}</div>
                    </div>
                    <div>
                      <div className="text-blue-900 font-medium">Your RRP</div>
                      <div className="text-blue-800">{currentState?.productData?.[product.id]?.rrp ? currency(Number(currentState.productData[product.id].rrp)) : '—'}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Save Button */}
      <div className="flex justify-end mt-8">
        <Button onClick={handleSave} disabled={updateStateMutation.isPending || isLocked} className="flex items-center gap-2">
          {updateStateMutation.isPending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Saving...
            </>
          ) : (
            <>
              <Palette size={16} />
              Save Design Choices
            </>
          )}
        </Button>
      </div>
    </div>
  );
}