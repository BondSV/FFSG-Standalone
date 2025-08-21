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
import { AlertTriangle, Factory, Package, BarChart3, List } from "lucide-react";

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
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

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

  // Drag-n-drop utils
  const placeChain = async (chainId: string, newStart: number) => {
    const moving = scheduledBatches.find((b) => String(b.id) === String(chainId));
    if (!moving) return;
    const lead = getLead(moving.product, moving.method);
    if (moving.method !== 'inhouse') {
      // Outsourced: just change start within window
      if (newStart < currentWeek + 1 || newStart > 10) return;
      const next = scheduledBatches.map((b) => (b.id === moving.id ? { ...b, startWeek: newStart } : b));
      await apiRequest("POST", `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, { productionSchedule: { batches: next } });
      queryClient.invalidateQueries({ queryKey: ["/api/game/current"] });
      return;
    }
    // In-house: validate rung availability across span (no reflow of other chains)
    // Rebuild taken map excluding the moving chain
    const chains = scheduledBatches
      .filter((b) => b.method === 'inhouse' && b.id !== moving.id)
      .map((b) => ({ id: b.id, product: b.product, start: Number(b.startWeek), span: getLead(b.product, 'inhouse') }));
    const takenLocal: Record<number, (string | null)[]> = {};
    WEEKS_ALL.forEach((w) => { takenLocal[w] = Array.from({ length: Math.max(0, Math.floor((capacityByWeek[w]?.capacity || 0)/STANDARD_BATCH_UNITS)) }, () => null); });
    for (const ch of chains) {
      // place the existing chain on the lowest rung that is free across its span (greedy)
      const maxR = takenLocal[WEEKS_ALL[0]].length || 0;
      let assigned: number | null = null;
      for (let r = 0; r < maxR; r++) {
        let ok = true;
        for (let w = ch.start; w < ch.start + ch.span; w++) {
          if (!takenLocal[w] || r >= takenLocal[w].length || takenLocal[w][r] !== null) { ok = false; break; }
        }
        if (ok) { assigned = r; break; }
      }
      if (assigned !== null) {
        for (let w = ch.start; w < ch.start + ch.span; w++) takenLocal[w][assigned] = ch.id;
      }
    }
    // Try to place moving chain at the lowest rung available across its new span
    const lowestRungs = Math.min(...WEEKS_ALL.map((w) => (takenLocal[w]?.length ?? 0)));
    let assigned: number | null = null;
    for (let r = 0; r < lowestRungs; r++) {
      let ok = true;
      for (let w = newStart; w < newStart + lead; w++) {
        if (!takenLocal[w] || r >= takenLocal[w].length || takenLocal[w][r] !== null) { ok = false; break; }
      }
      if (ok) { assigned = r; break; }
    }
    if (assigned === null) {
      toast({ title: 'Overbooked', description: 'No free 25k rung across the full span.', variant: 'destructive' });
      return;
    }
    const next = scheduledBatches.map((b) => (b.id === moving.id ? { ...b, startWeek: newStart } : b));
    await apiRequest("POST", `/api/game/${gameSession.id}/week/${currentState.weekNumber}/update`, { productionSchedule: { batches: next } });
    queryClient.invalidateQueries({ queryKey: ["/api/game/current"] });
  };

  const formatUnits = (units: number) => {
    const u = Math.max(0, Math.round(units));
    if (u === 0) return 'N/A';
    if (u >= 1000) return `${Math.round(u / 1000)}k units`;
    return `${u} units`;
  };

  // UI
  return (
    <div className="p-6">
      {/* Intro */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Production</h1>
        <p className="text-sm text-gray-600">Plan manufacturing for Weeks 3–13. Starts allowed for next week through Week 10. In‑house capacity is shared across SKUs; outsourced is uncapped.</p>
      </div>

      {/* Production Capabilities Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {(["jacket", "dress", "pants"] as const).map((p) => {
          const productNames = {
            jacket: "Vintage Denim Jacket (VDJ)",
            dress: "Floral Print Dress (FPD)", 
            pants: "Corduroy Pants (CP)"
          };
          const headerColors = {
            jacket: "bg-gradient-to-r from-red-600 via-red-500 to-slate-200",
            dress: "bg-gradient-to-r from-purple-600 via-purple-500 to-slate-200",
            pants: "bg-gradient-to-r from-blue-800 via-blue-700 to-slate-200"
          };
          return (
            <Card key={p} className="overflow-hidden bg-white border-slate-200 shadow-md hover:shadow-lg transition-all duration-300">
              <div className={`${headerColors[p]} py-2.5 px-4`} style={{ backgroundSize: '160% 100%' }}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-base">{productNames[p]}</span>
              </div>
              </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 bg-blue-50 rounded-lg border border-blue-100">
                    <span className="text-blue-700 font-medium">In-House Lead:</span>
                    <span className="font-bold text-blue-800">{MFG[p]?.inHouseTime || 2}w</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-blue-50 rounded-lg border border-blue-100">
                    <span className="text-blue-700 font-medium">In-House Cost:</span>
                    <span className="font-bold text-blue-800">£{Number(MFG[p]?.inHouseCost || 10).toLocaleString()}</span>
              </div>
            </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 bg-orange-50 rounded-lg border border-orange-100">
                    <span className="text-orange-700 font-medium">Outsourced Lead:</span>
                    <span className="font-bold text-orange-800">{MFG[p]?.outsourceTime || 1}w</span>
              </div>
                  <div className="flex justify-between items-center p-2 bg-orange-50 rounded-lg border border-orange-100">
                    <span className="text-orange-700 font-medium">Outsourced Cost:</span>
                    <span className="font-bold text-orange-800">£{Number(MFG[p]?.outsourceCost || 15).toLocaleString()}</span>
            </div>
                </div>
              </div>
            </div>
        </Card>
          );
        })}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left column: Planner + Info */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="overflow-hidden bg-white border-slate-200 shadow-md">
            <div className="bg-gradient-to-r from-slate-100 to-slate-200 border-b border-slate-200 py-2.5 px-4">
              <div className="flex items-center gap-3">
                <Factory className="w-4 h-4 text-slate-600" />
                <h3 className="font-bold text-slate-800 text-base">Batch Planner</h3>
              </div>
            </div>
            <div className="p-5">
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
            </div>
          </Card>

          {/* Info Panels */}
          <Card className="overflow-hidden bg-white border-slate-200 shadow-md">
            <div className="bg-gradient-to-r from-slate-100 to-slate-200 border-b border-slate-200 py-2.5 px-4">
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-slate-600" />
                <h3 className="font-bold text-slate-800 text-base">Resources & Inventory</h3>
              </div>
            </div>
            <div className="p-5">
              <div className="mb-4">
                <h4 className="font-semibold mb-3 text-emerald-700">Materials</h4>
                <div className="text-sm grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                    <div className="text-emerald-600 font-medium mb-1">On‑hand ({fabricForSku || "—"})</div>
                    <div className="text-emerald-800 font-bold font-mono">{Number(rawMaterials?.[fabricForSku || ""]?.onHand || 0).toLocaleString()} u</div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-blue-600 font-medium mb-1">Arrivals ≤ W{startWeek}</div>
                    <div className="text-blue-800 font-bold font-mono">{materialPurchases.reduce((s, p) => s + ((p.shipmentWeek <= startWeek) ? (p.orders || []).filter((o: any) => o.material === fabricForSku).reduce((ss: number, o: any) => ss + Number(o.quantity || 0), 0) : 0), 0).toLocaleString()} u</div>
                  </div>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="mb-4">
                <h4 className="font-semibold mb-3 text-emerald-700">Work in Progress & Finished Goods</h4>
                <div className="text-sm grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                    <div className="text-emerald-600 font-medium mb-1">Total WIP (started)</div>
                    <div className="text-emerald-800 font-bold font-mono">{scheduledBatches.filter((b) => Number(b.startWeek) <= currentWeek).reduce((s, b) => s + Number(b.quantity || 0), 0).toLocaleString()} u</div>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="text-blue-600 font-medium mb-1">Scheduled (future)</div>
                    <div className="text-blue-800 font-bold font-mono">{scheduledBatches.filter((b) => Number(b.startWeek) > currentWeek).reduce((s, b) => s + Number(b.quantity || 0), 0).toLocaleString()} u</div>
                      </div>
                </div>
              </div>
            </div>
          </Card>
          </div>

        {/* Right column: Schedule board */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="overflow-hidden bg-white border-slate-200 shadow-xl">
            <div className="bg-gradient-to-r from-slate-100 to-slate-200 border-b border-slate-200 py-2.5 px-4">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-4 h-4 text-slate-600" />
                <h3 className="text-base font-bold text-slate-800">Production Schedule</h3>
                <div className="text-slate-500 text-xs font-mono">W3–W13</div>
              </div>
            </div>
            <div className="p-6">

            {(() => {
              // Build rung model per week
              const maxCap = Math.max(...WEEKS_ALL.map((w) => Number(capacityByWeek[w]?.capacity || 0)), 1);
              const rungPerWeek: Record<number, number> = {};
              WEEKS_ALL.forEach((w) => {
                rungPerWeek[w] = Math.floor((capacityByWeek[w]?.capacity || 0) / STANDARD_BATCH_UNITS);
              });

              // Greedy full-span rung assignment for in-house chains
              const ihChains = scheduledBatches
                .filter((b) => b.method === 'inhouse')
                .map((b) => ({ id: b.id, product: b.product, start: Number(b.startWeek), span: getLead(b.product, 'inhouse') }));
              ihChains.sort((a, b) => a.start - b.start);

              const taken: Record<number, (string | null)[]> = {};
              WEEKS_ALL.forEach((w) => { taken[w] = Array.from({ length: rungPerWeek[w] }, () => null); });
              const rungOf: Record<string, number | null> = {};
              for (const ch of ihChains) {
                let assigned: number | null = null;
                const possible = Math.max(...WEEKS_ALL.map((w) => rungPerWeek[w]));
                for (let r = 0; r < possible; r++) {
                  let ok = true;
                  for (let w = ch.start; w < ch.start + ch.span; w++) {
                    if (!taken[w] || r >= taken[w].length || taken[w][r] !== null) { ok = false; break; }
                  }
                  if (ok) { assigned = r; break; }
                }
                rungOf[ch.id] = assigned;
                if (assigned !== null) {
                  for (let w = ch.start; w < ch.start + ch.span; w++) taken[w][assigned] = ch.id;
                }
              }

              // Normalization targets
              const maxRungsAllWeeks = Math.max(...WEEKS_ALL.map((w) => rungPerWeek[w] || 0), 1);
              const BAR_HEIGHT = 220; // px: unified bar height for all weeks
              const RUNG_GAP = 2; // px vertical space between rungs
              const RUNG_SIDE_MARGIN = 1; // px left/right inside the bar
              const RUNG_TOP_BOTTOM_MARGIN = 1; // px from top and bottom of bar

              // In-house lane rendering
                  return (
                <div className="space-y-8">
                  {/* In-house Capacity Lane */}
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <h4 className="text-emerald-700 font-semibold text-base">In-House Manufacturing Capacity Allocation</h4>
                    </div>
                    <div className="grid grid-cols-11 gap-[3px] items-end">
                      {WEEKS_ALL.map((w) => {
                        const cap = Number(capacityByWeek[w]?.capacity || 0);
                        const h = BAR_HEIGHT; // unified height across weeks
                        const rungCount = Math.max(0, rungPerWeek[w] || 0);
                        const rungs = taken[w] || [];
                        const usedCount = rungs.filter((x) => x !== null).length;
                        return (
                          <div
                            key={`ih-col-${w}`}
                            className="relative group"
                            onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                            onDrop={(e) => { if (dragId) { placeChain(dragId, w); setDragId(null); } }}
                          >
                            {/* Capacity Container with Futuristic Design */}
                            <div className="relative bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-emerald-300/60">
                              {/* Capacity Visualization */}
                              <div className="relative p-1 flex flex-col justify-end items-center" style={{ minHeight: h + 10 }}>
                                {/* Background Grid Effect */}
                                <div className="absolute inset-0 opacity-10">
                                  <div className="w-full h-full bg-gradient-to-t from-cyan-500/20 via-transparent to-transparent"></div>
                                  {[...Array(5)].map((_, i) => (
                                    <div key={i} className="absolute w-full h-px bg-cyan-400/20" style={{ bottom: `${(i+1) * 20}%` }}></div>
                                  ))}
                                </div>
                                
                                {/* Capacity Bar */}
                                <div className="relative w-full mx-auto rounded-lg overflow-hidden border border-slate-300/60" style={{ height: h }} title={`Capacity: ${(cap/25000)|0} × 25k units`}>
                                  {/* Background Gradient */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-slate-200 via-slate-100 to-white"></div>
                                  
                                  {/* Free rung backgrounds (exactly rungCount) */}
                                  {(() => {
                                    const usableHeight = h - 2 * RUNG_TOP_BOTTOM_MARGIN;
                                    const rungHeight = (usableHeight - (maxRungsAllWeeks - 1) * RUNG_GAP) / maxRungsAllWeeks;
                                    return [...Array(rungCount)].map((_, r) => {
                                      const bottomPx = RUNG_TOP_BOTTOM_MARGIN + r * (rungHeight + RUNG_GAP);
                                      return (
                                        <div key={`bg-${r}`} className="absolute rounded-sm bg-emerald-200/35"
                                             style={{ bottom: bottomPx, height: rungHeight, left: RUNG_SIDE_MARGIN, right: RUNG_SIDE_MARGIN }} />
                                      );
                                    });
                                  })()}
                                  
                                  {/* Used Batch Blocks with Enhanced Styling */}
                                  {rungCount > 0 && rungs.map((id, r) => {
                                    if (!id) return null;
                                    const usableHeight = h - 2 * RUNG_TOP_BOTTOM_MARGIN;
                                    const rungHeight = (usableHeight - (maxRungsAllWeeks - 1) * RUNG_GAP) / maxRungsAllWeeks;
                                    const bottomPx = RUNG_TOP_BOTTOM_MARGIN + r * (rungHeight + RUNG_GAP);
                                    const style = { bottom: bottomPx + 1, height: rungHeight - 2, left: RUNG_SIDE_MARGIN + 1, right: RUNG_SIDE_MARGIN + 1 } as React.CSSProperties;
                                    const isHovered = hoverId === id;
                                    
                                    // Find the batch to get product type
                                    const batch = scheduledBatches.find(b => b.id === id);
                                    const product = batch?.product || 'jacket';
                                    
                                    // Color gradients by product
                                    const productColors = {
                                      jacket: 'bg-gradient-to-t from-red-600 via-red-500 to-red-400',
                                      dress: 'bg-gradient-to-t from-purple-600 via-purple-500 to-purple-400', 
                                      pants: 'bg-gradient-to-t from-blue-800 via-blue-700 to-blue-600'
                                    };
                                    
                                    // Product codes
                                    const productCodes = {
                                      jacket: 'VDJ',
                                      dress: 'FPD',
                                      pants: 'CP'
                                    };
                                    
                                    return (
                                      <div
                                        key={`used-${r}`}
                                        className={`absolute transition-all duration-300 rounded-sm flex items-center justify-center ${
                                          isHovered 
                                            ? 'bg-gradient-to-t from-amber-500 via-amber-400 to-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.8)] z-10' 
                                            : productColors[product] + ' shadow-lg'
                                        }`}
                                        style={isHovered ? { 
                                          bottom: bottomPx - 1, 
                                          height: rungHeight + 2, 
                                          left: RUNG_SIDE_MARGIN - 1, 
                                          right: RUNG_SIDE_MARGIN - 1 
                                        } : style}
                                        onMouseEnter={() => setHoverId(id)}
                                        onMouseLeave={() => setHoverId(null)}
                                      >
                                        <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-white/5 rounded-sm"></div>
                                        {isHovered && (
                                          <div className="absolute inset-0 bg-gradient-to-t from-amber-400/20 to-amber-300/10 animate-pulse rounded-sm"></div>
                                        )}
                                        <span className="relative text-black font-bold text-xs leading-none select-none">
                                          {productCodes[product]}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                
                                {/* Capacity Info removed; shown in week badges */}
                              </div>
                              
                              {/* Drag Target Indicator */}
                              {dragId && (
                                <div className="absolute inset-0 bg-emerald-400/10 border-2 border-dashed border-emerald-300/60 rounded-xl"></div>
                              )}
                            </div>
                            

                          </div>
                        );
                      })}
                        </div>
                      </div>
                      
                  {/* Week badges with available capacity moved between lanes */}
                  <div className="grid grid-cols-11 gap-[3px] mt-1 mb-1">
                    {WEEKS_ALL.map((w) => {
                      const cap = Number(capacityByWeek[w]?.capacity || 0);
                      const usedCount = (taken[w] || []).filter((x) => x !== null).length;
                      const availableUnits = Math.max(0, cap - usedCount * STANDARD_BATCH_UNITS);
                      const isNA = availableUnits === 0;
                      return (
                        <div key={`mid-hdr-${w}`} className="relative">
                          <div className="bg-white rounded-lg p-2 text-center border border-slate-200 shadow-sm h-[60px] flex flex-col justify-center">
                            <div className={`text-[11px] font-medium mb-[2px] ${isNA ? 'text-red-700' : 'text-emerald-700'}`}>
                              {formatUnits(availableUnits)}
                            </div>
                            <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent mb-[2px]"></div>
                            <div className="text-slate-600 font-semibold text-xs">W{w}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Outsourced Manufacturing Lane */}
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="text-orange-700 font-semibold text-base">Outsourced Manufacturing</h4>
                      <div className="text-slate-500 text-sm">(unlimited capacity)</div>
                    </div>
                                        <div className="grid grid-cols-11 gap-[3px]">
                      {WEEKS_ALL.map((w) => {
                        const outsourcedBatches = scheduledBatches.filter((b) => b.method === 'outsourced' && Number(b.startWeek) === w);
                        const slotCount = Math.max(3, outsourcedBatches.length);
                        
                        // Use same rung height calculation as In-House
                        const usableHeight = BAR_HEIGHT - 2 * RUNG_TOP_BOTTOM_MARGIN;
                        const rungHeight = (usableHeight - (maxRungsAllWeeks - 1) * RUNG_GAP) / maxRungsAllWeeks;
                        const slotHeight = rungHeight; // Match In-House rung height exactly
                        const slotGap = 5; // px between slots
                        const barPadding = 8; // px top/bottom
                        const totalHeight = barPadding * 2 + slotCount * slotHeight + (slotCount - 1) * slotGap;
                        
                        return (
                          <div key={`os-col-${w}`} 
                               className="relative group"
                               onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                               onDrop={(e) => { if (dragId) { placeChain(dragId, w); setDragId(null); } }}
                          >
                            {/* Outsourced Container */}
                            <div className="relative bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-orange-300/60"
                                 style={{ height: totalHeight }}>
                              {/* Background (same as in-house) */}
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-200 via-slate-100 to-white"></div>
                              
                              <div className="relative p-1" style={{ height: totalHeight }}>
                                {/* Dashed outline containers - fill from top down */}
                                {[...Array(slotCount)].map((_, index) => {
                                  const reverseIndex = slotCount - 1 - index; // Fill from top
                                  const batch = outsourcedBatches[reverseIndex];
                                  const bottomPx = barPadding + index * (slotHeight + slotGap);
                                  
                                  return (
                                    <div key={`slot-${index}`} className="absolute left-1 right-1 rounded-sm"
                                         style={{ bottom: bottomPx, height: slotHeight }}>
                                      {/* Dashed outline - less contrasty */}
                                      <div className="absolute inset-0 border-2 border-dashed border-slate-300 rounded-sm"></div>
                                      
                                      {/* Batch content if exists */}
                                      {batch && (() => {
                                        const product = batch.product;
                                        const productColors = {
                                          jacket: 'bg-gradient-to-t from-red-600 via-red-500 to-red-400',
                                          dress: 'bg-gradient-to-t from-purple-600 via-purple-500 to-purple-400', 
                                          pants: 'bg-gradient-to-t from-blue-800 via-blue-700 to-blue-600'
                                        };
                                        const productCodes = {
                                          jacket: 'VDJ',
                                          dress: 'FPD',
                                          pants: 'CP'
                                        };
                                        const isHovered = hoverId === batch.id;
                                        
                                        // Calculate sizing to match In-House rungs exactly
                                        const normalStyle = { bottom: 3, height: slotHeight - 6, left: 3, right: 3 } as React.CSSProperties;
                                        const hoverStyle = { bottom: 1, height: slotHeight - 2, left: 1, right: 1 } as React.CSSProperties;
                                        
                                        return (
                                          <div className={`absolute rounded-sm flex items-center justify-center transition-all duration-300 ${
                                              isHovered 
                                                ? 'bg-gradient-to-t from-amber-500 via-amber-400 to-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.8)] z-10' 
                                                : productColors[product] + ' shadow-lg'
                                            }`}
                                            style={isHovered ? hoverStyle : normalStyle}
                                            onMouseEnter={() => setHoverId(batch.id)}
                                            onMouseLeave={() => setHoverId(null)}>
                                            <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-white/5 rounded-sm"></div>
                                            {isHovered && (
                                              <div className="absolute inset-0 bg-gradient-to-t from-amber-400/20 to-amber-300/10 animate-pulse rounded-sm"></div>
                                            )}
                                            <span className="relative text-black font-bold text-xs leading-none select-none">
                                              {productCodes[product]}
                                            </span>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  );
                                })}
                              </div>
                              
                              {/* Drag Target Indicator */}
                              {dragId && (
                                <div className="absolute inset-0 bg-orange-400/10 border-2 border-dashed border-orange-300/60 rounded-xl"></div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
            </div>
          </Card>

          {/* Scheduled list (compact) */}
          <Card className="overflow-hidden bg-white border-slate-200 shadow-md">
            <div className="bg-gradient-to-r from-slate-100 to-slate-200 border-b border-slate-200 py-2.5 px-4">
              <div className="flex items-center gap-3">
                <List className="w-4 h-4 text-slate-600" />
                <h3 className="font-bold text-slate-800 text-base">Production Queue</h3>
              </div>
            </div>
            <div className="p-5">
            {scheduledBatches.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-dashed border-slate-400 rounded-lg"></div>
                </div>
                <div className="text-slate-500 font-medium">No batches scheduled</div>
                <div className="text-xs text-slate-400 mt-1">Use the planner above to schedule production</div>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledBatches.map((b) => (
                  <div key={b.id} className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
                    <div className="p-4">
                      <div className="grid grid-cols-6 gap-4 items-center">
                        <div>
                          <Badge 
                            className={`font-bold ${
                              b.method === 'inhouse' 
                                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white' 
                                : 'bg-gradient-to-r from-orange-600 to-orange-700 text-white'
                            }`}
                          >
                            {b.method === 'inhouse' ? 'In-House' : 'Outsourced'}
                          </Badge>
                        </div>
                        <div className="font-semibold text-slate-700">{b.product.charAt(0).toUpperCase() + b.product.slice(1)}</div>
                        <div className="text-slate-600">Start <span className="font-mono font-bold">W{b.startWeek}</span></div>
                        <div className="text-slate-600">Qty <span className="font-mono font-bold">{Number(b.quantity || 0).toLocaleString()}</span></div>
                        <div className="text-right">
                          <div className="text-xs text-slate-500">Cost per unit</div>
                          <div className="font-mono font-bold text-slate-700">£{getUnitCost(b.product, b.method).toLocaleString()}</div>
                        </div>
                        <div className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => removeBatch.mutate(b.id)}
                            className="hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-colors"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
      </Card>
        </div>
          </div>
    </div>
  );
}
