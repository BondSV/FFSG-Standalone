import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, ComposedChart, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, Target, PoundSterling, Package,
  Banknote, Activity, BarChart3, Wallet, ChevronsUp,
} from "lucide-react";
import {
  PRODUCT_LABELS, PRODUCT_COLORS, formatCurrency, formatNumber, LAUNCH_WEEK,
} from "./logistics/shared";

interface AnalyticsProps {
  gameSession: any;
  currentState: any;
}

interface WeekRow {
  week: number;
  cash: number;
  credit: number;
  awareness: number;
  intent: number;
  marketingSpend: number;
  weeklyRevenue: number;
  costMaterials: number;
  costProduction: number;
  costLogistics: number;
  costMarketing: number;
  costHolding: number;
  costInterest: number;
  totalCost: number;
  marginThisWeek: number;
  demandTotal: number;
  salesTotal: number;
  lostTotal: number;
  serviceLevelWeek: number;
  rmValue: number;
  wipValue: number;
  inTransitValue: number;
  fgValue: number;
  inventoryValue: number;
  capitalEmployed: number;
  perProductDemand: Record<string, number>;
  perProductSales: Record<string, number>;
  perProductLost: Record<string, number>;
  cumulativeRevenue: number;
  cumulativeCogs: number;
  cumulativeMargin: number;
}

const COST_COLORS: Record<string, string> = {
  Materials: "#3B82F6",
  Production: "#10B981",
  Logistics: "#F59E0B",
  Marketing: "#8B5CF6",
  Holding: "#EAB308",
  Interest: "#EF4444",
};

function trendIcon(change: number) {
  if (change > 0) return <TrendingUp className="text-emerald-600" size={16} />;
  if (change < 0) return <TrendingDown className="text-red-600" size={16} />;
  return <Minus className="text-gray-400" size={16} />;
}

function statusClass(status: "success" | "warning" | "danger" | "neutral") {
  switch (status) {
    case "success": return "border-emerald-200";
    case "warning": return "border-amber-200";
    case "danger": return "border-red-200";
    default: return "border-gray-200";
  }
}

