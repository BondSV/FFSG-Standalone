import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Banknote, CreditCard, ShoppingBag, Target, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardsProps {
  currentState: any;
  gameSession?: any;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);

const formatNumber = (value: number) => new Intl.NumberFormat("en-GB").format(Math.round(value || 0));

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function trendIcon(delta: number) {
  if (delta > 0) return <TrendingUp className="text-emerald-600" size={14} />;
  if (delta < 0) return <TrendingDown className="text-red-600" size={14} />;
  return <Minus className="text-gray-400" size={14} />;
}

export default function KpiCards({ currentState, gameSession }: KpiCardsProps) {
  const { data: gameConstants } = useQuery({ queryKey: ["/api/game/constants"], retry: false });
  const { data: weeksData } = useQuery<{ weeks: any[] }>({
    queryKey: ["/api/game", gameSession?.id, "weeks"],
    enabled: !!gameSession?.id,
    retry: false,
  });

  const cashOnHand = num(currentState?.cashOnHand);
  const creditUsed = num(currentState?.creditUsed);
  const creditLimit = num((gameConstants as any)?.CREDIT_LIMIT) || 1_000_000;
  const creditAvailable = creditLimit - creditUsed;
  const currentWeek = num(currentState?.weekNumber) || 1;

  const weeks = (weeksData as any)?.weeks || [];

  const liveStats = useMemo(() => {
    let revenueYtd = 0;
    let unitsSold = 0;
    let unitsDemand = 0;
    let salesWindow = 0;
    let demandWindow = 0;
    const sortedWeeks = [...weeks].sort((a: any, b: any) => num(a.weekNumber) - num(b.weekNumber));
    let prevCash: number | null = null;
    let cashLastWeek = 0;
    for (const w of sortedWeeks) {
      revenueYtd += num(w.weeklyRevenue);
      const sales = num(w.weeklySales?.jacket) + num(w.weeklySales?.dress) + num(w.weeklySales?.pants);
      const demand = num(w.weeklyDemand?.jacket) + num(w.weeklyDemand?.dress) + num(w.weeklyDemand?.pants);
      unitsSold += sales;
      unitsDemand += demand;
      if (num(w.weekNumber) >= currentWeek - 4 && demand > 0) {
        salesWindow += sales;
        demandWindow += demand;
      }
      cashLastWeek = num(w.cashOnHand);
    }
    if (sortedWeeks.length >= 2) {
      prevCash = num(sortedWeeks[sortedWeeks.length - 2].cashOnHand);
    }
    const rollingService = demandWindow > 0 ? salesWindow / demandWindow : null;
    const cashDelta = prevCash != null ? cashLastWeek - prevCash : 0;
    return { revenueYtd, unitsSold, unitsDemand, rollingService, cashDelta };
  }, [weeks, currentWeek]);

  const serviceLevel = liveStats.rollingService;
  const serviceLevelPct = serviceLevel != null ? serviceLevel * 100 : null;
  const isPostLaunch = currentWeek >= 7;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Cash on Hand */}
      <Card className="border border-gray-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <TooltipWrapper content="Your current liquid cash. Operational expenses (production, shipping) and start-of-week payments (interest, holding, marketing, supplier invoices) are paid from this. If cash hits zero, the credit line is automatically drawn.">
                <p className="text-sm font-medium text-gray-600 cursor-help">Cash on Hand</p>
              </TooltipWrapper>
              <p className="text-2xl font-bold text-gray-900 font-mono">{formatCurrency(cashOnHand)}</p>
            </div>
            <div className="h-12 w-12 bg-secondary bg-opacity-10 rounded-lg flex items-center justify-center">
              <Banknote className="text-secondary" size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-sm">
            {trendIcon(liveStats.cashDelta)}
            <span className={liveStats.cashDelta >= 0 ? "text-emerald-600" : "text-red-600"}>
              {liveStats.cashDelta === 0 ? "—" : `${liveStats.cashDelta >= 0 ? "+" : ""}${formatCurrency(liveStats.cashDelta)} last week`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Credit Available */}
      <Card className="border border-gray-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <TooltipWrapper content={`Remaining credit line. Drawn automatically if cash is exhausted. Interest of ${(num((gameConstants as any)?.WEEKLY_INTEREST_RATE) * 100 || 0.2).toFixed(1)}% per week is charged on outstanding balance.`}>
                <p className="text-sm font-medium text-gray-600 cursor-help">Credit Available</p>
              </TooltipWrapper>
              <p className="text-2xl font-bold text-gray-900 font-mono">{formatCurrency(creditAvailable)}</p>
            </div>
            <div className="h-12 w-12 bg-accent bg-opacity-10 rounded-lg flex items-center justify-center">
              <CreditCard className="text-accent" size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <span>Drawn: <span className="font-mono font-semibold text-red-600">{formatCurrency(creditUsed)}</span></span>
          </div>
        </CardContent>
      </Card>

      {/* Revenue YTD */}
      <Card className="border border-gray-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <TooltipWrapper content="Total revenue from sales since the season started. Begins accumulating at Week 7 (sales phase). Comparable across runs.">
                <p className="text-sm font-medium text-gray-600 cursor-help">Revenue YTD</p>
              </TooltipWrapper>
              <p className="text-2xl font-bold text-gray-900 font-mono">{formatCurrency(liveStats.revenueYtd)}</p>
            </div>
            <div className="h-12 w-12 bg-primary bg-opacity-10 rounded-lg flex items-center justify-center">
              <ShoppingBag className="text-primary" size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <span>Units sold: <span className="font-mono font-semibold">{formatNumber(liveStats.unitsSold)}</span></span>
          </div>
        </CardContent>
      </Card>

      {/* Service Level */}
      <Card className="border border-gray-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <TooltipWrapper content="4-week rolling service level (units sold / units demanded). Target ≥ 95%. Below 95% means stockouts and lost sales.">
                <p className="text-sm font-medium text-gray-600 cursor-help">Service Level (4w)</p>
              </TooltipWrapper>
              <p className="text-2xl font-bold text-gray-900 font-mono">
                {isPostLaunch && serviceLevelPct != null ? `${serviceLevelPct.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
              isPostLaunch && serviceLevelPct != null
                ? serviceLevelPct >= 95
                  ? "bg-emerald-100"
                  : serviceLevelPct >= 85
                  ? "bg-amber-100"
                  : "bg-red-100"
                : "bg-gray-100"
            }`}>
              <Target className={
                isPostLaunch && serviceLevelPct != null
                  ? serviceLevelPct >= 95
                    ? "text-emerald-600"
                    : serviceLevelPct >= 85
                    ? "text-amber-600"
                    : "text-red-600"
                  : "text-gray-400"
              } size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm text-gray-500">
            <span>Target: ≥ 95%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
