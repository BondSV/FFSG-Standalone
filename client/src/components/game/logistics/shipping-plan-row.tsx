import { Card } from "@/components/ui/card";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Lock, Truck, Zap, AlertTriangle, Factory, ExternalLink } from "lucide-react";
import {
  PRODUCT_LABELS,
  formatCurrency,
  formatNumber,
  statusChipClasses,
  STATUS_LABEL,
  LAUNCH_WEEK,
  type BatchStatus,
} from "./shared";

export interface ShippingPlanBatchRowData {
  id: string;
  product: string;
  method?: "inhouse" | "outsource";
  quantity: number;
  startWeek: number;
  /** First week after manufacturing; WIP clears when current week reaches this value (matches engine). */
  endWeek: number;
  /** Manufacturing lead in weeks — count of calendar weeks consuming capacity before completion. */
  leadWeeks?: number;
  /** Last week of active manufacturing — UI uses this instead of implying `endWeek` is part of prod. */
  productionLastWeek?: number;
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

interface ShippingPlanRowProps {
  batch: ShippingPlanBatchRowData;
  onChange: (batchId: string, mode: "standard" | "expedited") => void;
  pending?: boolean;
}

function productionSpanSubtitle(batch: ShippingPlanBatchRowData): string {
  const lead = batch.leadWeeks ?? Math.max(1, batch.endWeek - batch.startWeek);
  const last =
    batch.productionLastWeek ?? (batch.leadWeeks != null ? batch.startWeek + batch.leadWeeks - 1 : batch.endWeek - 1);
  const first = batch.startWeek;
  const wk = lead === 1 ? `W${first}` : `W${first}–W${last}`;
  return `${wk} (${lead}-wk prod · ships W${batch.endWeek})`;
}

export function ShippingPlanRow({ batch, onChange, pending }: ShippingPlanRowProps) {
  const recommendsExpedite =
    !batch.shippingLocked &&
    batch.shipping === "standard" &&
    batch.comparison.standard.onShelfWeek > LAUNCH_WEEK &&
    batch.comparison.expedited.onShelfWeek <= LAUNCH_WEEK;
  const isLate = batch.onShelfWeek > LAUNCH_WEEK;

  const lead = batch.leadWeeks ?? Math.max(1, batch.endWeek - batch.startWeek);
  /** Full calendar ladder from production hand-off (same as `ships W{endWeek}`) to on-shelf week (matches engine: freight weeks + one stocking week). */
  const standardWeeksToShelf = batch.comparison.standard.onShelfWeek - batch.endWeek;
  const expeditedWeeksToShelf = batch.comparison.expedited.onShelfWeek - batch.endWeek;
  const SHELF_TIMING_HELP =
    "The engine counts two steps after production finishes (“ships Wx”): a freight leg (2wk Standard vs 1wk Expedited) plus one stocking week before units are booked on shelves. So Expedited saves one week vs Standard overall.";

  return (
    <Card className="border border-gray-200 mb-2">
      <div className="flex flex-col md:flex-row md:items-center gap-3 p-4">
        <div className="md:w-64 shrink-0 min-w-0">
          <div className="flex items-start justify-between gap-2 min-h-[1.5rem]">
            <span className="text-sm font-semibold text-gray-900 truncate min-w-0 pr-2">
              {PRODUCT_LABELS[batch.product] || batch.product}
            </span>
            <div className="flex shrink-0 items-center gap-1 flex-wrap justify-end max-w-[9.5rem]">
              <span
                className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border whitespace-nowrap ${statusChipClasses(batch.status)}`}
              >
                {STATUS_LABEL[batch.status]}
              </span>
              {batch.method && (
                <TooltipWrapper
                  content={
                    batch.method === "inhouse"
                      ? `In-house: ${lead}-week manufacturing lead before shipping (SKU-specific jacket 3 · dress/pants 2). Uses one 25k rung of capacity each active week; lower unit cost vs outsource.`
                      : `Outsourced: ${lead}-week manufacturing before shipping — higher unit cost, no in-house capacity.`
                  }
                >
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border cursor-help whitespace-nowrap ${
                      batch.method === "inhouse"
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                  >
                    {batch.method === "inhouse" ? <Factory size={10} /> : <ExternalLink size={10} />}
                    {batch.method === "inhouse" ? "In-house" : "Outsourced"}
                  </span>
                </TooltipWrapper>
              )}
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-1 leading-snug">
            {formatNumber(batch.quantity)} units · {productionSpanSubtitle(batch)}
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={batch.shippingLocked || pending}
            onClick={() => onChange(batch.id, "standard")}
            className={`text-left rounded-md border p-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              batch.shipping === "standard"
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-gray-200 hover:border-gray-300 bg-white"
            } ${batch.shippingLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <Truck size={14} /> Standard
              </div>
              <TooltipWrapper content={SHELF_TIMING_HELP}>
                <span className="text-[10px] text-gray-500 cursor-help border-b border-dotted border-gray-300">
                  {standardWeeksToShelf} wk handoff→shelf
                </span>
              </TooltipWrapper>
            </div>
            <div className="text-xs text-gray-600">
              {formatCurrency(batch.comparison.standard.totalCost)} ·
              <span className={`ml-1 ${batch.comparison.standard.onShelfWeek > LAUNCH_WEEK ? "text-red-600 font-semibold" : "text-gray-600"}`}>
                arrives W{batch.comparison.standard.onShelfWeek}
              </span>
            </div>
          </button>
          <button
            type="button"
            disabled={batch.shippingLocked || pending}
            onClick={() => onChange(batch.id, "expedited")}
            className={`text-left rounded-md border p-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              batch.shipping === "expedited"
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-gray-200 hover:border-gray-300 bg-white"
            } ${batch.shippingLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${
              recommendsExpedite ? "ring-1 ring-amber-300" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <Zap size={14} /> Expedited
              </div>
              <TooltipWrapper content={SHELF_TIMING_HELP}>
                <span className="text-[10px] text-gray-500 cursor-help border-b border-dotted border-gray-300">
                  {expeditedWeeksToShelf} wk handoff→shelf
                </span>
              </TooltipWrapper>
            </div>
            <div className="text-xs text-gray-600">
              {formatCurrency(batch.comparison.expedited.totalCost)} ·
              <span className={`ml-1 ${batch.comparison.expedited.onShelfWeek > LAUNCH_WEEK ? "text-red-600 font-semibold" : "text-gray-600"}`}>
                arrives W{batch.comparison.expedited.onShelfWeek}
              </span>
            </div>
          </button>
        </div>

        <div className="md:w-32 text-right shrink-0 flex items-center justify-end gap-2">
          {batch.shippingLocked ? (
            <TooltipWrapper content="Shipping mode is locked once the batch enters production.">
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <Lock size={12} /> Locked
              </span>
            </TooltipWrapper>
          ) : recommendsExpedite ? (
            <TooltipWrapper content="Switching to Expedited would land this batch on shelves by launch (Week 7).">
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-medium">
                <AlertTriangle size={12} /> Late
              </span>
            </TooltipWrapper>
          ) : isLate ? (
            <TooltipWrapper content="Even Expedited shipping won't get this batch to shelves by launch — late entry will incur lost sales.">
              <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                <AlertTriangle size={12} /> Past launch
              </span>
            </TooltipWrapper>
          ) : (
            <span className="text-xs text-emerald-700 font-medium">On time</span>
          )}
        </div>
      </div>
    </Card>
  );
}
