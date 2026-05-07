import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { ArrowRight } from "lucide-react";
import { formatNumber } from "./shared";

interface InventoryPipelineProps {
  ordered: number;
  inTransit: number;
  onHand: number;
  allocated: number;
  inProduction: number;
  inShipping: number;
  onShelf: number;
  soldToDate: number;
  lostToDate: number;
}

interface StageProps {
  label: string;
  value: number;
  hint: string;
  highlight?: boolean;
}

function Stage({ label, value, hint, highlight }: StageProps) {
  return (
    <TooltipWrapper content={hint}>
      <div
        className={`flex flex-col items-center justify-center rounded-md border px-3 py-3 min-w-[88px] cursor-help ${
          highlight ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"
        }`}
      >
        <div className="text-xs text-gray-500 whitespace-nowrap">{label}</div>
        <div className="text-base font-semibold text-gray-900 mt-0.5">{formatNumber(value)}</div>
      </div>
    </TooltipWrapper>
  );
}

export function InventoryPipeline(props: InventoryPipelineProps) {
  const stages: Array<{ label: string; value: number; hint: string; highlight?: boolean }> = [
    {
      label: "Ordered",
      value: props.ordered,
      hint: "Materials still in transit from suppliers (will arrive in coming weeks).",
    },
    {
      label: "In Transit",
      value: props.inTransit,
      hint: "Materials currently being shipped from suppliers (sum of in-transit fabric units).",
    },
    {
      label: "On Hand",
      value: props.onHand,
      hint: "Raw materials in your warehouse, ready to allocate to production.",
    },
    {
      label: "Allocated",
      value: props.allocated,
      hint: "Raw materials reserved for in-progress batches (no longer available to allocate).",
      highlight: props.allocated > 0,
    },
    {
      label: "In Production",
      value: props.inProduction,
      hint: "Units currently in WIP batches (not yet finished goods).",
    },
    {
      label: "In Shipping",
      value: props.inShipping,
      hint: "Finished batches in transit to your shelves (Standard 2 wks / Expedited 1 wk + 1).",
    },
    {
      label: "On Shelf",
      value: props.onShelf,
      hint: "Finished goods available for sale right now.",
    },
    {
      label: "Sold",
      value: props.soldToDate,
      hint: "Total units sold so far this season.",
    },
    {
      label: "Lost Sales",
      value: props.lostToDate,
      hint: "Demand we could not fulfil (no inventory). Hurts service level.",
      highlight: props.lostToDate > 0,
    },
  ];

  return (
    <Card className="border border-gray-100 mb-6">
      <CardHeader>
        <CardTitle className="text-base">Inventory Pipeline</CardTitle>
        <p className="text-xs text-gray-500">Aggregate units at each stage of the supply chain.</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:overflow-x-auto">
          {stages.map((stage, idx) => (
            <div key={stage.label} className="flex items-center gap-2 shrink-0">
              <Stage label={stage.label} value={stage.value} hint={stage.hint} highlight={stage.highlight} />
              {idx < stages.length - 1 && <ArrowRight size={14} className="text-gray-300 shrink-0" />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
