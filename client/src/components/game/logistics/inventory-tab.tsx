import { useMemo, useState, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChevronDown, ChevronRight, Wallet, CreditCard, Boxes, PackageSearch, Package, Truck, AlertCircle, BarChart3 } from "lucide-react";
import { InventoryPipeline } from "./inventory-pipeline";
import {
  PRODUCT_COLORS,
  PRODUCT_LABELS,
  formatCurrency,
  formatCurrencyDecimal,
  formatNumber,
  healthColor,
  weeksOfCover,
} from "./shared";

interface InventoryTabProps {
  inventory: any;
  currentState: any;
}

interface KpiCardProps {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  accent?: "default" | "amber" | "emerald" | "red";
}

function KpiCard({ label, value, hint, icon, accent = "default" }: KpiCardProps) {
  const accentClass =
    accent === "amber"
      ? "border-amber-200"
      : accent === "emerald"
      ? "border-emerald-200"
      : accent === "red"
      ? "border-red-200"
      : "border-gray-200";
  return (
    <TooltipWrapper content={hint}>
      <Card className={`${accentClass} cursor-help`}>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <span className="text-gray-400">{icon}</span>
            <span className="truncate">{label}</span>
          </div>
          <div className="text-lg font-semibold text-gray-900 truncate">{value}</div>
        </CardContent>
      </Card>
    </TooltipWrapper>
  );
}

interface StockCoverProps {
  product: string;
  onShelf: number;
  pipeline: number;
  weeklyDemand: number;
}

