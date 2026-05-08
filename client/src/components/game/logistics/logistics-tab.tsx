import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { Truck, Zap, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { IntroCard } from "./intro-card";
import { LaunchReadiness } from "./launch-readiness";
import { ShippingPlanRow, type ShippingPlanBatchRowData } from "./shipping-plan-row";
import { PRODUCT_LABELS, formatCurrency, formatCurrencyDecimal, formatNumber, LAUNCH_WEEK } from "./shared";

interface LogisticsTabProps {
  inventory: any;
  currentState: any;
  gameSession: any;
}

const SHIPPING_REFERENCE: Record<string, { standard: number; expedited: number }> = {
  jacket: { standard: 4, expedited: 7 },
  dress: { standard: 2.5, expedited: 4 },
  pants: { standard: 3, expedited: 6 },
};

export function LogisticsTab({ inventory, currentState, gameSession }: LogisticsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const week = Number(currentState?.weekNumber || 1);
  const shippingPlan: ShippingPlanBatchRowData[] = inventory?.shippingPlan || [];

  // ------------------------------------------------------------------
  // Shipping mode mutation
  // ------------------------------------------------------------------
  const updateShippingMutation = useMutation({
    mutationFn: async (input: { batchIds: string[]; mode: "standard" | "expedited" }) => {
      const allBatches = (currentState?.productionSchedule?.batches || []) as any[];
      const next = allBatches.map((b) => {
        if (input.batchIds.includes(String(b.id))) return { ...b, shipping: input.mode };
        return b;
      });
      await apiRequest("POST", `/api/game/${gameSession.id}/week/${week}/update`, {
        productionSchedule: { batches: next },
      });
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/game/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/game", gameSession?.id, "inventory-overview"] });
      toast({
        title: variables.batchIds.length > 1 ? "Shipping updated" : "Shipping mode changed",
        description:
          variables.batchIds.length > 1
            ? `Switched ${variables.batchIds.length} batches to ${variables.mode}.`
            : `Set to ${variables.mode}.`,
      });
    },
    onError: () => {
      toast({ title: "Failed to update shipping", description: "Please try again.", variant: "destructive" });
    },
  });

  const onChangeOne = (batchId: string, mode: "standard" | "expedited") => {
    updateShippingMutation.mutate({ batchIds: [batchId], mode });
  };

  const onExpediteAllLate = () => {
    const ids = shippingPlan
      .filter(
        (b) =>
          !b.shippingLocked &&
          b.shipping === "standard" &&
          b.onShelfWeek > LAUNCH_WEEK &&
          b.comparison.expedited.onShelfWeek <= LAUNCH_WEEK,
      )
      .map((b) => b.id);
    if (ids.length === 0) return;
    updateShippingMutation.mutate({ batchIds: ids, mode: "expedited" });
  };

  const onSetAll = (mode: "standard" | "expedited") => {
    const ids = shippingPlan.filter((b) => !b.shippingLocked).map((b) => b.id);
    if (ids.length === 0) return;
    updateShippingMutation.mutate({ batchIds: ids, mode });
  };

  // ------------------------------------------------------------------
  // Active shipments + holding cost data
  // ------------------------------------------------------------------
  const activeShipments = inventory?.shipmentsInTransit || [];
  const holdingCostData = useMemo(() => {
    return (inventory?.holdingCostByWeek || []).map((row: any) => ({
      week: `W${row.week}`,
      Weekly: Number(row.weekly || 0),
      Cumulative: Number(row.cumulative || 0),
    }));
  }, [inventory]);

  const summary = inventory?.summary || {};
  const inventoryValueByStage = [
    { stage: "Raw Materials", value: Number(summary.rawMaterialsValue || 0) },
    { stage: "WIP", value: Number(summary.wipValue || 0) },
    { stage: "In Transit", value: Number(summary.inTransitValue || 0) },
    { stage: "Finished Goods", value: Number(summary.finishedGoodsValue || 0) },
  ];

  // Group shipping plan by status for the editor
  const planGroups = useMemo(() => {
    const groups: Record<string, ShippingPlanBatchRowData[]> = {
      planned: [],
      inProduction: [],
      inTransit: [],
      delivered: [],
    };
    for (const b of shippingPlan) groups[b.status].push(b);
    return groups;
  }, [shippingPlan]);

  // Logistics cost summary
  const logisticsThisWeek = (inventory?.shippingPlan || [])
    .filter((b: ShippingPlanBatchRowData) => b.startWeek === week)
    .reduce((s: number, b: ShippingPlanBatchRowData) => s + b.comparison[b.shipping].totalCost, 0);
  const logisticsYtd = Number(currentState?.logisticsCosts || 0);
  const expeditedCount = shippingPlan.filter((b) => b.shipping === "expedited").length;
  const standardCount = shippingPlan.filter((b) => b.shipping === "standard").length;
  const totalCount = shippingPlan.length || 1;
  const expeditedPct = Math.round((expeditedCount / totalCount) * 100);

  return (
    <div>
      <IntroCard gameId={String(gameSession?.id || "default")} />

      <LaunchReadiness
        shippingPlan={shippingPlan}
        currentWeek={week}
        onExpediteAllLate={onExpediteAllLate}
        expediting={updateShippingMutation.isPending}
      />

      {/* Active shipments */}
      <Card className="border border-gray-100 mb-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Active Shipments</CardTitle>
              <p className="text-xs text-gray-500">Batches currently moving from your factory to your shelves.</p>
            </div>
            <span className="text-xs text-gray-500">{activeShipments.length} in transit</span>
          </div>
        </CardHeader>
        <CardContent>
          {activeShipments.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <Package size={28} className="mx-auto mb-2 text-gray-300" />
              No shipments yet — schedule production to start the pipeline.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeShipments.map((s: any) => {
                const totalDur = Math.max(1, s.weeksRemaining + 1);
                const elapsed = Math.max(0, totalDur - s.weeksRemaining);
                const pct = Math.min(100, Math.round((elapsed / totalDur) * 100));
                return (
                  <Card key={s.id} className="border border-gray-200">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {PRODUCT_LABELS[s.product] || s.product}
                        </div>
                        <span className="text-[10px] uppercase tracking-wide rounded bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5">
                          In Transit
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mb-1">
                        {formatNumber(Number(s.quantity || 0))} units · ETA Week {s.arrivalWeek}
                      </div>
                      <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                        <div className="absolute inset-y-0 left-0 bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{formatCurrencyDecimal(s.unitShippingCost)} / unit</span>
                        <span className="font-semibold">{formatCurrency(s.totalShippingCost)}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shipping Plan Editor */}
      <Card className="border border-gray-100 mb-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base">Shipping Plan</CardTitle>
              <p className="text-xs text-gray-500">
                Choose Standard or Expedited per batch. Locked once the batch enters production.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => onSetAll("standard")}
                disabled={updateShippingMutation.isPending}
                className="rounded border border-gray-200 hover:border-gray-300 hover:bg-gray-50 px-2 py-1 text-gray-700"
              >
                Set all Standard
              </button>
              <button
                type="button"
                onClick={() => onSetAll("expedited")}
                disabled={updateShippingMutation.isPending}
                className="rounded border border-gray-200 hover:border-gray-300 hover:bg-gray-50 px-2 py-1 text-gray-700"
              >
                Set all Expedited
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {shippingPlan.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              No production batches yet. Add batches in the Production tab to schedule shipping.
            </div>
          ) : (
            <div>
              {(["planned", "inProduction", "inTransit", "delivered"] as const).map((status) => {
                const batches = planGroups[status];
                if (batches.length === 0) return null;
                const heading: Record<typeof status, string> = {
                  planned: "Planned",
                  inProduction: "In Production",
                  inTransit: "In Transit",
                  delivered: "Delivered",
                };
                return (
                  <div key={status} className="mb-4 last:mb-0">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                      {heading[status]} ({batches.length})
                    </div>
                    {batches.map((b) => (
                      <ShippingPlanRow key={b.id} batch={b} onChange={onChangeOne} pending={updateShippingMutation.isPending} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Holding cost tracker + inventory value snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="border border-gray-100 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Holding Cost Tracker</CardTitle>
            <p className="text-xs text-gray-500">Weekly holding cost (0.3% of total inventory value) and cumulative.</p>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                Weekly: { label: "Weekly", color: "var(--chart-3)" },
                Cumulative: { label: "Cumulative", color: "var(--chart-1)" },
              }}
              className="h-64 w-full"
            >
              <ComposedChart data={holdingCostData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="Weekly" fill="var(--color-Weekly)" />
                <Line type="monotone" dataKey="Cumulative" stroke="var(--color-Cumulative)" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="text-base">Inventory Value (this week)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {inventoryValueByStage.map((row) => (
                <div key={row.stage} className="flex justify-between">
                  <span className="text-gray-600">{row.stage}</span>
                  <span className="font-medium">{formatCurrency(row.value)}</span>
                </div>
              ))}
              <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatCurrency(Number(summary.totalInventoryValue || 0))}</span>
              </div>
              <div className="text-xs text-gray-500 pt-1">
                Holding charge this week: <strong>{formatCurrency(Number(summary.holdingCostThisWeek || 0))}</strong>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Logistics cost summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card className="border border-gray-100">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 mb-1">Shipping cost (this week)</div>
            <div className="text-xl font-semibold">{formatCurrency(logisticsThisWeek)}</div>
            <div className="text-xs text-gray-500 mt-1">Charged when a batch starts production.</div>
          </CardContent>
        </Card>
        <Card className="border border-gray-100">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 mb-1">Shipping cost (YTD)</div>
            <div className="text-xl font-semibold">{formatCurrency(logisticsYtd)}</div>
          </CardContent>
        </Card>
        <Card className="border border-gray-100">
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 mb-1">Mode mix</div>
            <div className="text-sm">
              <span className="text-gray-700">Standard:</span> <strong>{standardCount}</strong>{" "}
              <span className="text-gray-400">·</span>{" "}
              <span className="text-gray-700">Expedited:</span> <strong>{expeditedCount}</strong>
            </div>
            <div className="relative h-2 mt-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-amber-500" style={{ width: `${expeditedPct}%` }} />
            </div>
            <div className="text-xs text-gray-500 mt-1">{expeditedPct}% expedited</div>
          </CardContent>
        </Card>
      </div>

      {/* Per-product unit shipping cost reference */}
      <Card className="border border-gray-100">
        <CardHeader>
          <CardTitle className="text-base">Per-Unit Shipping Cost Reference</CardTitle>
          <p className="text-xs text-gray-500">Unit shipping cost varies by product and mode (from game spec 5.4 D).</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3">Product</th>
                  <th className="text-right py-2 px-3">
                    <TooltipWrapper content="Lower unit rate; 2 simulated freight weeks from hand-off, then +1 stocking week before on-shelf (vs Expedited: 1 freight + 1 stocking).">
                      <span className="cursor-help inline-flex items-center gap-1">
                        <Truck size={12} /> Standard
                      </span>
                    </TooltipWrapper>
                  </th>
                  <th className="text-right py-2 px-3">
                    <TooltipWrapper content="Higher unit rate; 1 freight week from hand-off, then +1 stocking week. Saves one ladder step vs Standard overall.">
                      <span className="cursor-help inline-flex items-center gap-1">
                        <Zap size={12} /> Expedited
                      </span>
                    </TooltipWrapper>
                  </th>
                  <th className="text-right py-2 px-3">Difference</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(SHIPPING_REFERENCE).map(([product, costs]) => (
                  <tr key={product} className="border-b border-gray-100 last:border-b-0">
                    <td className="py-2 px-3 font-medium">{PRODUCT_LABELS[product]}</td>
                    <td className="py-2 px-3 text-right">{formatCurrencyDecimal(costs.standard)}</td>
                    <td className="py-2 px-3 text-right">{formatCurrencyDecimal(costs.expedited)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">
                      +{formatCurrencyDecimal(costs.expedited - costs.standard)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
