import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';

interface FinalDashboardProps {
  gameId: string;
}

export default function FinalDashboard({ gameId }: FinalDashboardProps) {
  const { data } = useQuery({
    queryKey: ["/api/game", gameId, "weeks"],
    enabled: !!gameId,
  });
  const { data: ledgerData } = useQuery({
    queryKey: ["/api/game", gameId, "ledger", "rollup"],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/game/${gameId}/ledger/rollup`);
      return res.json();
    },
    enabled: !!gameId,
    staleTime: 30_000,
  });

  if (!data) return null;
  const weeks = (data as any).weeks || [];
  if (!weeks.length) return null;

  const ledgerRows = (ledgerData?.rows || []) as Array<{ entryType: string; amount: number; weekNumber: number }>;
  const sumByType = (type: string) => ledgerRows.filter(r => r.entryType === type).reduce((s, r) => s + Number(r.amount || 0), 0);
  const salesWeeks = weeks.filter((w: any) => w.weekNumber >= 7 && w.weekNumber <= 12);
  const totalDemand = salesWeeks.reduce((s: number, w: any) => s + Object.values(w.weeklyDemand || {}).reduce((a: number, b: any) => a + Number(b || 0), 0), 0);
  const totalSales = salesWeeks.reduce((s: number, w: any) => s + Object.values(w.weeklySales || {}).reduce((a: number, b: any) => a + Number(b || 0), 0), 0);
  const totalLost = salesWeeks.reduce((s: number, w: any) => s + Object.values(w.lostSales || {}).reduce((a: number, b: any) => a + Number(b || 0), 0), 0);
  const serviceLevel = totalDemand > 0 ? (totalSales / totalDemand) * 100 : 0;

  const finalState = weeks[weeks.length - 1];
  const finalCash = Number(finalState.cashOnHand || 0);

  const totalRevenue = weeks.reduce((sum: number, w: any) => sum + Number(w.weeklyRevenue || 0), 0);
  const materialCosts = sumByType('materials_spt') + sumByType('materials_gmc');
  const productionCosts = sumByType('production');
  const logisticsCosts = sumByType('logistics');
  const holdingCosts = sumByType('holding');
  const interestCosts = sumByType('interest');
  const marketingSpend = sumByType('marketing');
  const totalCosts = materialCosts + productionCosts + logisticsCosts + holdingCosts + interestCosts + marketingSpend;
  // Compute average capital employed across all weeks: cash + credit drawn + inventory value.
  // Mirrors the engine's calculateEconomicProfit logic so the dashboard is consistent with stored EP.
  const avgCapital = (() => {
    if (!weeks.length) return 0;
    const sum = weeks.reduce((acc: number, w: any) => {
      const cash = Number(w.cashOnHand || 0);
      const credit = Number(w.creditUsed || 0);
      const rmVal = Object.values((w as any).rawMaterials || {}).reduce((s: number, v: any) => s + Number(v.onHandValue || 0), 0);
      const wipVal = ((w as any).workInProcess?.batches || []).reduce((s: number, b: any) => s + Number(b.quantity || 0) * (Number(b.materialUnitCost || 0) + Number(b.productionUnitCost || 0)), 0);
      const itVal = ((w as any).shipmentsInTransit || []).reduce((s: number, sh: any) => s + Number(sh.quantity || 0) * (Number(sh.unitMaterialCost || 0) + Number(sh.unitProductionCost || 0) + Number(sh.unitShippingCost || 0)), 0);
      const fgVal = ((w as any).finishedGoods?.lots || []).reduce((s: number, l: any) => s + Number(l.quantity || 0) * Number(l.unitCostBasis || 0), 0);
      return acc + cash + credit + rmVal + wipVal + itVal + fgVal;
    }, 0);
    return sum / weeks.length;
  })();
  const economicProfit = totalRevenue - totalCosts - avgCapital * 0.10;

  // Cost breakdown pie data
  const costPie = [
    { name: 'Materials', value: materialCosts, color: '#3B82F6' },
    { name: 'Production', value: productionCosts, color: '#10B981' },
    { name: 'Logistics', value: logisticsCosts, color: '#F59E0B' },
    { name: 'Marketing', value: marketingSpend, color: '#8B5CF6' },
    { name: 'Interest', value: interestCosts, color: '#EF4444' },
    { name: 'Holding', value: holdingCosts, color: '#64748B' },
  ];

  // Strategic choices summary
  const allContracts = ((finalState as any).procurementContracts?.contracts || []) as any[];
  const contractUnits = (c: any) => c.type === 'GMC'
    ? (c.gmcOrders || []).reduce((s: number, o: any) => s + Number(o.units || 0), 0)
    : Number(c.units || 0);
  const primarySupplier = (() => {
    const bySupplier: Record<string, number> = {};
    allContracts.forEach((c: any) => { bySupplier[c.supplier] = (bySupplier[c.supplier] || 0) + contractUnits(c); });
    const entries = Object.entries(bySupplier).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] || 'N/A';
  })();
  const contractMix = (() => {
    const counts: Record<string, number> = { GMC: 0, SPT: 0 } as any;
    const total = allContracts.reduce((s, c) => s + contractUnits(c), 0) || 1;
    allContracts.forEach((c: any) => counts[c.type] = (counts[c.type] || 0) + contractUnits(c));
    return {
      GMC: Math.round((counts.GMC || 0) / total * 100),
      SPT: Math.round((counts.SPT || 0) / total * 100),
    };
  })();
  const allBatches = ((finalState as any).productionSchedule?.batches || []) as any[];
  const methodMix = (() => {
    const total = allBatches.reduce((s, b) => s + Number(b.quantity || 0), 0) || 1;
    const inhouse = allBatches.filter((b) => b.method === 'inhouse').reduce((s, b) => s + Number(b.quantity || 0), 0);
    const outsource = total - inhouse;
    return {
      inhouse: Math.round(inhouse / total * 100),
      outsource: Math.round(outsource / total * 100),
    };
  })();
  const shippingMix = (() => {
    const total = allBatches.length || 1;
    const standard = allBatches.filter((b) => b.shipping === 'standard').length;
    const expedited = total - standard;
    return { standard: Math.round(standard / total * 100), expedited: Math.round(expedited / total * 100) };
  })();

  const perfSeries = weeks.map((w: any) => ({
    week: w.weekNumber,
    cash: Number(w.cashOnHand || 0),
    inventory: (Object.values((w as any).rawMaterials || {}).reduce((s: number, v: any) => s + Number(v.onHandValue || 0), 0)
      + ((w as any).workInProcess?.batches || []).reduce((s: number, b: any) => s + Number(b.quantity || 0) * (Number(b.materialUnitCost || 0) + Number(b.productionUnitCost || 0)), 0)
      + ((w as any).finishedGoods?.lots || []).reduce((s: number, l: any) => s + Number(l.quantity || 0) * Number(l.unitCostBasis || 0), 0)),
    unitsSold: Object.values(w.weeklySales || {}).reduce((a: number, b: any) => a + Number(b || 0), 0),
  }));

  const formatCurrency = (v: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(v);

  return (
    <div className="bg-white">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Final Performance Dashboard</h1>

        {/* Headline KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">
                <TooltipWrapper content="% of demand fulfilled during sales weeks (7-12)">Service Level</TooltipWrapper>
              </div>
              <div className="text-2xl font-bold">{serviceLevel.toFixed(1)}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">
                <TooltipWrapper content="Total revenue minus total costs minus a 10% charge on the average capital employed across the season (cash + drawn credit + inventory value)">Economic Profit</TooltipWrapper>
              </div>
              <div className={`text-2xl font-bold ${economicProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(economicProfit)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">
                <TooltipWrapper content="Average capital employed across the season (cash + drawn credit + inventory value), used to charge a 10% capital cost in Economic Profit">Avg Capital</TooltipWrapper>
              </div>
              <div className="text-2xl font-bold">{formatCurrency(avgCapital)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">
                <TooltipWrapper content="Cash on hand after all week 15 operations">Final Cash Position</TooltipWrapper>
              </div>
              <div className="text-2xl font-bold">{formatCurrency(finalCash)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">
                <TooltipWrapper content="Cumulative units sold across all products">Total Units Sold</TooltipWrapper>
              </div>
              <div className="text-2xl font-bold">{totalSales.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">
                <TooltipWrapper content="Unfulfilled demand due to stockouts">Total Lost Sales</TooltipWrapper>
              </div>
              <div className="text-2xl font-bold">{totalLost.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        {/* Cost Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={costPie} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={80}>
                    {costPie.map((e, i) => (<Cell key={i} fill={e.color} />))}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [formatCurrency(v as number), n as string]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
              {costPie.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="font-mono">{formatCurrency(c.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Strategic Choices */}
        <Card>
          <CardHeader>
            <CardTitle>Strategic Choices Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600">Primary Supplier</div>
                <div className="font-semibold">{primarySupplier}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Contract Mix</div>
                <div className="font-semibold">GMC {contractMix.GMC}% / SPT {contractMix.SPT}%</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Production Methods</div>
                <div className="font-semibold">In-house {methodMix.inhouse}% / Outsource {methodMix.outsource}%</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Shipping Methods</div>
                <div className="font-semibold">Standard {shippingMix.standard}% / Expedited {shippingMix.expedited}%</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perfSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="week" />
                  <YAxis yAxisId="left" tickFormatter={(v) => `£${(Number(v)/1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip formatter={(v: any, n: any) => [n === 'unitsSold' ? Number(v).toLocaleString() : formatCurrency(Number(v)), n]} />
                  <Line yAxisId="left" type="monotone" dataKey="cash" name="Cash" stroke="#3B82F6" strokeWidth={2} dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="inventory" name="Inventory Value" stroke="#10B981" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="unitsSold" name="Units Sold" stroke="#F59E0B" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