function StockCoverCard({ product, onShelf, pipeline, weeklyDemand }: StockCoverProps) {
  const cover = weeksOfCover(onShelf, weeklyDemand);
  const pct = weeklyDemand > 0 ? Math.min(100, Math.round((onShelf / (weeklyDemand * 4)) * 100)) : 0;
  const coverLabel = !isFinite(cover)
    ? "—"
    : cover >= 4
    ? `${cover.toFixed(1)} wks`
    : `${cover.toFixed(1)} wks`;
  return (
    <Card className="border border-gray-200">
      <CardContent className="p-4">
        <div className="text-sm font-semibold text-gray-900 mb-2 truncate">{PRODUCT_LABELS[product] || product}</div>
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-3">
          <div>
            <div className="text-gray-500">On shelf</div>
            <div className="text-gray-900 font-semibold">{formatNumber(onShelf)}</div>
          </div>
          <div>
            <div className="text-gray-500">Pipeline</div>
            <div className="text-gray-900 font-semibold">{formatNumber(pipeline)}</div>
          </div>
          <div>
            <div className="text-gray-500">Next demand</div>
            <div className="text-gray-900 font-semibold">{formatNumber(weeklyDemand)}</div>
          </div>
        </div>
        <TooltipWrapper content="Weeks of cover = on-shelf units ÷ projected weekly demand. Bar shows up to 4 weeks of cover.">
          <div>
            <div className="flex items-center justify-between text-xs text-gray-700 mb-1">
              <span>Weeks of cover</span>
              <span className="font-semibold">{coverLabel}</span>
            </div>
            <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className={`absolute inset-y-0 left-0 ${healthColor(pct)}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </TooltipWrapper>
      </CardContent>
    </Card>
  );
}

export function InventoryTab({ inventory, currentState }: InventoryTabProps) {
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);
  const summary = inventory?.summary || {};
  const rmList = inventory?.rawMaterials || [];
  const wipList = inventory?.wip || [];
  const shipments = inventory?.shipmentsInTransit || [];
  const fgLots = inventory?.finishedGoodsLots || [];

  // ------------------------------------------------------------------
  // Aggregates for the pipeline widget
  // ------------------------------------------------------------------
  const pipelineData = useMemo(() => {
    const totalAllocated = (rmList as any[]).reduce((s: number, rm: any) => s + Number(rm.allocated || 0), 0);
    const totalOrdered = (rmList as any[]).reduce((s: number, rm: any) => s + Number(rm.inTransitUnits || 0), 0);
    const inProduction = Number(summary.wipUnits || 0);
    const inShipping = Number(summary.inTransitUnits || 0);
    const onShelf = Number(summary.finishedGoodsUnits || 0);
    const totals: any = (currentState?.totals as any) || {};
    const soldToDate = Number(totals.unitsSoldToDate || 0);
    const lostToDate = (inventory?.lostSalesByWeek || []).reduce((s: number, w: any) => s + Number(w.total || 0), 0);
    return {
      ordered: totalOrdered,
      inTransit: totalOrdered,
      onHand: Number(summary.rawMaterialsOnHand || 0),
      allocated: totalAllocated,
      inProduction,
      inShipping,
      onShelf,
      soldToDate,
      lostToDate,
    };
  }, [rmList, summary, currentState, inventory]);

  // Per-product stock cover
  const stockCoverData = useMemo(() => {
    const products = ["jacket", "dress", "pants"];
    const fgByProduct: Record<string, number> = {};
    for (const lot of fgLots) {
      fgByProduct[lot.product] = (fgByProduct[lot.product] || 0) + Number(lot.quantity || 0);
    }
    const pipelineByProduct: Record<string, number> = {};
    for (const sh of shipments) {
      pipelineByProduct[sh.product] = (pipelineByProduct[sh.product] || 0) + Number(sh.quantity || 0);
    }
    for (const w of wipList) {
      pipelineByProduct[w.product] = (pipelineByProduct[w.product] || 0) + Number(w.quantity || 0);
    }
    const demandByProduct: any = currentState?.weeklyDemand || {};
    return products.map((p) => ({
      product: p,
      onShelf: fgByProduct[p] || 0,
      pipeline: pipelineByProduct[p] || 0,
      weeklyDemand: Number(demandByProduct[p] || 0),
    }));
  }, [fgLots, shipments, wipList, currentState]);

  // Stacked area chart data
  const stageChartData = useMemo(() => {
    return (inventory?.inventoryByStageByWeek || []).map((row: any) => ({
      week: `W${row.week}`,
      "Raw Materials": Number(row.rm || 0),
      WIP: Number(row.wip || 0),
      "In Transit": Number(row.inTransit || 0),
      "Finished Goods": Number(row.fg || 0),
    }));
  }, [inventory]);

  const lostSalesChartData = useMemo(() => {
    return (inventory?.lostSalesByWeek || []).map((row: any) => ({
      week: `W${row.week}`,
      jacket: Number(row.jacket || 0),
      dress: Number(row.dress || 0),
      pants: Number(row.pants || 0),
    }));
  }, [inventory]);

  const serviceLevelChartData = useMemo(() => {
    return (inventory?.serviceLevelByWeek || []).map((row: any) => ({
      week: `W${row.week}`,
      "Service Level %": Number(row.level || 0),
    }));
  }, [inventory]);

  const week = Number(currentState?.weekNumber || 1);
  const showServiceLevel = week >= 7;
  const slDisplay = showServiceLevel
    ? `${(inventory?.rollingServiceLevel ?? 0).toFixed(1)}%`
    : "—";

  return (
    <div>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        <KpiCard
          label="Cash"
          value={formatCurrency(Number(summary.cashOnHand || 0))}
          hint="Cash on hand at the start of this week."
          icon={<Wallet size={14} />}
          accent={Number(summary.cashOnHand || 0) < 100000 ? "amber" : "default"}
        />
        <KpiCard
          label="Credit available"
          value={formatCurrency(Number(summary.creditAvailable || 0))}
          hint="Credit headroom before hitting the £10M limit. Interest 0.2% / week on used credit."
          icon={<CreditCard size={14} />}
        />
        <KpiCard
          label="RM units"
          value={`${formatNumber(Number(summary.rawMaterialsOnHand || 0))}`}
          hint={`Raw materials on hand. Total value: ${formatCurrency(Number(summary.rawMaterialsValue || 0))}.`}
          icon={<Boxes size={14} />}
        />
        <KpiCard
          label="WIP units"
          value={`${formatNumber(Number(summary.wipUnits || 0))}`}
          hint={`Units in production. Total value: ${formatCurrency(Number(summary.wipValue || 0))}.`}
          icon={<PackageSearch size={14} />}
        />
        <KpiCard
          label="In transit"
          value={`${formatNumber(Number(summary.inTransitUnits || 0))}`}
          hint={`Finished batches in shipping. Total value: ${formatCurrency(Number(summary.inTransitValue || 0))}.`}
          icon={<Truck size={14} />}
        />
        <KpiCard
          label="FG units"
          value={`${formatNumber(Number(summary.finishedGoodsUnits || 0))}`}
          hint={`Finished goods on shelf, ready to sell. Total value: ${formatCurrency(Number(summary.finishedGoodsValue || 0))}.`}
          icon={<Package size={14} />}
        />
        <KpiCard
          label="Holding cost (wk)"
          value={formatCurrency(Number(summary.holdingCostThisWeek || 0))}
          hint="0.3% of total inventory value per week. Charged at the start of next week."
          icon={<BarChart3 size={14} />}
        />
        <KpiCard
          label="Service level"
          value={slDisplay}
          hint="Rolling weighted service level across Weeks 7–12. Demand fulfilled ÷ demand. Available from Week 7."
          icon={<AlertCircle size={14} />}
          accent={showServiceLevel && Number(inventory?.rollingServiceLevel || 0) < 90 ? "amber" : "default"}
        />
      </div>

      <InventoryPipeline {...pipelineData} />

      {/* Per-product stock cover */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {stockCoverData.map((d) => (
          <StockCoverCard key={d.product} {...d} />
        ))}
      </div>

      {/* Raw Materials table */}
      <Card className="border border-gray-100 mb-4">
        <CardHeader>
          <CardTitle className="text-base">Raw Materials</CardTitle>
          <p className="text-xs text-gray-500">Click a row to expand per-shipment in-transit detail.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3 w-8" />
                  <th className="text-left py-2 px-3">Material</th>
                  <th className="text-right py-2 px-3">On hand</th>
                  <th className="text-right py-2 px-3">Allocated</th>
                  <th className="text-right py-2 px-3">Free</th>
                  <th className="text-right py-2 px-3">In transit</th>
                  <th className="text-right py-2 px-3">Avg unit £</th>
                  <th className="text-right py-2 px-3">Total value</th>
                </tr>
              </thead>
              <tbody>
                {rmList.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-gray-500 text-sm">No materials yet — order from the Procurement tab.</td>
                  </tr>
                )}
                {rmList.map((rm: any) => {
                  const isOpen = expandedMaterial === rm.material;
                  return (
                    <Fragment key={rm.material}>
                      <tr
                        className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${isOpen ? "bg-gray-50" : ""}`}
                        onClick={() => setExpandedMaterial(isOpen ? null : rm.material)}
                      >
                        <td className="py-2 px-3 text-gray-400">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td className="py-2 px-3 font-medium">{rm.material}</td>
                        <td className="py-2 px-3 text-right">{formatNumber(Number(rm.onHand || 0))}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{formatNumber(Number(rm.allocated || 0))}</td>
                        <td className="py-2 px-3 text-right">{formatNumber(Number(rm.free || 0))}</td>
                        <td className="py-2 px-3 text-right">{formatNumber(Number(rm.inTransitUnits || 0))}</td>
                        <td className="py-2 px-3 text-right">{rm.avgUnitCost ? formatCurrencyDecimal(Number(rm.avgUnitCost)) : "—"}</td>
                        <td className="py-2 px-3 text-right font-medium">{formatCurrency(Number(rm.onHandValue || 0))}</td>
                      </tr>
                      {isOpen && rm.inTransit && rm.inTransit.length > 0 && (
                        <tr className="bg-gray-50">
                          <td colSpan={8} className="px-3 py-2">
                            <div className="text-xs text-gray-500 mb-1">Shipments in transit:</div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-500">
                                  <th className="text-left py-1">Supplier</th>
                                  <th className="text-left py-1">Type</th>
                                  <th className="text-right py-1">Arrival</th>
                                  <th className="text-right py-1">Units</th>
                                  <th className="text-right py-1">Unit £</th>
                                  <th className="text-right py-1">Line total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rm.inTransit.map((it: any, i: number) => (
                                  <tr key={i} className="text-gray-700">
                                    <td className="py-1">{it.supplier}</td>
                                    <td className="py-1">{it.contractType}</td>
                                    <td className="py-1 text-right">W{it.arrivalWeek}</td>
                                    <td className="py-1 text-right">{formatNumber(it.units)}</td>
                                    <td className="py-1 text-right">{formatCurrencyDecimal(it.unitCost)}</td>
                                    <td className="py-1 text-right">{formatCurrency(it.units * it.unitCost)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                      {isOpen && (!rm.inTransit || rm.inTransit.length === 0) && (
                        <tr className="bg-gray-50">
                          <td colSpan={8} className="px-3 py-2 text-xs text-gray-500">No shipments in transit for {rm.material}.</td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* WIP table */}
      <Card className="border border-gray-100 mb-4">
        <CardHeader>
          <CardTitle className="text-base">Work-in-Process</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3">Batch</th>
                  <th className="text-left py-2 px-3">Product</th>
                  <th className="text-left py-2 px-3">Method</th>
                  <th className="text-right py-2 px-3">Start</th>
                  <th className="text-right py-2 px-3">End</th>
                  <th className="text-right py-2 px-3">Quantity</th>
                  <th className="text-right py-2 px-3">Unit £</th>
                  <th className="text-right py-2 px-3">Total value</th>
                  <th className="text-left py-2 px-3 w-32">Progress</th>
                </tr>
              </thead>
              <tbody>
                {wipList.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-gray-500 text-sm">No batches in production.</td>
                  </tr>
                )}
                {wipList.map((b: any) => (
                  <tr key={b.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-xs text-gray-500 font-mono">{b.id}</td>
                    <td className="py-2 px-3 font-medium">{PRODUCT_LABELS[b.product] || b.product}</td>
                    <td className="py-2 px-3 capitalize">{b.method}</td>
                    <td className="py-2 px-3 text-right">W{b.startWeek}</td>
                    <td className="py-2 px-3 text-right">W{b.endWeek}</td>
                    <td className="py-2 px-3 text-right">{formatNumber(b.quantity)}</td>
                    <td className="py-2 px-3 text-right">{formatCurrencyDecimal(b.unitCostBasis)}</td>
                    <td className="py-2 px-3 text-right font-medium">{formatCurrency(b.quantity * b.unitCostBasis)}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="relative h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
                          <div className="absolute inset-y-0 left-0 bg-blue-500" style={{ width: `${b.pctComplete}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{b.pctComplete}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Shipments-in-Transit table */}
      <Card className="border border-gray-100 mb-4">
        <CardHeader>
          <CardTitle className="text-base">Shipments in Transit</CardTitle>
          <p className="text-xs text-gray-500">Finished batches en route to your shelves.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3">Shipment</th>
                  <th className="text-left py-2 px-3">Product</th>
                  <th className="text-right py-2 px-3">Quantity</th>
                  <th className="text-right py-2 px-3">Arrives</th>
                  <th className="text-right py-2 px-3">Wks left</th>
                  <th className="text-right py-2 px-3">Unit ship £</th>
                  <th className="text-right py-2 px-3">Total ship</th>
                  <th className="text-right py-2 px-3">Total value</th>
                </tr>
              </thead>
              <tbody>
                {shipments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-gray-500 text-sm">No shipments in transit yet.</td>
                  </tr>
                )}
                {shipments.map((s: any) => (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-xs text-gray-500 font-mono">{s.id}</td>
                    <td className="py-2 px-3 font-medium">{PRODUCT_LABELS[s.product] || s.product}</td>
                    <td className="py-2 px-3 text-right">{formatNumber(s.quantity)}</td>
                    <td className="py-2 px-3 text-right">W{s.arrivalWeek}</td>
                    <td className="py-2 px-3 text-right">{s.weeksRemaining}</td>
                    <td className="py-2 px-3 text-right">{formatCurrencyDecimal(s.unitShippingCost)}</td>
                    <td className="py-2 px-3 text-right">{formatCurrency(s.totalShippingCost)}</td>
                    <td className="py-2 px-3 text-right font-medium">{formatCurrency(s.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Finished goods lots */}
      <Card className="border border-gray-100 mb-4">
        <CardHeader>
          <CardTitle className="text-base">Finished Goods Lots</CardTitle>
          <p className="text-xs text-gray-500">Available for sale right now. Cost basis is fully allocated.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3">Lot</th>
                  <th className="text-left py-2 px-3">Product</th>
                  <th className="text-right py-2 px-3">Quantity</th>
                  <th className="text-right py-2 px-3">Mat. £</th>
                  <th className="text-right py-2 px-3">Prod. £</th>
                  <th className="text-right py-2 px-3">Ship. £</th>
                  <th className="text-right py-2 px-3">Unit cost</th>
                  <th className="text-right py-2 px-3">Total value</th>
                </tr>
              </thead>
              <tbody>
                {fgLots.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-gray-500 text-sm">No finished goods on shelves yet.</td>
                  </tr>
                )}
                {fgLots.map((l: any) => (
                  <tr key={l.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-xs text-gray-500 font-mono">{l.id}</td>
                    <td className="py-2 px-3 font-medium">{PRODUCT_LABELS[l.product] || l.product}</td>
                    <td className="py-2 px-3 text-right">{formatNumber(l.quantity)}</td>
                    <td className="py-2 px-3 text-right">{formatCurrencyDecimal(l.unitMaterialCost)}</td>
                    <td className="py-2 px-3 text-right">{formatCurrencyDecimal(l.unitProductionCost)}</td>
                    <td className="py-2 px-3 text-right">{formatCurrencyDecimal(l.unitShippingCost)}</td>
                    <td className="py-2 px-3 text-right">{formatCurrencyDecimal(l.unitCostBasis)}</td>
                    <td className="py-2 px-3 text-right font-medium">{formatCurrency(l.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Inventory by stage over time */}
      <Card className="border border-gray-100 mb-4">
        <CardHeader>
          <CardTitle className="text-base">Inventory by Stage Over Time</CardTitle>
          <p className="text-xs text-gray-500">Stacked area chart of units at each stage of the supply chain.</p>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{
              "Raw Materials": { label: "Raw Materials", color: "var(--chart-1)" },
              WIP: { label: "WIP", color: "var(--chart-2)" },
              "In Transit": { label: "In Transit", color: "var(--chart-3)" },
              "Finished Goods": { label: "Finished Goods", color: "var(--chart-4)" },
            }}
            className="h-72 w-full"
          >
            <AreaChart data={stageChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area type="monotone" dataKey="Raw Materials" stackId="1" stroke="var(--color-Raw Materials)" fill="var(--color-Raw Materials)" fillOpacity={0.5} />
              <Area type="monotone" dataKey="WIP" stackId="1" stroke="var(--color-WIP)" fill="var(--color-WIP)" fillOpacity={0.5} />
              <Area type="monotone" dataKey="In Transit" stackId="1" stroke="var(--color-In Transit)" fill="var(--color-In Transit)" fillOpacity={0.5} />
              <Area type="monotone" dataKey="Finished Goods" stackId="1" stroke="var(--color-Finished Goods)" fill="var(--color-Finished Goods)" fillOpacity={0.5} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Lost sales + Service level */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="text-base">Lost Sales by Week</CardTitle>
            <p className="text-xs text-gray-500">Demand we couldn&apos;t fulfil because of insufficient inventory.</p>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                jacket: { label: "Jacket", color: PRODUCT_COLORS.jacket },
                dress: { label: "Dress", color: PRODUCT_COLORS.dress },
                pants: { label: "Pants", color: PRODUCT_COLORS.pants },
              }}
              className="h-64 w-full"
            >
              <BarChart data={lostSalesChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="jacket" stackId="ls" fill="var(--color-jacket)" />
                <Bar dataKey="dress" stackId="ls" fill="var(--color-dress)" />
                <Bar dataKey="pants" stackId="ls" fill="var(--color-pants)" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="text-base">Service Level by Week</CardTitle>
            <p className="text-xs text-gray-500">Demand fulfilled ÷ demand. Reported only during sales weeks.</p>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{ "Service Level %": { label: "Service Level %", color: "var(--chart-2)" } }}
              className="h-64 w-full"
            >
              <LineChart data={serviceLevelChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line type="monotone" dataKey="Service Level %" stroke="var(--color-Service Level %)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
