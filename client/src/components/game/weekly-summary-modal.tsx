import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { WeeklySummary } from '@/types/weekly-summary';
import { TrendingUp, Percent, Boxes, CreditCard, Factory, Banknote, Receipt } from 'lucide-react';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

type Props = { open: boolean; onOpenChange: (v: boolean) => void; summary: WeeklySummary };

export function WeeklySummaryModal({ open, onOpenChange, summary }: Props) {
  const { cash, procurement, inventory, production, marketing } = summary;
  const demandData = (summary.demandSeries || []).filter(d => Number(d.week) <= Number(summary.weekNumber));

  const outflows = [
    { name: 'Marketing', value: cash.outflows.marketing },
    { name: 'Fabrics', value: cash.outflows.materialsSPT + cash.outflows.materialsGMC },
    { name: 'Production', value: cash.outflows.production },
    { name: 'Logistics', value: cash.outflows.logistics },
    { name: 'Stock Holding', value: cash.outflows.holding },
  ].filter(x => x.value > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl bg-white/90 backdrop-blur border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Week {summary.weekNumber} is live — Here’s what happened
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium flex items-center gap-2"><Banknote className="h-4 w-4 text-blue-600" /> Cash Flow</div>
            </div>
            <Separator className="my-2" />
            {(() => {
              const inflows = [
                { name: 'Revenue', value: Number(cash.revenue || 0) },
              ];
              const outflowsFull = [
                { name: 'Marketing', value: Number(cash.outflows.marketing || 0) },
                { name: 'Fabrics', value: Number(cash.outflows.materialsSPT || 0) + Number(cash.outflows.materialsGMC || 0) },
                { name: 'Production', value: Number(cash.outflows.production || 0) },
                { name: 'Logistics', value: Number(cash.outflows.logistics || 0) },
                { name: 'Stock Holding', value: Number(cash.outflows.holding || 0) },
                { name: 'Interest', value: Number(cash.interest || 0) },
              ];
              const net = inflows.reduce((s, x) => s + x.value, 0) - outflowsFull.reduce((s, x) => s + x.value, 0);
              const netColor = net >= 0 ? 'text-green-800' : 'text-red-800';
              return (
                <div className="text-sm">
                  <div className="font-medium mb-1">Inflows</div>
                  {inflows.map(x => (
                    <div key={x.name} className="grid grid-cols-[auto_auto] items-center gap-x-3 w-fit">
                      <span className="text-muted-foreground">{x.name}</span>
                      <span className="text-green-800 font-mono tabular-nums">£{x.value.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="font-medium mt-2 mb-1">Outflows</div>
                  {outflowsFull.map(x => (
                    <div key={x.name} className="grid grid-cols-[auto_auto] items-center gap-x-3 w-fit">
                      <span className="text-muted-foreground">{x.name}</span>
                      <span className="text-red-800 font-mono tabular-nums">£{x.value.toLocaleString()}</span>
                    </div>
                  ))}
                  <Separator className="my-2" />
                  <div className="grid grid-cols-[auto_auto] items-center gap-x-3 w-fit font-semibold">
                    <span>Net Cash Flow</span>
                    <span className={`${netColor} font-mono tabular-nums`}>£{net.toLocaleString()}</span>
                  </div>
                </div>
              );
            })()}
          </Card>

          <Card className="p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium flex items-center gap-2"><Receipt className="h-4 w-4 text-blue-600" /> Supplier Invoices Settled</div>
            </div>
            <Separator className="my-2" />
            <div className="space-y-1 max-h-28 overflow-auto pr-1">
              {procurement.settlements.length === 0 && <div className="text-sm text-muted-foreground">No invoices this week.</div>}
              {['SPT','GMC'].map(kind => {
                const subset = procurement.settlements.filter(s => s.kind === kind);
                if (subset.length === 0) return null;
                const bySupplier = subset.reduce<Record<string, number>>((m, s) => {
                  m[s.supplier] = (m[s.supplier] || 0) + Number(s.amount || 0);
                  return m;
                }, {});
                return (
                  <div key={kind}>
                    <div className="text-sm font-medium text-muted-foreground mb-1">{kind}</div>
                    <div className="space-y-1">
                      {Object.entries(bySupplier).map(([supplier, amount]) => (
                        <div key={supplier} className="grid grid-cols-[auto_auto] items-center gap-x-3 w-fit text-sm">
                          <div className="flex-1 truncate">{supplier}</div>
                          <div className="text-red-800 font-mono tabular-nums">£{Number(amount).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium flex items-center gap-2"><Percent className="h-4 w-4 text-blue-600" /> Demand</div>
            </div>
            <Separator className="my-2" />
            <div className="mt-1">
              <ChartContainer
                config={{ awareness: { label: 'Awareness', color: 'hsl(217, 91%, 60%)' }, intent: { label: 'Intent', color: 'hsl(142, 71%, 45%)' }, demand: { label: 'Demand', color: 'hsl(10, 78%, 45%)' } }}
                className="h-48"
              >
                <LineChart data={demandData} margin={{ top: 6, right: 8, left: 8, bottom: 6 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tickLine={false} axisLine={false} domain={[0, 100]} width={30} />
                  <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} width={36} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Line yAxisId="left" type="monotone" dataKey="awareness" stroke="var(--color-awareness)" strokeWidth={2} dot={false} />
                  <Line yAxisId="left" type="monotone" dataKey="intent" stroke="var(--color-intent)" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="demand" stroke="var(--color-demand)" strokeWidth={2} dot={false} />
                  <ChartLegend verticalAlign="top" content={<ChartLegendContent className="!pb-1" />} />
                </LineChart>
              </ChartContainer>
            </div>
          </Card>

          <Card className="p-3 md:col-span-2">
            <div className="font-medium flex items-center gap-2"><Boxes className="h-4 w-4 text-blue-600" /> Raw Materials Arrivals</div>
            <Separator className="my-2" />
            <div className="space-y-2 max-h-32 overflow-auto pr-1">
              {procurement.arrivals.length === 0 && <div className="text-xs text-muted-foreground">No arrivals this week.</div>}
              {procurement.arrivals.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex-1 truncate">
                    {a.material} • <span className="text-green-800">+{a.goodUnits.toLocaleString()} units</span>
                    {Number(a.defectiveUnits || 0) > 0 && (
                      <span className="ml-2 text-red-700">({a.defectiveUnits?.toLocaleString()} defective)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-3 md:col-span-2">
            <div className="font-medium flex items-center gap-2"><Factory className="h-4 w-4 text-blue-600" /> Production & Finished Goods</div>
            <Separator className="my-2" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground mb-2">Batches Started</div>
                <div className="space-y-1 text-sm">
                  {production.started.length === 0 && <div className="text-muted-foreground">None</div>}
                  {production.started.map(b => (<div key={b.id}>{b.product} • {b.method} • <span className="text-green-800">+{b.quantity.toLocaleString()} units</span></div>))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Batches Completed</div>
                <div className="space-y-1 text-sm">
                  {production.completed.length === 0 && <div className="text-muted-foreground">None</div>}
                  {production.completed.map(b => (<div key={b.id}>{b.product} • <span className="text-green-800">+{b.quantity.toLocaleString()} units</span></div>))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">FG Lots Added</div>
                <div className="space-y-1 text-sm">
                  {inventory.finishedGoodsAdded.length === 0 && <div className="text-muted-foreground">None</div>}
                  {inventory.finishedGoodsAdded.map(l => (<div key={l.id}>{l.product} • <span className="text-green-800">+{l.quantity.toLocaleString()} units</span></div>))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}


