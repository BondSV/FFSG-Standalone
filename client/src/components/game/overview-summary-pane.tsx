import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { WeeklySummary } from '@/types/weekly-summary';

export function OverviewSummaryPane({ summary }: { summary: WeeklySummary }) {
  return (
    <Card className="p-4 mb-4 border-blue-100 bg-gradient-to-b from-white to-blue-50">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Week {summary.weekNumber} Summary</div>
        <div className="text-sm text-muted-foreground">{new Date(summary.generatedAt).toLocaleString()}</div>
      </div>
      <Separator className="my-3" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-muted-foreground">Cash outflows</div>
          <div className="font-medium">
            £{(
              summary.cash.outflows.marketing +
              summary.cash.outflows.materialsSPT +
              summary.cash.outflows.materialsGMC +
              summary.cash.outflows.production +
              summary.cash.outflows.logistics +
              summary.cash.outflows.holding
            ).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Interest</div>
          <div className="font-medium">£{summary.cash.interest.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Arrivals</div>
          <div className="font-medium">{summary.procurement.arrivals.reduce((s, a) => s + a.goodUnits, 0).toLocaleString()} u</div>
        </div>
        <div>
          <div className="text-muted-foreground">A / I</div>
          <div className="font-medium">
            {summary.marketing.aiDelta.awarenessFrom.toFixed(1)}→{summary.marketing.aiDelta.awarenessTo.toFixed(1)} / {summary.marketing.aiDelta.intentFrom.toFixed(1)}→{summary.marketing.aiDelta.intentTo.toFixed(1)}
          </div>
        </div>
      </div>
    </Card>
  );
}


