import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import { LAUNCH_WEEK, PRODUCT_LABELS, formatCurrency, type BatchStatus } from "./shared";

interface ShippingPlanBatch {
  id: string;
  product: string;
  quantity: number;
  startWeek: number;
  endWeek: number;
  shipping: "standard" | "expedited";
  shippingLocked: boolean;
  onShelfWeek: number;
  status: BatchStatus;
  comparison: {
    standard: { unitCost: number; totalCost: number; onShelfWeek: number };
    expedited: { unitCost: number; totalCost: number; onShelfWeek: number };
    cashDeltaToExpedite: number;
  };
}

interface LaunchReadinessProps {
  shippingPlan: ShippingPlanBatch[];
  currentWeek: number;
  onExpediteAllLate: () => void;
  expediting: boolean;
}

export function LaunchReadiness({ shippingPlan, currentWeek, onExpediteAllLate, expediting }: LaunchReadinessProps) {
  const { onTime, late, lateBatches, expediteCashDelta, canExpediteLate } = useMemo(() => {
    let onTime = 0;
    let late = 0;
    const lateBatches: ShippingPlanBatch[] = [];
    let expediteCashDelta = 0;
    let canExpediteLate = false;
    for (const b of shippingPlan) {
      if (b.onShelfWeek <= LAUNCH_WEEK) {
        onTime += 1;
      } else {
        late += 1;
        lateBatches.push(b);
        if (!b.shippingLocked && b.shipping === "standard" && b.comparison.expedited.onShelfWeek <= LAUNCH_WEEK) {
          expediteCashDelta += b.comparison.cashDeltaToExpedite;
          canExpediteLate = true;
        }
      }
    }
    return { onTime, late, lateBatches, expediteCashDelta, canExpediteLate };
  }, [shippingPlan]);

  const total = shippingPlan.length;
  const headline = total === 0
    ? "No production batches scheduled yet"
    : late === 0
    ? `All ${total} batches arrive on time`
    : `${onTime} of ${total} batches arrive by launch · ${late} late`;

  const earliestArrival = shippingPlan.length > 0 ? Math.min(...shippingPlan.map((b) => b.onShelfWeek)) : currentWeek;
  const latestArrival = shippingPlan.length > 0 ? Math.max(...shippingPlan.map((b) => b.onShelfWeek), LAUNCH_WEEK + 1) : LAUNCH_WEEK + 1;
  const timelineStart = Math.max(1, Math.min(currentWeek, earliestArrival, LAUNCH_WEEK - 2));
  const timelineEnd = Math.max(LAUNCH_WEEK + 1, latestArrival, currentWeek + 2);
  const timelineSpan = Math.max(1, timelineEnd - timelineStart);
  const pct = (week: number) => ((week - timelineStart) / timelineSpan) * 100;

  return (
    <Card className={`border mb-6 ${late > 0 ? "border-red-200 bg-red-50/30" : "border-emerald-200 bg-emerald-50/30"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            {late === 0 ? (
              <CheckCircle2 size={22} className="text-emerald-600 mt-0.5" />
            ) : (
              <AlertTriangle size={22} className="text-red-600 mt-0.5" />
            )}
            <div>
              <CardTitle className="text-base">Launch Readiness</CardTitle>
              <p className="text-sm text-gray-700 mt-0.5">{headline}</p>
            </div>
          </div>
          {canExpediteLate && (
            <TooltipWrapper content={`Switch all currently-late batches that can still arrive on time to Expedited shipping. Net cash impact: ${formatCurrency(expediteCashDelta)} extra.`}>
              <Button
                onClick={onExpediteAllLate}
                disabled={expediting}
                size="sm"
                variant="default"
                className="gap-2"
              >
                <Zap size={14} />
                Expedite all late ({late})
                <span className="opacity-80">+{formatCurrency(expediteCashDelta)}</span>
              </Button>
            </TooltipWrapper>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative h-12">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-200" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3 w-1 bg-gray-400 rounded"
            style={{ left: `${pct(currentWeek)}%` }}
            title={`Now: Week ${currentWeek}`}
          />
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500"
            style={{ left: `${pct(LAUNCH_WEEK)}%` }}
          >
            <div className="absolute -top-4 -translate-x-1/2 text-[10px] font-semibold text-red-600 whitespace-nowrap">
              Launch W{LAUNCH_WEEK}
            </div>
          </div>
          {shippingPlan.map((b) => {
            const isLate = b.onShelfWeek > LAUNCH_WEEK;
            return (
              <TooltipWrapper
                key={b.id}
                content={`${PRODUCT_LABELS[b.product] || b.product} · ${b.quantity.toLocaleString()} units · ${b.shipping} shipping · arrives W${b.onShelfWeek}`}
              >
                <div
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full border-2 border-white shadow cursor-help ${
                    isLate ? "bg-red-500" : "bg-emerald-500"
                  }`}
                  style={{ left: `${pct(b.onShelfWeek)}%` }}
                />
              </TooltipWrapper>
            );
          })}
          <div className="absolute left-0 -bottom-5 text-[10px] text-gray-500">W{timelineStart}</div>
          <div className="absolute right-0 -bottom-5 text-[10px] text-gray-500">W{timelineEnd}</div>
        </div>
        {late > 0 && (
          <div className="mt-7 text-xs text-gray-600">
            Late batches: {lateBatches.map((b) => `${PRODUCT_LABELS[b.product] || b.product} (W${b.onShelfWeek})`).join(", ")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
