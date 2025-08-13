import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Truck, Clock, Zap, Boxes, PackageSearch } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts";

interface LogisticsProps {
  gameSession: any;
  currentState: any;
}

export default function Logistics({ gameSession, currentState }: LogisticsProps) {
  const { data: inventory } = useQuery({
    queryKey: ['/api/game', gameSession?.id, 'inventory-overview'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/game/${gameSession.id}/inventory/overview`);
      return res.json();
    },
    enabled: Boolean(gameSession?.id),
    staleTime: 30000,
  });
  const rmWeeks = useMemo(() => {
    const set = new Set<number>();
    (inventory?.rawMaterials || []).forEach((rm: any) => {
      (rm.inTransitByWeek || []).forEach((it: any) => set.add(Number(it.week)));
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [inventory]);

  const rmMaterials = useMemo(() => (inventory?.rawMaterials || []).map((rm: any) => rm.material), [inventory]);
  const rmChartData = useMemo(() => {
    return rmWeeks.map((w) => {
      const row: any = { week: `W${w}` };
      (inventory?.rawMaterials || []).forEach((rm: any) => {
        const qty = (rm.inTransitByWeek || []).find((it: any) => Number(it.week) === w)?.quantity || 0;
        row[rm.material] = qty;
      });
      return row;
    });
  }, [inventory, rmWeeks]);

  const fgChartData = useMemo(() => {
    return (inventory?.availableForSaleByWeek || []).map((row: any) => ({
      week: `W${row.week}`,
      jacket: Number(row.products?.jacket || 0),
      dress: Number(row.products?.dress || 0),
      pants: Number(row.products?.pants || 0),
    }));
  }, [inventory]);
  const shippingOptions = [
    {
      product: "Vintage Denim Jacket",
      standard: { cost: 4, time: 2 },
      expedited: { cost: 7, time: 1 },
    },
    {
      product: "Floral Print Dress", 
      standard: { cost: 2.5, time: 2 },
      expedited: { cost: 4, time: 1 },
    },
    {
      product: "Corduroy Pants",
      standard: { cost: 3, time: 2 },
      expedited: { cost: 6, time: 1 },
    },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Inventory & Logistics</h1>
        <p className="text-gray-600">Track materials, WIP, finished goods, and movements in one place</p>
      </div>
      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="logistics">Logistics</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          {/* Inventory KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="border border-gray-100">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Boxes size={16}/> RM on hand</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{(inventory?.summary?.rawMaterialsOnHand || 0).toLocaleString()} units</CardContent>
            </Card>
            <Card className="border border-gray-100">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><PackageSearch size={16}/> WIP units</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{(inventory?.summary?.wipUnits || 0).toLocaleString()}</CardContent>
            </Card>
            <Card className="border border-gray-100">
              <CardHeader className="pb-2"><CardTitle className="text-sm">FG available this week</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{(inventory?.summary?.totalFinishedGoodsAvailableThisWeek || 0).toLocaleString()}</CardContent>
            </Card>
            <Card className="border border-gray-100">
              <CardHeader className="pb-2"><CardTitle className="text-sm">FG available next week</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{(inventory?.summary?.totalFinishedGoodsAvailableNextWeek || 0).toLocaleString()}</CardContent>
            </Card>
          </div>

          {/* Raw materials arrivals timeline */}
          <Card className="border border-gray-100 mb-6">
            <CardHeader>
              <CardTitle>Raw Materials Arrivals</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={Object.fromEntries(rmMaterials.map((m: string, i: number)=> [m, { label: m, color: `hsl(${(i*80)%360} 70% 50%)` }]))}
                className="h-64 w-full"
              >
                <BarChart data={rmChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {rmMaterials.map((m: string, i: number)=> (
                    <Bar key={m} dataKey={m} stackId="a" fill={`var(--color-${m})`} />
                  ))}
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Raw materials / WIP / FG detail tables */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="border border-gray-100">
              <CardHeader><CardTitle>Raw Materials</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3">Material</th>
                        <th className="text-right py-2 px-3">On hand</th>
                        <th className="text-right py-2 px-3">Allocated</th>
                        <th className="text-right py-2 px-3">Avg unit £</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inventory?.rawMaterials || []).map((rm: any, idx: number) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="py-2 px-3 font-medium">{rm.material}</td>
                          <td className="py-2 px-3 text-right">{Number(rm.onHand||0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right">{Number(rm.allocated||0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right">{rm.avgUnitCost? rm.avgUnitCost.toFixed(2): '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-100">
              <CardHeader><CardTitle>WIP Batches</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3">Product</th>
                        <th className="text-right py-2 px-3">Quantity</th>
                        <th className="text-right py-2 px-3">Start</th>
                        <th className="text-right py-2 px-3">End</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inventory?.wip || []).map((b: any, idx: number) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="py-2 px-3 font-medium">{b.product}</td>
                          <td className="py-2 px-3 text-right">{Number(b.quantity||0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right">W{b.startWeek}</td>
                          <td className="py-2 px-3 text-right">W{b.endWeek}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-100">
              <CardHeader><CardTitle>Finished Goods</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3">Product</th>
                        <th className="text-right py-2 px-3">Quantity</th>
                        <th className="text-right py-2 px-3">Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inventory?.finishedGoodsLots || []).map((l: any, idx: number) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="py-2 px-3 font-medium">{l.product}</td>
                          <td className="py-2 px-3 text-right">{Number(l.quantity||0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right">W{l.availableWeek}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logistics">
          {/* Shipping Options Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Standard Shipping */}
            <Card className="border border-gray-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck size={20} />
                  <TooltipWrapper content="Lower cost shipping option with a 2-week transit time.">
                    <span className="cursor-help">Standard Shipping</span>
                  </TooltipWrapper>
                </CardTitle>
                <p className="text-sm text-gray-600">Cost-effective option with longer transit time</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-gray-500" />
                    <span className="font-medium">Transit Time</span>
                  </div>
                  <Badge variant="outline">2 weeks</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Expedited Shipping */}
            <Card className="border border-gray-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap size={20} />
                  <TooltipWrapper content="A premium, higher-cost shipping option with a 1-week transit time. Use this to get products to market faster.">
                    <span className="cursor-help">Expedited Shipping</span>
                  </TooltipWrapper>
                </CardTitle>
                <p className="text-sm text-gray-600">Premium option for faster delivery</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-3 bg-primary bg-opacity-10 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-primary" />
                    <span className="font-medium text-primary">Transit Time</span>
                  </div>
                  <Badge className="bg-primary text-white">1 week</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Availability Timeline (read-only) */}
          <Card className="border border-gray-100 mt-6">
            <CardHeader>
              <CardTitle>Finished Goods Availability</CardTitle>
              <p className="text-sm text-gray-600">Units available for sale by week</p>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{ jacket: { label: 'Jacket', color: 'hsl(200 70% 50%)' }, dress: { label: 'Dress', color: 'hsl(320 70% 50%)' }, pants: { label: 'Pants', color: 'hsl(140 70% 45%)' } }}
                className="h-64 w-full"
              >
                <BarChart data={fgChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="jacket" stackId="b" fill="var(--color-jacket)" />
                  <Bar dataKey="dress" stackId="b" fill="var(--color-dress)" />
                  <Bar dataKey="pants" stackId="b" fill="var(--color-pants)" />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
