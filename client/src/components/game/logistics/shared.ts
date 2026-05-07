// Shared helpers for the Inventory & Logistics tab components.

export const PRODUCT_LABELS: Record<string, string> = {
  jacket: "Vintage Denim Jacket",
  dress: "Floral Print Dress",
  pants: "Corduroy Pants",
};

export const STAGE_COLORS = {
  rm: "var(--chart-1)",
  wip: "var(--chart-2)",
  inTransit: "var(--chart-3)",
  fg: "var(--chart-4)",
} as const;

export const PRODUCT_COLORS: Record<string, string> = {
  jacket: "var(--chart-1)",
  dress: "var(--chart-2)",
  pants: "var(--chart-3)",
};

export const LAUNCH_WEEK = 7;

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatCurrencyDecimal(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB").format(Math.round(value || 0));
}

export type BatchStatus = "planned" | "inProduction" | "inTransit" | "delivered";

export const STATUS_LABEL: Record<BatchStatus, string> = {
  planned: "Planned",
  inProduction: "In Production",
  inTransit: "In Transit",
  delivered: "Delivered",
};

// Returns Tailwind classes for a status chip
export function statusChipClasses(status: BatchStatus): string {
  switch (status) {
    case "planned":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "inProduction":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "inTransit":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "delivered":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

// Determines a "health" indicator color for a numeric metric (0-100 scale)
export function healthColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

// Returns weeks-of-cover for a product given on-hand and projected demand
export function weeksOfCover(onHand: number, weeklyDemand: number): number {
  if (!weeklyDemand || weeklyDemand <= 0) return Infinity;
  return Math.round((onHand / weeklyDemand) * 10) / 10;
}
