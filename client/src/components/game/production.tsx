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
import { AlertTriangle } from "lucide-react";

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
          <Card className="p-4 overflow-x-auto">
            <div className="font-medium mb-3">Production Schedule (W3–W13)</div>
            {/* Header weeks */}
            <div className="grid grid-cols-11 gap-2 sticky top-0 bg-white z-10 pb-1">
              {WEEKS_ALL.map((w) => (
                <div key={`hdr-${w}`} className="text-[11px] text-gray-600 text-center font-mono">W{w}</div>
              ))}
            </div>

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

              // In-house lane rendering
                  return (
                <div className="space-y-4">
                          <div>
                    <div className="text-xs text-gray-600 mb-1">In‑house (capacity shared)</div>
                    <div className="grid grid-cols-11 gap-2">
                      {WEEKS_ALL.map((w) => {
                        const cap = Number(capacityByWeek[w]?.capacity || 0);
                        const maxH = 180; // px
                        const h = Math.max(48, Math.round((cap / maxCap) * maxH));
                        const rungCount = Math.max(0, rungPerWeek[w] || 0);
                        const rungs = taken[w] || [];
                        const usedCount = rungs.filter((x) => x !== null).length;
                        return (
                          <div
                            key={`ih-col-${w}`}
                            className="border rounded p-2 flex flex-col justify-end items-center"
                            style={{ minWidth: 88 }}
                            onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                            onDrop={(e) => { if (dragId) { placeChain(dragId, w); setDragId(null); } }}
                          >
                            <div className="relative mx-auto w-8" style={{ height: h }} title={`Cap ${(cap/25000)|0}×25k`}>
                              {/* Background */}
                              <div className="absolute inset-0 bg-gray-100 rounded" />
                              {/* Available capacity underlay (green) full bar, red will overlay used area */}
                              {rungCount > 0 && (
                                <div className="absolute left-0 right-0 bg-green-300/25 rounded" style={{ bottom: 0, top: 0 }} />
                              )}
                              {/* Used capacity underlay (red) from bottom-up */}
                              {rungCount > 0 && (
                                <div className="absolute left-0 right-0 bg-red-200/60 rounded-b" style={{ bottom: 0, height: `${(usedCount/Math.max(1,rungCount))*100}%` }} />
                              )}
                              {rungCount > 0 && [...Array(rungCount)].map((_, i) => (
                                <div key={i} className="absolute left-0 right-0 border-t border-gray-200" style={{ top: `${((i+1)/rungCount)*100}%` }} />
                              ))}
                              {/* Used rungs (red blocks) at their assigned rung positions to show chain continuity */}
                              {rungCount > 0 && [...Array(rungCount)].map((_, r) => {
                                const id = rungs[r];
                                if (!id) return null;
                                const style = { bottom: `${(r/rungCount)*100}%`, height: `${(1/rungCount)*100}%` } as React.CSSProperties;
                                const cls = hoverId === id ? 'ring-1 ring-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.85)]' : '';
                                return (
                                  <div
                                    key={`used-${r}`}
                                    className={`absolute left-0 right-0 bg-red-500 rounded-sm ${cls}`}
                                    style={style}
                                    onMouseEnter={() => setHoverId(id)}
                                    onMouseLeave={() => setHoverId(null)}
                                  />
                                );
                              })}
                              {/* Batch chips on chain start */}
                              {ihChains.filter((ch) => ch.start === w && rungOf[ch.id] !== null).map((ch) => (
                                <div
                                  key={`chip-${ch.id}`}
                                  draggable
                                  onDragStart={(e) => { setDragId(ch.id); try { e.dataTransfer.setData('text/plain', ch.id); e.dataTransfer.effectAllowed = 'move'; } catch {} }}
                                  onDragEnd={() => setDragId(null)}
                                  className="absolute -left-12 px-2 py-0.5 rounded bg-red-100 border border-red-300 text-[10px] font-medium cursor-grab"
                                  style={{ bottom: `${(Number(rungOf[ch.id]!)/Math.max(1,rungCount))*100}%` }}
                                  onMouseEnter={() => setHoverId(ch.id)}
                                  onMouseLeave={() => setHoverId(null)}
                                >
                                  {ch.product}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                        </div>
                      </div>
                      
                        <div>
                    <div className="text-xs text-gray-600 mb-1">Outsourced (uncapped)</div>
                    <div className="grid grid-cols-11 gap-2">
                      {WEEKS_ALL.map((w) => (
                        <div key={`os-col-${w}`} className="border rounded p-2" style={{ minWidth: 88 }}
                          onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                          onDrop={(e) => { if (dragId) { placeChain(dragId, w); setDragId(null); } }}
                        >
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
                    </div>
                  );
            })()}
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