function iconBgClass(status: "success" | "warning" | "danger" | "neutral") {
  switch (status) {
    case "success": return "bg-emerald-100 text-emerald-600";
    case "warning": return "bg-amber-100 text-amber-600";
    case "danger": return "bg-red-100 text-red-600";
    default: return "bg-gray-100 text-gray-500";
  }
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function Analytics({ gameSession, currentState }: AnalyticsProps) {
  const { data: gameConstants } = useQuery({ queryKey: ["/api/game/constants"], retry: false });
  const { data: weeksData } = useQuery<{ weeks: any[] }>({
    queryKey: [`/api/game/${gameSession?.id}/weeks`],
    enabled: !!gameSession?.id,
    retry: false,
  });

  const weeks = useMemo<any[]>(() => {
    const arr = (weeksData as any)?.weeks || [];
    return arr.slice().sort((a: any, b: any) => num(a.weekNumber) - num(b.weekNumber));
  }, [weeksData]);

  const currentWeek = num(currentState?.weekNumber) || 1;
  const isPostLaunch = currentWeek >= LAUNCH_WEEK;
  const productKeys = ["jacket", "dress", "pants"] as const;

  const series = useMemo<WeekRow[]>(() => {
    const out: WeekRow[] = [];
    let cumulativeRevenue = 0;
    let cumulativeCogs = 0;
    for (const w of weeks) {
      const cb = (w.costBreakdown || {}) as Record<string, number>;
      const totals = (w.totals || {}) as Record<string, number>;
      const cm = num(cb.materials);
      const cp = num(cb.production);
      const cl = num(cb.logistics);
      const cmkt = num(cb.marketing);
      const ch = num(cb.holding);
      const ci = num(cb.interest);
      const totalCost = cm + cp + cl + cmkt + ch + ci;
      const weeklyRevenue = num(w.weeklyRevenue);
      const margin = weeklyRevenue - totalCost;

      const dems: Record<string, number> = w.weeklyDemand || {};
      const sales: Record<string, number> = w.weeklySales || {};
      const lost: Record<string, number> = w.lostSales || {};
      const demandTotal = productKeys.reduce((s, k) => s + num(dems[k]), 0);
      const salesTotal = productKeys.reduce((s, k) => s + num(sales[k]), 0);
      const lostTotal = productKeys.reduce((s, k) => s + num(lost[k]), 0);
      const serviceLevelWeek = demandTotal > 0 ? salesTotal / demandTotal : (lostTotal === 0 ? 1 : 0);

      const rm = w.rawMaterials || {};
      const rmValue = Object.values(rm).reduce((s: number, e: any) => s + num(e?.onHand) * num(e?.unitCost), 0);
      const wipBatches = (w.workInProcess?.batches || []) as any[];
      const wipValue = wipBatches.reduce((s, b) => s + num(b.units || b.quantity) * num(b.unitCost || b.materialCostPerUnit), 0);
      const inTransitArr = (w.shipmentsInTransit || []) as any[];
      const inTransitValue = inTransitArr.reduce((s, sh) => s + num(sh.units) * (num(sh.materialCostPerUnit) + num(sh.productionCostPerUnit) + num(sh.shippingCostPerUnit)), 0);
      const fgLots = (w.finishedGoods?.lots || []) as any[];
      const fgValue = fgLots.reduce((s, l) => s + num(l.units) * (num(l.materialCostPerUnit) + num(l.productionCostPerUnit) + num(l.shippingCostPerUnit)), 0);
      const inventoryValue = rmValue + wipValue + inTransitValue + fgValue;

      const cash = num(w.cashOnHand);
      const credit = num(w.creditUsed);
      const capitalEmployed = cash + credit + inventoryValue;

      cumulativeRevenue = num(totals.revenueToDate) || cumulativeRevenue + weeklyRevenue;
      const cumCogs = num(totals.cogsMaterialsToDate) + num(totals.cogsProductionToDate) + num(totals.cogsLogisticsToDate);
      cumulativeCogs = cumCogs > 0 ? cumCogs : cumulativeCogs + cm + cp + cl;
      const cumulativeMargin = cumulativeRevenue - cumulativeCogs;

      out.push({
        week: num(w.weekNumber),
        cash,
        credit,
        awareness: num(w.awareness),
        intent: num(w.intent),
        marketingSpend: num(w.marketingPlan?.totalSpend) || num(w.marketingSpend),
        weeklyRevenue,
        costMaterials: cm,
        costProduction: cp,
        costLogistics: cl,
        costMarketing: cmkt,
        costHolding: ch,
        costInterest: ci,
        totalCost,
        marginThisWeek: margin,
        demandTotal,
        salesTotal,
        lostTotal,
        serviceLevelWeek,
        rmValue,
        wipValue,
        inTransitValue,
        fgValue,
        inventoryValue,
        capitalEmployed,
        perProductDemand: { jacket: num(dems.jacket), dress: num(dems.dress), pants: num(dems.pants) },
        perProductSales: { jacket: num(sales.jacket), dress: num(sales.dress), pants: num(sales.pants) },
        perProductLost: { jacket: num(lost.jacket), dress: num(lost.dress), pants: num(lost.pants) },
        cumulativeRevenue,
        cumulativeCogs,
        cumulativeMargin,
      });
    }
    return out;
  }, [weeks]);

  const last = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : undefined;

  const totals = useMemo(() => {
    const acc = {
      revenue: 0,
      cogs: 0,
      cogsMaterials: 0,
      cogsProduction: 0,
      cogsLogistics: 0,
      cogsMarketing: 0,
      holding: 0,
      interest: 0,
      marketingSpend: 0,
      unitsSold: 0,
      unitsDemand: 0,
      unitsLost: 0,
      perProductSales: { jacket: 0, dress: 0, pants: 0 } as Record<string, number>,
      perProductDemand: { jacket: 0, dress: 0, pants: 0 } as Record<string, number>,
      perProductLost: { jacket: 0, dress: 0, pants: 0 } as Record<string, number>,
    };
    for (const r of series) {
      acc.revenue += r.weeklyRevenue;
      acc.cogsMaterials += r.costMaterials;
      acc.cogsProduction += r.costProduction;
      acc.cogsLogistics += r.costLogistics;
      acc.cogsMarketing += r.costMarketing;
      acc.holding += r.costHolding;
      acc.interest += r.costInterest;
      acc.marketingSpend += r.marketingSpend;
      acc.unitsSold += r.salesTotal;
      acc.unitsDemand += r.demandTotal;
      acc.unitsLost += r.lostTotal;
      productKeys.forEach((p) => {
        acc.perProductSales[p] += r.perProductSales[p];
        acc.perProductDemand[p] += r.perProductDemand[p];
        acc.perProductLost[p] += r.perProductLost[p];
      });
    }
    if (last?.cumulativeRevenue) acc.revenue = last.cumulativeRevenue;
    if (last?.cumulativeCogs) acc.cogs = last.cumulativeCogs;
    else acc.cogs = acc.cogsMaterials + acc.cogsProduction + acc.cogsLogistics;
    return acc;
  }, [series, last]);

  const grossMarginPct = totals.revenue > 0 ? (totals.revenue - totals.cogs) / totals.revenue : 0;
  const economicProfit = totals.revenue - (totals.cogs + totals.cogsMarketing + totals.holding + totals.interest);
  const avgCapital = useMemo(() => {
    if (!series.length) return 0;
    const sum = series.reduce((s, r) => s + r.capitalEmployed, 0);
    return sum / series.length;
  }, [series]);
  const rollingService = useMemo(() => {
    const window = series.filter((r) => r.demandTotal > 0).slice(-4);
    if (!window.length) return 1;
    const totalDemand = window.reduce((s, r) => s + r.demandTotal, 0);
    const totalSales = window.reduce((s, r) => s + r.salesTotal, 0);
    return totalDemand > 0 ? totalSales / totalDemand : 1;
  }, [series]);
  const sellThrough = totals.unitsDemand > 0 ? totals.unitsSold / totals.unitsDemand : 0;

  const cashChange = last && prev ? last.cash - prev.cash : 0;
  const revenueChangePct = last && prev && prev.cumulativeRevenue > 0
    ? ((last.cumulativeRevenue - prev.cumulativeRevenue) / Math.max(prev.cumulativeRevenue, 1)) * 100
    : 0;
  const slStatus: "success" | "warning" | "danger" = rollingService >= 0.95 ? "success" : rollingService >= 0.85 ? "warning" : "danger";

  const kpis = [
    {
      title: "Cash on Hand",
      value: formatCurrency(num(last?.cash) || num(currentState?.cashOnHand)),
      change: cashChange,
      target: "≥ £0",
      icon: Banknote,
      status: (num(last?.cash) || num(currentState?.cashOnHand)) >= 0 ? "success" : "danger",
      delta: cashChange !== 0 ? `${cashChange >= 0 ? "+" : ""}${formatCurrency(cashChange)}` : "—",
    },
    {
      title: "Credit Used",
      value: formatCurrency(num(last?.credit) || num(currentState?.creditUsed)),
      change: 0,
      target: "≤ £500k",
      icon: Wallet,
      status: (num(last?.credit) || num(currentState?.creditUsed)) <= 500_000 ? "success" : "warning",
      delta: "",
    },
    {
      title: "Revenue YTD",
      value: formatCurrency(totals.revenue),
      change: revenueChangePct,
      target: "Maximize",
      icon: PoundSterling,
      status: totals.revenue > 0 ? "success" : "neutral",
      delta: revenueChangePct ? `${revenueChangePct >= 0 ? "+" : ""}${revenueChangePct.toFixed(1)}%` : "",
    },
    {
      title: "Gross Margin",
      value: `${(grossMarginPct * 100).toFixed(1)}%`,
      change: 0,
      target: "≥ 35%",
      icon: BarChart3,
      status: grossMarginPct >= 0.35 ? "success" : grossMarginPct >= 0.2 ? "warning" : "danger",
      delta: "",
    },
    {
      title: "Economic Profit",
      value: formatCurrency(economicProfit),
      change: 0,
      target: "Maximize",
      icon: ChevronsUp,
      status: economicProfit > 0 ? "success" : economicProfit < 0 ? "danger" : "neutral",
      delta: "",
    },
    {
      title: "Service Level (4w)",
      value: isPostLaunch ? `${(rollingService * 100).toFixed(1)}%` : "—",
      change: 0,
      target: "≥ 95%",
      icon: Target,
      status: isPostLaunch ? slStatus : "neutral",
      delta: "",
    },
    {
      title: "Sell-through",
      value: isPostLaunch ? `${(sellThrough * 100).toFixed(1)}%` : "—",
      change: 0,
      target: "≥ 90%",
      icon: Package,
      status: isPostLaunch ? (sellThrough >= 0.9 ? "success" : sellThrough >= 0.75 ? "warning" : "danger") : "neutral",
      delta: "",
    },
    {
      title: "Avg Capital",
      value: formatCurrency(avgCapital),
      change: 0,
      target: "Used in EP",
      icon: Activity,
      status: "neutral",
      delta: "",
    },
  ] as const;

  const costPie = useMemo(() => ([
    { name: "Materials", value: Math.round(totals.cogsMaterials), color: COST_COLORS.Materials },
    { name: "Production", value: Math.round(totals.cogsProduction), color: COST_COLORS.Production },
    { name: "Logistics", value: Math.round(totals.cogsLogistics), color: COST_COLORS.Logistics },
    { name: "Marketing", value: Math.round(totals.cogsMarketing), color: COST_COLORS.Marketing },
    { name: "Holding", value: Math.round(totals.holding), color: COST_COLORS.Holding },
    { name: "Interest", value: Math.round(totals.interest), color: COST_COLORS.Interest },
  ].filter((c) => c.value > 0)), [totals]);

  const totalCostsAll = costPie.reduce((s, c) => s + c.value, 0);

  const productPerf = productKeys.map((p) => {
    const sales = totals.perProductSales[p];
    const demand = totals.perProductDemand[p];
    const lost = totals.perProductLost[p];
    const fillRate = demand > 0 ? sales / demand : 0;
    const rrp = num((currentState?.productData as any)?.[p]?.rrp);
    const ASP = sales > 0 ? (
      // Approximate: revenue allocated to product by units × RRP weighted by units sold (no per-week per-product revenue stored)
      rrp
    ) : 0;
    return {
      product: p,
      label: PRODUCT_LABELS[p],
      sales,
      demand,
      lost,
      fillRate,
      ASP,
      rrp,
    };
  });

  const cashWaterfall = useMemo(() => {
    if (!last) return [] as Array<{ label: string; value: number; cumulative: number; type: "in" | "out" | "total" }>;
    const startingCash = prev ? prev.cash : (gameConstants as any)?.STARTING_CAPITAL || 1_000_000;
    const inflow = last.weeklyRevenue;
    const outflows = [
      { label: "Materials", value: -last.costMaterials },
      { label: "Production", value: -last.costProduction },
      { label: "Logistics", value: -last.costLogistics },
      { label: "Marketing", value: -last.costMarketing },
      { label: "Holding", value: -last.costHolding },
      { label: "Interest", value: -last.costInterest },
    ];
    const rows: Array<{ label: string; value: number; cumulative: number; type: "in" | "out" | "total" }> = [];
    rows.push({ label: "Start Cash", value: startingCash, cumulative: startingCash, type: "total" });
    let acc = startingCash;
    rows.push({ label: "Revenue", value: inflow, cumulative: (acc += inflow), type: "in" });
    for (const o of outflows) {
      rows.push({ label: o.label, value: o.value, cumulative: (acc += o.value), type: "out" });
    }
    rows.push({ label: "End Cash", value: acc, cumulative: acc, type: "total" });
    return rows;
  }, [last, prev, gameConstants]);

  if (!series.length) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Performance Analytics</h1>
          <p className="text-gray-600">Real-time KPIs, P&amp;L, demand, and product performance.</p>
        </div>
        <Card>
          <CardContent className="p-10 text-center text-gray-500">
            No committed weeks yet — analytics will populate after the first week is committed.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Performance Analytics</h1>
          <p className="text-gray-600">
            Live KPIs, P&amp;L, demand fulfilment, and product economics — all derived from your committed weeks.
          </p>
        </div>
        <div className="text-sm text-gray-500">Week {currentWeek} • {series.length} weeks committed</div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-8">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.title} className={`border ${statusClass(kpi.status as any)}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">{kpi.title}</span>
                  <span className={`h-7 w-7 rounded-md flex items-center justify-center ${iconBgClass(kpi.status as any)}`}>
                    <Icon size={14} />
                  </span>
                </div>
                <div className="text-lg font-bold text-gray-900 font-mono leading-tight">{kpi.value}</div>
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                  {kpi.delta && trendIcon(kpi.change)}
                  <span>{kpi.delta || `Target: ${kpi.target}`}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="costs">Cost Structure</TabsTrigger>
          <TabsTrigger value="demand">Demand &amp; Sales</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Panel 1: Cash & Credit over time */}
            <Card>
              <CardHeader>
                <CardTitle>Cash &amp; Credit Over Time</CardTitle>
                <p className="text-sm text-gray-500">Liquidity trajectory across the season</p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} labelFormatter={(l) => `Week ${l}`} />
                      <Legend />
                      <Line type="monotone" dataKey="cash" name="Cash" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="credit" name="Credit Used" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
                      <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Panel 2: Revenue vs Total Cost */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue vs Total Cost</CardTitle>
                <p className="text-sm text-gray-500">Per-week P&amp;L and weekly margin</p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} labelFormatter={(l) => `Week ${l}`} />
                      <Legend />
                      <Bar dataKey="weeklyRevenue" name="Revenue" fill="#10B981" />
                      <Bar dataKey="totalCost" name="Total Cost" fill="#EF4444" />
                      <Line type="monotone" dataKey="marginThisWeek" name="Weekly Margin" stroke="#1F2937" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Panel 3: Cash flow waterfall (current week) */}
            <Card>
              <CardHeader>
                <CardTitle>Cash Flow — Week {last?.week}</CardTitle>
                <p className="text-sm text-gray-500">Inflows, outflows, and ending cash for the most recent committed week</p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashWaterfall} layout="vertical" margin={{ left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={100} />
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                      <Bar dataKey="value">
                        {cashWaterfall.map((row, i) => (
                          <Cell key={i} fill={row.type === "in" ? "#10B981" : row.type === "out" ? "#EF4444" : "#1F2937"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Panel 4: Marketing Awareness & Intent */}
            <Card>
              <CardHeader>
                <CardTitle>Marketing — Awareness, Intent &amp; Spend</CardTitle>
                <p className="text-sm text-gray-500">A &amp; I trajectory vs. weekly spend</p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any, n: any) => (n === "Spend" ? formatCurrency(Number(v)) : `${Number(v).toFixed(1)}%`)} labelFormatter={(l) => `Week ${l}`} />
                      <Legend />
                      <Area yAxisId="left" type="monotone" dataKey="awareness" name="Awareness" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.15} strokeWidth={2} />
                      <Area yAxisId="left" type="monotone" dataKey="intent" name="Intent" stroke="#EC4899" fill="#EC4899" fillOpacity={0.15} strokeWidth={2} />
                      <Bar yAxisId="right" dataKey="marketingSpend" name="Spend" fill="#F59E0B" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* COST STRUCTURE */}
        <TabsContent value="costs" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Panel 5: Cost breakdown pie */}
            <Card>
              <CardHeader>
                <CardTitle>Cost Structure (YTD)</CardTitle>
                <p className="text-sm text-gray-500">Total costs split by category</p>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {totalCostsAll === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-gray-500">No costs incurred yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={costPie} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                          {costPie.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                        </Pie>
                        <Tooltip formatter={(v: any, n: any) => [formatCurrency(Number(v)), n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {costPie.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} /><span>{c.name}</span></div>
                      <span className="font-mono">{formatCurrency(c.value)} ({totalCostsAll ? ((c.value / totalCostsAll) * 100).toFixed(1) : 0}%)</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Panel 6: Costs by week stacked bar */}
            <Card>
              <CardHeader>
                <CardTitle>Costs by Week</CardTitle>
                <p className="text-sm text-gray-500">Per-week breakdown across categories</p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} labelFormatter={(l) => `Week ${l}`} />
                      <Legend />
                      <Bar dataKey="costMaterials" stackId="cost" name="Materials" fill={COST_COLORS.Materials} />
                      <Bar dataKey="costProduction" stackId="cost" name="Production" fill={COST_COLORS.Production} />
                      <Bar dataKey="costLogistics" stackId="cost" name="Logistics" fill={COST_COLORS.Logistics} />
                      <Bar dataKey="costMarketing" stackId="cost" name="Marketing" fill={COST_COLORS.Marketing} />
                      <Bar dataKey="costHolding" stackId="cost" name="Holding" fill={COST_COLORS.Holding} />
                      <Bar dataKey="costInterest" stackId="cost" name="Interest" fill={COST_COLORS.Interest} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Panel 7: Three-tier cost vs RRP per product */}
          <Card>
            <CardHeader>
              <CardTitle>Three-Tier Costs vs RRP (per product)</CardTitle>
              <p className="text-sm text-gray-500">Standard cost (planning), Discount cost (orders adjusted), Actual cost (COGS / units sold).</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {productKeys.map((p) => {
                  const rrp = num((currentState?.productData as any)?.[p]?.rrp);
                  const std = num(last?.cumulativeCogs && totals.unitsSold ? totals.cogs / totals.unitsSold : 0);
                  const discounted = std; // engine reports unified actualUnitCost; we re-use it for now
                  const actual = num(last && (last as any).actualUnitCost) || std;
                  const margin = rrp - actual;
                  const marginPct = rrp > 0 ? (margin / rrp) : 0;
                  return (
                    <div key={p} className="border rounded-lg p-4 bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-900">{PRODUCT_LABELS[p]}</h3>
                        <Badge variant="secondary">{rrp ? formatCurrency(rrp) : "RRP TBD"}</Badge>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-600">Standard unit cost</span><span className="font-mono">{formatCurrency(std)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Discounted unit cost</span><span className="font-mono">{formatCurrency(discounted)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Actual unit cost</span><span className="font-mono">{formatCurrency(actual)}</span></div>
                        <div className="flex justify-between border-t pt-2"><span className="text-gray-600">Unit margin</span><span className={`font-mono ${margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency(margin)} ({(marginPct * 100).toFixed(0)}%)</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DEMAND & SALES */}
        <TabsContent value="demand" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Panel 8: Demand vs Sales */}
            <Card>
              <CardHeader>
                <CardTitle>Demand vs Sales by Week</CardTitle>
                <p className="text-sm text-gray-500">Did you have enough inventory to meet demand?</p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(Number(v))} />
                      <Tooltip formatter={(v: any) => formatNumber(Number(v))} labelFormatter={(l) => `Week ${l}`} />
                      <Legend />
                      <Bar dataKey="demandTotal" name="Demand" fill="#94A3B8" />
                      <Bar dataKey="salesTotal" name="Sales" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Panel 9: Lost sales by product */}
            <Card>
              <CardHeader>
                <CardTitle>Lost Sales by Product</CardTitle>
                <p className="text-sm text-gray-500">Stockouts cost you these units of demand</p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(Number(v))} />
                      <Tooltip formatter={(v: any) => formatNumber(Number(v))} labelFormatter={(l) => `Week ${l}`} />
                      <Legend />
                      {productKeys.map((p) => (
                        <Bar key={p} dataKey={`perProductLost.${p}`} stackId="lost" name={PRODUCT_LABELS[p]} fill={PRODUCT_COLORS[p]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Panel 10: Service Level over time */}
          <Card>
            <CardHeader>
              <CardTitle>Service Level Over Time</CardTitle>
              <p className="text-sm text-gray-500">Sales / Demand. Target ≥ 95% (green band)</p>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series.map((r) => ({ week: r.week, sl: r.demandTotal > 0 ? r.serviceLevelWeek * 100 : null }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v: any) => v != null ? `${Number(v).toFixed(1)}%` : "—"} labelFormatter={(l) => `Week ${l}`} />
                    <ReferenceLine y={95} stroke="#10B981" strokeDasharray="3 3" label={{ value: "Target 95%", position: "right", fontSize: 10 }} />
                    <Line type="monotone" dataKey="sl" name="Service Level" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PRODUCTS */}
        <TabsContent value="products" className="space-y-6">
          {/* Panel 11: Product KPI cards (per product totals) */}
          <Card>
            <CardHeader>
              <CardTitle>Product Performance (YTD)</CardTitle>
              <p className="text-sm text-gray-500">Demand fulfilled, lost, and fill rate per product</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {productPerf.map((p) => (
                  <div key={p.product} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-gray-900">{p.label}</h3>
                      <Badge className={p.fillRate >= 0.95 ? "bg-emerald-100 text-emerald-700" : p.fillRate >= 0.85 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>
                        {(p.fillRate * 100).toFixed(1)}% fill
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-gray-500">Demand</div>
                        <div className="font-mono font-semibold">{formatNumber(p.demand)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Sold</div>
                        <div className="font-mono font-semibold">{formatNumber(p.sales)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Lost</div>
                        <div className="font-mono font-semibold text-red-600">{formatNumber(p.lost)}</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${p.fillRate >= 0.95 ? "bg-emerald-500" : p.fillRate >= 0.85 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(p.fillRate * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-gray-500">RRP: <span className="font-mono">{p.rrp ? formatCurrency(p.rrp) : "—"}</span></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Panel 12: Per-product weekly sales lines */}
            <Card>
              <CardHeader>
                <CardTitle>Sales by Product (per week)</CardTitle>
                <p className="text-sm text-gray-500">How each product is selling over time</p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(Number(v))} />
                      <Tooltip formatter={(v: any) => formatNumber(Number(v))} labelFormatter={(l) => `Week ${l}`} />
                      <Legend />
                      {productKeys.map((p) => (
                        <Line key={p} type="monotone" dataKey={`perProductSales.${p}`} name={PRODUCT_LABELS[p]} stroke={PRODUCT_COLORS[p]} strokeWidth={2} dot={{ r: 3 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Inventory by stage stacked area */}
            <Card>
              <CardHeader>
                <CardTitle>Inventory Value by Stage</CardTitle>
                <p className="text-sm text-gray-500">Capital tied up in raw materials, WIP, in-transit, and finished goods</p>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} labelFormatter={(l) => `Week ${l}`} />
                      <Legend />
                      <Area type="monotone" dataKey="rmValue" name="Raw Materials" stackId="inv" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
                      <Area type="monotone" dataKey="wipValue" name="WIP" stackId="inv" stroke="#10B981" fill="#10B981" fillOpacity={0.3} />
                      <Area type="monotone" dataKey="inTransitValue" name="In Transit" stackId="inv" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.3} />
                      <Area type="monotone" dataKey="fgValue" name="Finished Goods" stackId="inv" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
