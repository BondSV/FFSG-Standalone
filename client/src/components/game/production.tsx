import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, Factory, Package, Truck } from "lucide-react";

interface ProductionProps {
  gameSession: any;
  currentState: any;
}

type Method = "inhouse" | "outsourced";

const WEEKS_ALL = Array.from({ length: 11 }, (_, i) => i + 3); // 3..13
const STANDARD_BATCH_UNITS = 25000;

export default function Production({ gameSession, currentState }: ProductionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Constants
  const { data: constants } = useQuery({ queryKey: ["/api/game/constants"] });
  const CAPACITY: number[] = (constants as any)?.CAPACITY_SCHEDULE || [];
  const MFG = (constants as any)?.MANUFACTURING || {};

  // Derived state
  const productData = currentState?.productData || {};
  const scheduledBatches: any[] = currentState?.productionSchedule?.batches || [];
  const materialPurchases: any[] = currentState?.materialPurchases || [];
  const rawMaterials: Record<string, any> = currentState?.rawMaterials || {};
  const currentWeek = Number(currentState?.weekNumber || 1);

  // UI state
  const [sku, setSku] = useState<string>(Object.keys(productData)[0] || "");
  const [method, setMethod] = useState<Method>("inhouse");
  const [startWeek, setStartWeek] = useState<number>(Math.max(3, currentWeek + 1));
  const [confirmPartial, setConfirmPartial] = useState(false);

  // Helpers
  const getLead = (p: string, m: Method) => (m === "inhouse" ? Number(MFG[p]?.inHouseTime || 2) : Number(MFG[p]?.outsourceTime || 1));
  const getUnitCost = (p: string, m: Method) => (m === "inhouse" ? Number(MFG[p]?.inHouseCost || 10) : Number(MFG[p]?.outsourceCost || 15));

  const allowedStartWeeks = WEEKS_ALL.filter((w) => w >= currentWeek + 1 && w <= 10);

  const fabricForSku: string | undefined = sku ? productData[sku]?.fabric : undefined;

  const availableFabricOn = (week: number): number => {
    if (!fabricForSku) return 0;
    const onHand = Number(rawMaterials?.[fabricForSku]?.onHand || 0);
    const arriving = materialPurchases.reduce((sum: number, p: any) => {
      if (Number(p.shipmentWeek) <= week) {
        const units = (p.orders || [])
          .filter((o: any) => o.material === fabricForSku)
          .reduce((s: number, o: any) => s + Number(o.quantity || 0), 0);
        return sum + units;
      }
      return sum;
    }, 0);
    // Subtract fabric already consumed by scheduled batches starting on/before week
    const consumed = scheduledBatches
      .filter((b) => productData[b.product]?.fabric === fabricForSku && Number(b.startWeek) <= week)
      .reduce((s, b) => s + Number(b.quantity || 0), 0);
    return Math.max(0, onHand + arriving - consumed);
  };

  // Capacity usage for in-house lane (W3..W13)
  const capacityByWeek = useMemo(() => {
    const map: Record<number, { capacity: number; used: number }> = {};
    for (const w of WEEKS_ALL) map[w] = { capacity: Number(CAPACITY[w - 1] || 0), used: 0 };
    for (const b of scheduledBatches) {
      if (b.method !== "inhouse") continue;
      const lead = getLead(b.product, "inhouse");
      for (let w = Number(b.startWeek); w < Number(b.startWeek) + lead; w++) {
        if (!map[w]) continue;
        // Each batch consumes 25k capacity per lead-time week, even if partial
        map[w].used += STANDARD_BATCH_UNITS;
      }
    }
    return map;
  }, [scheduledBatches, CAPACITY]);

  // Add batch mutation (DB-first)
  const addBatch = useMutation({
    mutationFn: async (batch: any) => {
      const next = [...scheduledBatches, batch];
      await apiRequest("POST", `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, {
        productionSchedule: { batches: next },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/game/current"] });
      toast({ title: "Batch added", description: "Production batch scheduled." });
      setConfirmPartial(false);
    },
    onError: (e: any) => {
      if (isUnauthorizedError(e)) {
        toast({ title: "Unauthorized", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
      } else {
        toast({ title: "Failed", description: "Could not schedule batch.", variant: "destructive" });
      }
    },
  });

  const handleAdd = () => {
    if (!sku || !method || !allowedStartWeeks.includes(startWeek)) {
      toast({ title: "Missing", description: "Select SKU, method, and valid start week.", variant: "destructive" });
      return;
    }

    const lead = getLead(sku, method);
    // In-house capacity validation (25k per week)
    if (method === "inhouse") {
      for (let w = startWeek; w < startWeek + lead; w++) {
        const cap = capacityByWeek[w]?.capacity || 0;
        const used = capacityByWeek[w]?.used || 0;
        if (used + STANDARD_BATCH_UNITS > cap) {
          toast({ title: "Capacity exceeded", description: `Week ${w} free: ${(cap - used).toLocaleString()} units`, variant: "destructive" });
          return;
        }
      }
    }

    // Fabrics sufficiency logic
    const avail = availableFabricOn(startWeek);
    let quantity = STANDARD_BATCH_UNITS;
    if (avail < STANDARD_BATCH_UNITS) {
      if (avail <= 0) {
        toast({ title: "No fabrics", description: `Insufficient ${fabricForSku} by Week ${startWeek}.`, variant: "destructive" });
        return;
      }
      if (!confirmPartial) {
        setConfirmPartial(true);
        toast({
          title: "Partial batch possible",
          description: `Only ${avail.toLocaleString()} units available. Running partial will consume full in‑house capacity and full 25k production cost. Confirm to proceed and click Add again.`,
        });
        return;
      }
      quantity = avail; // partial batch
    }

    const batch = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      product: sku,
      method,
      startWeek,
      quantity,
      createdAt: new Date().toISOString(),
    };
    addBatch.mutate(batch);
  };

  const removeBatch = useMutation({
    mutationFn: async (id: string) => {
      const next = scheduledBatches.filter((b) => String(b.id) !== String(id));
      await apiRequest("POST", `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, {
        productionSchedule: { batches: next },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/game/current"] });
    },
  });

  // UI
  return (
    <div className="p-6">
      {/* Intro */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Production</h1>
        <p className="text-sm text-gray-600">Plan manufacturing for Weeks 3–13. Starts allowed for next week through Week 10. In‑house capacity is shared across SKUs; outsourced is uncapped.</p>
      </div>

      {/* Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {(["jacket", "dress", "pants"] as const).map((p) => (
          <Card key={p} className="p-3">
            <div className="flex items-center justify-between mb-1"><span className="font-medium">{p.charAt(0).toUpperCase() + p.slice(1)}</span><Badge variant="secondary">SKU</Badge></div>
            <div className="text-xs text-gray-600 grid grid-cols-2 gap-y-1">
              <div>Lead (in‑house)</div>
              <div className="text-right">{MFG[p]?.inHouseTime || 2} w</div>
              <div>Lead (outsourced)</div>
              <div className="text-right">{MFG[p]?.outsourceTime || 1} w</div>
              <div>Cost (in‑house)</div>
              <div className="text-right">£{Number(MFG[p]?.inHouseCost || 10).toLocaleString()}</div>
              <div>Cost (outsourced)</div>
              <div className="text-right">£{Number(MFG[p]?.outsourceCost || 15).toLocaleString()}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left column: Planner + Info */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="p-4">
            <div className="font-medium mb-3">Batch Planner</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <div className="text-xs text-gray-600 mb-1">SKU</div>
                <Select value={sku} onValueChange={setSku}>
                  <SelectTrigger><SelectValue placeholder="Select SKU" /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(productData).map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Method</div>
                <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inhouse">In‑house</SelectItem>
                    <SelectItem value="outsourced">Outsourced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Start week</div>
                <Select value={String(startWeek)} onValueChange={(v) => setStartWeek(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allowedStartWeeks.map((w) => (<SelectItem key={w} value={String(w)}>W{w}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleAdd} disabled={addBatch.isPending || !sku || !method || !allowedStartWeeks.includes(startWeek)} className="w-full">Add batch</Button>
              </div>
            </div>
            {confirmPartial && (
              <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5" />
                <div>Partial batch mode: this will consume full in‑house capacity and full 25k production cost; per‑unit cost will be higher.</div>
              </div>
            )}
            {/* Feasibility */}
            <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
              <div className="bg-gray-50 border rounded p-2">
                <div className="text-gray-600">Fabrics on W{startWeek}</div>
                <div className="font-mono">{availableFabricOn(startWeek).toLocaleString()} u</div>
              </div>
              <div className="bg-gray-50 border rounded p-2">
                <div className="text-gray-600">Lead time</div>
                <div className="font-mono">{getLead(sku, method)} w</div>
              </div>
              <div className="bg-gray-50 border rounded p-2">
                <div className="text-gray-600">Unit prod cost</div>
                <div className="font-mono">£{getUnitCost(sku, method).toLocaleString()}</div>
              </div>
            </div>
          </Card>

          {/* Info Panels */}
          <Card className="p-4">
            <div className="font-medium mb-2">Materials</div>
            <div className="text-xs grid grid-cols-2 gap-y-1">
              <div>On‑hand ({fabricForSku || "—"})</div>
              <div className="text-right font-mono">{Number(rawMaterials?.[fabricForSku || ""]?.onHand || 0).toLocaleString()} u</div>
              <div>Arrivals ≤ W{startWeek}</div>
              <div className="text-right font-mono">{materialPurchases.reduce((s, p) => s + ((p.shipmentWeek <= startWeek) ? (p.orders || []).filter((o: any) => o.material === fabricForSku).reduce((ss: number, o: any) => ss + Number(o.quantity || 0), 0) : 0), 0).toLocaleString()} u</div>
            </div>
            <Separator className="my-3" />
            <div className="font-medium mb-2">WIP & FG</div>
            <div className="text-xs grid grid-cols-2 gap-y-1">
              <div>Total WIP (started)</div>
              <div className="text-right font-mono">{scheduledBatches.filter((b) => Number(b.startWeek) <= currentWeek).reduce((s, b) => s + Number(b.quantity || 0), 0).toLocaleString()} u</div>
              <div>Scheduled (future)</div>
              <div className="text-right font-mono">{scheduledBatches.filter((b) => Number(b.startWeek) > currentWeek).reduce((s, b) => s + Number(b.quantity || 0), 0).toLocaleString()} u</div>
            </div>
          </Card>
        </div>

        {/* Right column: Schedule board */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-4">
            <div className="font-medium mb-3">Production Schedule (W3–W13)</div>
            {/* In-house lane */}
            <div className="mb-3">
              <div className="text-xs text-gray-600 mb-1">In‑house (capacity shared)</div>
              <div className="grid grid-cols-11 gap-2">
                {WEEKS_ALL.map((w) => {
                  const cap = capacityByWeek[w]?.capacity || 0;
                  const used = capacityByWeek[w]?.used || 0;
                  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
                  return (
                    <div key={`ih-${w}`} className="border rounded p-2">
                      <div className="text-[10px] text-gray-600 mb-1">W{w}</div>
                      <div className="h-2 w-full bg-gray-200 rounded overflow-hidden">
                        <div className={`h-full ${pct >= 80 ? 'bg-red-600' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1 text-[10px] font-mono text-right">{used.toLocaleString()}/{cap.toLocaleString()}</div>
                      {/* chips for this week */}
                      <div className="mt-2 space-y-1">
                        {scheduledBatches.filter((b) => b.method === 'inhouse' && w >= b.startWeek && w < b.startWeek + getLead(b.product, 'inhouse')).map((b) => (
                          <div key={b.id} className="text-[10px] px-2 py-1 rounded bg-red-50 border border-red-200 flex items-center justify-between">
                            <span>{b.product}</span>
                            <button className="text-red-600" onClick={() => removeBatch.mutate(b.id)}>Remove</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Outsourced lane */}
            <div>
              <div className="text-xs text-gray-600 mb-1">Outsourced (uncapped)</div>
              <div className="grid grid-cols-11 gap-2">
                {WEEKS_ALL.map((w) => (
                  <div key={`os-${w}`} className="border rounded p-2">
                    <div className="text-[10px] text-gray-600 mb-2">W{w}</div>
                    <div className="space-y-1">
                      {scheduledBatches.filter((b) => b.method === 'outsourced' && Number(b.startWeek) === w).map((b) => (
                        <div key={b.id} className="text-[10px] px-2 py-1 rounded border border-gray-400 flex items-center justify-between">
                          <span>{b.product}</span>
                          <button className="text-red-600" onClick={() => removeBatch.mutate(b.id)}>Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Scheduled list (compact) */}
          <Card className="p-4">
            <div className="font-medium mb-2">All Batches</div>
            {scheduledBatches.length === 0 ? (
              <div className="text-sm text-gray-500">No batches scheduled.</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 text-sm">
                {scheduledBatches.map((b) => (
                  <div key={b.id} className="border rounded p-2 grid grid-cols-6 gap-2 items-center">
                    <div className="text-xs"><Badge variant={b.method === 'inhouse' ? 'default' : 'secondary'}>{b.method === 'inhouse' ? 'IH' : 'OS'}</Badge></div>
                    <div>{b.product}</div>
                    <div>Start W{b.startWeek}</div>
                    <div>Qty {Number(b.quantity || 0).toLocaleString()}</div>
                    <div className="text-right font-mono text-xs">£{getUnitCost(b.product, b.method).toLocaleString()}/u</div>
                    <div className="text-right"><Button variant="outline" size="sm" onClick={() => removeBatch.mutate(b.id)}>Remove</Button></div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Factory, Zap, Calendar, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";

interface ProductionProps {
  gameSession: any;
  currentState: any;
}

export default function Production({ gameSession, currentState }: ProductionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state for new production batch
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [selectedStartWeek, setSelectedStartWeek] = useState<string>('');
  const [selectedBatches, setSelectedBatches] = useState<number>(1);

  // Get game constants
  const { data: gameConstants } = useQuery({
    queryKey: ['/api/game/constants'],
  });

  const capacitySchedule = (gameConstants as any)?.CAPACITY_SCHEDULE || [0, 0, 25000, 50000, 100000, 100000, 150000, 150000, 200000, 200000, 100000, 50000, 0, 0, 0];
  const manufacturingCosts = (gameConstants as any)?.MANUFACTURING || {};

  // Calculate capacity usage from scheduled batches
  const scheduledBatches = currentState?.productionSchedule?.batches || [];
  
  const getCapacityData = () => {
    const weeks = [3, 4, 5, 6, 7, 8];
    return weeks.map(week => {
      const capacity = capacitySchedule[week - 1] || 0;
      const used = scheduledBatches
        .filter((batch: any) => {
          if (batch.method !== 'inhouse') return false;
          // Check if this batch occupies this week
          const batchStart = batch.startWeek;
          const batchDuration = manufacturingCosts[batch.product]?.inHouseTime || 2;
          return week >= batchStart && week < batchStart + batchDuration;
        })
        .reduce((total: number, batch: any) => {
          const batchDuration = manufacturingCosts[batch.product]?.inHouseTime || 2;
          return total + Math.ceil((batch.quantity || 0) / batchDuration);
        }, 0);
      
      return { week, capacity, used };
    });
  };

  const capacityData = getCapacityData();

  const getCapacityPercentage = (used: number, capacity: number) => {
    return capacity > 0 ? (used / capacity) * 100 : 0;
  };

  // Get available materials from inventory
  const materialInventory = currentState?.materialInventory || {};
  const productData = currentState?.productData || {};

  // Production batch mutation
  const addBatchMutation = useMutation({
    mutationFn: async (batch: any) => {
      await apiRequest('POST', `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, {
        productionSchedule: {
          batches: [
            ...scheduledBatches,
            batch
          ]
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/game/current'] });
      toast({
        title: "Production Batch Scheduled",
        description: `${(selectedBatches * 25000).toLocaleString()} units (${selectedBatches} batch${selectedBatches > 1 ? 'es' : ''}) scheduled for production.`,
      });
      // Reset form
      setSelectedProduct('');
      setSelectedMethod('');
      setSelectedStartWeek('');
      setSelectedBatches(1);
    },
    onError: (error: any) => {
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
        description: "Failed to schedule production batch. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddBatch = () => {
    if (!selectedProduct || !selectedMethod || !selectedStartWeek) {
      toast({
        title: "Missing Information",
        description: "Please select product, method, and start week.",
        variant: "destructive",
      });
      return;
    }

    const startWeek = parseInt(selectedStartWeek);
    const currentWeek = currentState?.weekNumber || 1;
    const totalUnits = selectedBatches * 25000;
    
    if (startWeek < currentWeek) {
      toast({
        title: "Invalid Start Week",
        description: "Cannot schedule production for past weeks.",
        variant: "destructive",
      });
      return;
    }

    // Check material availability - materials must arrive before or during production start
    const productMaterial = productData[selectedProduct]?.fabric;
    if (productMaterial) {
      const materialPurchases = currentState?.materialPurchases || [];
      const availableMaterials = materialPurchases.filter((purchase: any) => 
        purchase.shipmentWeek <= startWeek && 
        purchase.orders?.some((order: any) => order.material === productMaterial)
      );
      
      if (availableMaterials.length === 0) {
        toast({
          title: "Materials Not Available",
          description: `${productMaterial} materials will not be available by Week ${startWeek}. Check your material purchase schedule.`,
          variant: "destructive",
        });
        return;
      }
    }

    // Get production duration for capacity checking
    const productionTime = selectedMethod === 'inhouse' 
      ? manufacturingCosts[selectedProduct]?.inHouseTime || 2
      : manufacturingCosts[selectedProduct]?.outsourceTime || 1;

    // Check capacity for in-house production across all production weeks
    if (selectedMethod === 'inhouse') {
      const unitsPerWeek = Math.ceil(totalUnits / productionTime);
      
      for (let week = startWeek; week < startWeek + productionTime; week++) {
        const weekCapacity = capacitySchedule[week - 1] || 0;
        const weekUsed = scheduledBatches
          .filter((batch: any) => {
            // Check if this batch occupies this week
            const batchStart = batch.startWeek;
            const batchDuration = batch.method === 'inhouse' 
              ? manufacturingCosts[batch.product]?.inHouseTime || 2
              : manufacturingCosts[batch.product]?.outsourceTime || 1;
            return batch.method === 'inhouse' && week >= batchStart && week < batchStart + batchDuration;
          })
          .reduce((total: number, batch: any) => {
            const batchDuration = batch.method === 'inhouse' 
              ? manufacturingCosts[batch.product]?.inHouseTime || 2
              : manufacturingCosts[batch.product]?.outsourceTime || 1;
            return total + Math.ceil((batch.quantity || 0) / batchDuration);
          }, 0);
        
        if (weekUsed + unitsPerWeek > weekCapacity) {
          toast({
            title: "Capacity Exceeded",
            description: `Week ${week} has insufficient capacity. Available: ${(weekCapacity - weekUsed).toLocaleString()} units, needed: ${unitsPerWeek.toLocaleString()} units.`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    // Calculate completion week and cost
    const completionWeek = startWeek + productionTime;
    
    const unitCost = selectedMethod === 'inhouse'
      ? manufacturingCosts[selectedProduct]?.inHouseCost || 10
      : manufacturingCosts[selectedProduct]?.outsourceCost || 15;
    
    const totalCost = totalUnits * unitCost;

    const batch = {
      id: Date.now().toString(),
      product: selectedProduct,
      method: selectedMethod,
      startWeek,
      completionWeek,
      quantity: totalUnits,
      batches: selectedBatches,
      unitCost,
      totalCost,
      status: 'scheduled',
      timestamp: new Date().toISOString(),
    };

    addBatchMutation.mutate(batch);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getProductName = (productKey: string) => {
    const names = {
      jacket: "Vintage Denim Jacket",
      dress: "Floral Print Dress", 
      pants: "Corduroy Pants"
    };
    return names[productKey as keyof typeof names] || productKey;
  };

  const getBatchStatus = (batch: any) => {
    const currentWeek = currentState?.weekNumber || 1;
    if (batch.completionWeek <= currentWeek) {
      return { status: 'completed', color: 'bg-green-100 text-green-800', icon: CheckCircle2 };
    } else if (batch.startWeek <= currentWeek) {
      return { status: 'in-progress', color: 'bg-blue-100 text-blue-800', icon: Clock };
    } else {
      return { status: 'scheduled', color: 'bg-gray-100 text-gray-800', icon: Calendar };
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Production Planning</h1>
        <p className="text-gray-600">Schedule production batches to meet launch deadline (Week 7)</p>
      </div>

      {/* Production Options */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* In-house Production */}
        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Factory size={20} />
              <TooltipWrapper content="Your own manufacturing facility. It is cheaper per unit but has limited weekly capacity and longer production lead times (2-3 weeks).">
                <span className="cursor-help">In-house Production</span>
              </TooltipWrapper>
            </CardTitle>
            <p className="text-sm text-gray-600">Lower cost, longer lead times, capacity constraints</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Cost per unit:</span>
                <div className="font-medium">£8.00 - £15.00</div>
              </div>
              <div>
                <span className="text-gray-600">Lead time:</span>
                <div className="font-medium">2-3 weeks</div>
              </div>
              <div>
                <span className="text-gray-600">Batch size:</span>
                <div className="font-medium text-primary">25,000 units (fixed)</div>
              </div>
              <div>
                <span className="text-gray-600">Capacity:</span>
                <div className="font-medium">Variable by week</div>
              </div>
            </div>
            
            {/* Capacity Timeline */}
            <div className="pt-4 border-t border-gray-100">
              <h4 className="font-medium text-gray-900 mb-3">
                <TooltipWrapper content="The maximum number of units your in-house facility can produce each week. You cannot schedule more production than the available capacity.">
                  <span className="cursor-help">Weekly Capacity Schedule</span>
                </TooltipWrapper>
              </h4>
              <div className="space-y-2">
                {capacityData.map((week) => (
                  <div key={week.week} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Week {week.week}:</span>
                    <div className="flex items-center gap-2 flex-1 max-w-32">
                      <Progress 
                        value={getCapacityPercentage(week.used, week.capacity)} 
                        className="flex-1 h-2" 
                      />
                      <span className="font-mono text-xs">
                        {week.used.toLocaleString()}/{week.capacity.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outsourced Production */}
        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap size={20} />
              <TooltipWrapper content="A third-party manufacturer. It is more expensive per unit but offers unlimited capacity and very fast lead times (1 week). Use this to quickly respond to demand or meet tight deadlines.">
                <span className="cursor-help">Outsourced Production</span>
              </TooltipWrapper>
            </CardTitle>
            <p className="text-sm text-gray-600">Higher cost, faster delivery, unlimited capacity</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Cost per unit:</span>
                <div className="font-medium">£14.00 - £25.00</div>
              </div>
              <div>
                <span className="text-gray-600">Lead time:</span>
                <div className="font-medium">1 week</div>
              </div>
              <div>
                <span className="text-gray-600">Capacity:</span>
                <div className="font-medium text-secondary">Unlimited</div>
              </div>
              <div>
                <span className="text-gray-600">Batch size:</span>
                <div className="font-medium text-primary">25,000 units (fixed)</div>
              </div>
            </div>
            
            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center p-3 bg-secondary bg-opacity-10 rounded-lg">
                <Zap className="text-secondary mr-3" size={20} />
                <div>
                  <div className="font-medium text-secondary">Fast Track Available</div>
                  <div className="text-sm text-gray-600">Perfect for tight deadlines</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Production Schedule */}
      <Card className="border border-gray-100">
        <CardHeader>
          <CardTitle>Production Schedule</CardTitle>
          <p className="text-sm text-gray-600">Plan your production batches to meet the Week 7 launch deadline</p>
        </CardHeader>
        <CardContent>
          {/* Add Production Batch */}
          <div className="mb-6 p-4 border border-gray-200 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-4">Schedule New Production Batch</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(productData).length > 0 ? (
                      Object.keys(productData).map(product => (
                        <SelectItem key={product} value={product}>
                          {getProductName(product)}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>Complete design phase first</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <Select value={selectedBatches.toString()} onValueChange={(value) => setSelectedBatches(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select batches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 batch (25,000 units)</SelectItem>
                    <SelectItem value="2">2 batches (50,000 units)</SelectItem>
                    <SelectItem value="3">3 batches (75,000 units)</SelectItem>
                    <SelectItem value="4">4 batches (100,000 units)</SelectItem>
                    <SelectItem value="5">5 batches (125,000 units)</SelectItem>
                    <SelectItem value="6">6 batches (150,000 units)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">Each batch = 25,000 units</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Production Method</label>
                <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inhouse">
                      In-house ({manufacturingCosts[selectedProduct]?.inHouseTime || 2}-3 weeks, {formatCurrency(manufacturingCosts[selectedProduct]?.inHouseCost || 10)}/unit)
                    </SelectItem>
                    <SelectItem value="outsourced">
                      Outsourced ({manufacturingCosts[selectedProduct]?.outsourceTime || 1} week, {formatCurrency(manufacturingCosts[selectedProduct]?.outsourceCost || 15)}/unit)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Week</label>
                <Select value={selectedStartWeek} onValueChange={setSelectedStartWeek}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select week" />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 4, 5, 6].filter(week => week >= (currentState?.weekNumber || 1)).map(week => (
                      <SelectItem key={week} value={week.toString()}>
                        Week {week}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button 
                  className="w-full" 
                  onClick={handleAddBatch}
                  disabled={addBatchMutation.isPending || !selectedProduct || !selectedMethod || !selectedStartWeek}
                >
                  {addBatchMutation.isPending ? "Scheduling..." : `Schedule ${selectedBatches} Batch${selectedBatches > 1 ? 'es' : ''}`}
                </Button>
              </div>
            </div>
            
            {selectedProduct && selectedMethod && selectedStartWeek && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Batch Preview</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <div>• Product: {getProductName(selectedProduct)}</div>
                  <div>• Quantity: {(selectedBatches * 25000).toLocaleString()} units ({selectedBatches} batch{selectedBatches > 1 ? 'es' : ''})</div>
                  <div>• Total Cost: {formatCurrency((selectedBatches * 25000) * (selectedMethod === 'inhouse' ? (manufacturingCosts[selectedProduct]?.inHouseCost || 10) : (manufacturingCosts[selectedProduct]?.outsourceCost || 15)))}</div>
                  <div>• Completion: Week {parseInt(selectedStartWeek) + (selectedMethod === 'inhouse' ? (manufacturingCosts[selectedProduct]?.inHouseTime || 2) : (manufacturingCosts[selectedProduct]?.outsourceTime || 1))}</div>
                  
                  {/* Material availability check */}
                  {(() => {
                    const productMaterial = productData[selectedProduct]?.fabric;
                    const materialPurchases = currentState?.materialPurchases || [];
                    const materialAvailable = materialPurchases.some((purchase: any) => 
                      purchase.shipmentWeek <= parseInt(selectedStartWeek) && 
                      purchase.orders?.some((order: any) => order.material === productMaterial)
                    );
                    
                    return (
                      <div className={`flex items-center gap-2 ${materialAvailable ? 'text-green-700' : 'text-red-700'}`}>
                        {materialAvailable ? '✓' : '⚠'} Materials ({productMaterial}): {materialAvailable ? 'Available' : 'Not available by start week'}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Scheduled Batches */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Scheduled Production Batches</h3>
            {scheduledBatches.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Factory className="mx-auto mb-2" size={48} />
                <p>No production batches scheduled yet</p>
                <p className="text-sm">Add your first batch above to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledBatches.map((batch: any) => {
                  const statusInfo = getBatchStatus(batch);
                  const StatusIcon = statusInfo.icon;
                  
                  return (
                    <div key={batch.id} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <StatusIcon size={20} className="text-gray-600" />
                          <div>
                            <h4 className="font-medium text-gray-900">{getProductName(batch.product)}</h4>
                            <p className="text-sm text-gray-600">
                              {batch.quantity?.toLocaleString()} units 
                              {batch.batches && ` (${batch.batches} batch${batch.batches > 1 ? 'es' : ''})`}
                            </p>
                          </div>
                        </div>
                        <Badge className={statusInfo.color}>
                          {statusInfo.status.replace('-', ' ')}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Method:</span>
                          <div className="font-medium">{batch.method === 'inhouse' ? 'In-house' : 'Outsourced'}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Start Week:</span>
                          <div className="font-medium">Week {batch.startWeek}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Completion:</span>
                          <div className="font-medium">Week {batch.completionWeek}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Total Cost:</span>
                          <div className="font-medium">{formatCurrency(batch.totalCost || 0)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
