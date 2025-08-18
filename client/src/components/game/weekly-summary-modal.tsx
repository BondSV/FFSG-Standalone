import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { WeeklySummary } from '@/types/weekly-summary';
import { TrendingUp, Percent, Boxes, CreditCard, Factory } from 'lucide-react';

type Props = { open: boolean; onOpenChange: (v: boolean) => void; summary: WeeklySummary };

export function WeeklySummaryModal({ open, onOpenChange, summary }: Props) {
  const { cash, procurement, inventory, production, marketing } = summary;

  const outflows = [
    { name: 'Marketing', value: cash.outflows.marketing },
    { name: 'SPT', value: cash.outflows.materialsSPT },
    { name: 'GMC', value: cash.outflows.materialsGMC },
    { name: 'Production', value: cash.outflows.production },
    { name: 'Logistics', value: cash.outflows.logistics },
    { name: 'Holding', value: cash.outflows.holding },
  ].filter(x => x.value > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-white/90 backdrop-blur border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Week {summary.weekNumber} is live — Here’s what happened
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">Cash Waterfall</div>
              <Badge variant="secondary">Interest £{cash.interest.toLocaleString()}</Badge>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              Opening cash £{cash.openingCash.toLocaleString()} • Credit £{cash.openingCredit.toLocaleString()}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {outflows.map(x => (
                <div key={x.name} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{x.name}</span>
                  <span>£{x.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-sm">
              Revenue £{cash.revenue.toLocaleString()} • Closing cash £{cash.closingCash.toLocaleString()} • Credit £{cash.closingCredit.toLocaleString()}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium flex items-center gap-2"><Percent className="h-4 w-4 text-blue-600" /> Awareness & Intent</div>
              <Badge>{marketing.planApplied?.length ? 'Plan applied' : 'No spend'}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Awareness</div>
                <div className="text-lg font-semibold">
                  {marketing.aiDelta.awarenessFrom.toFixed(1)} → {marketing.aiDelta.awarenessTo.toFixed(1)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Intent</div>
                <div className="text-lg font-semibold">
                  {marketing.aiDelta.intentFrom.toFixed(1)} → {marketing.aiDelta.intentTo.toFixed(1)}
                </div>
              </div>
            </div>
            {marketing.charged > 0 && (
              <div className="mt-3 text-sm text-muted-foreground">
                Charged: £{marketing.charged.toLocaleString()}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="font-medium flex items-center gap-2"><Boxes className="h-4 w-4 text-blue-600" /> Raw Materials Arrivals</div>
            <Separator className="my-3" />
            <div className="space-y-2 max-h-40 overflow-auto pr-1">
              {procurement.arrivals.length === 0 && <div className="text-sm text-muted-foreground">No arrivals this week.</div>}
              {procurement.arrivals.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex-1 truncate">{a.supplier} • {a.material} • +{a.goodUnits.toLocaleString()} u</div>
                  <div>£{a.amount.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="font-medium flex items-center gap-2"><CreditCard className="h-4 w-4 text-blue-600" /> Settlements Charged</div>
            <Separator className="my-3" />
            <div className="space-y-2 max-h-40 overflow-auto pr-1">
              {procurement.settlements.length === 0 && <div className="text-sm text-muted-foreground">No settlements this week.</div>}
              {procurement.settlements.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex-1 truncate">{s.kind} • {s.supplier}:{s.material}</div>
                  <div>£{s.amount.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 md:col-span-2">
            <div className="font-medium flex items-center gap-2"><Factory className="h-4 w-4 text-blue-600" /> Production & Finished Goods</div>
            <Separator className="my-3" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground mb-2">Batches Started</div>
                <div className="space-y-1 text-sm">
                  {production.started.length === 0 && <div className="text-muted-foreground">None</div>}
                  {production.started.map(b => (<div key={b.id}>{b.product} • {b.method} • {b.quantity.toLocaleString()} u</div>))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Batches Completed</div>
                <div className="space-y-1 text-sm">
                  {production.completed.length === 0 && <div className="text-muted-foreground">None</div>}
                  {production.completed.map(b => (<div key={b.id}>{b.product} • {b.quantity.toLocaleString()} u</div>))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">FG Lots Added</div>
                <div className="space-y-1 text-sm">
                  {inventory.finishedGoodsAdded.length === 0 && <div className="text-muted-foreground">None</div>}
                  {inventory.finishedGoodsAdded.map(l => (<div key={l.id}>{l.product} • +{l.quantity.toLocaleString()} u</div>))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}


