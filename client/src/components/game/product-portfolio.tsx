import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductIcon } from "@/components/ui/product-icon";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";

interface ProductPortfolioProps {
  currentState: any;
}

const fallbackProducts: Record<string, { name: string; forecast: number; hmPrice: number; highEndRange: [number, number]; elasticity: number }> = {
  jacket: { name: "Vintage Denim Jacket", forecast: 100000, hmPrice: 80, highEndRange: [300, 550], elasticity: -1.40 },
  dress: { name: "Floral Print Dress", forecast: 150000, hmPrice: 50, highEndRange: [180, 210], elasticity: -1.20 },
  pants: { name: "Corduroy Pants", forecast: 120000, hmPrice: 60, highEndRange: [190, 220], elasticity: -1.55 },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);

const formatNumber = (value: number) => new Intl.NumberFormat("en-GB").format(Math.round(value || 0));

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ProductPortfolio({ currentState }: ProductPortfolioProps) {
  const { data: gameConstants } = useQuery({ queryKey: ["/api/game/constants"], retry: false });
  const productData = currentState?.productData || {};
  const week = num(currentState?.weekNumber) || 1;

  const productsCfg = (gameConstants as any)?.PRODUCTS || fallbackProducts;
  const productKeys = Object.keys(productsCfg) as Array<keyof typeof productsCfg>;

  const isPostLaunch = week >= 7;

  const getProductStatus = (productId: string) => {
    const data = productData[productId] || {};
    if (!data.rrp) return { label: "RRP not set", classes: "bg-gray-100 text-gray-700 border-gray-200" };
    if (week <= 2) return { label: "Ready for lock", classes: "bg-amber-100 text-amber-700 border-amber-200" };
    return { label: "RRP locked", classes: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  };

  const positioningHint = (productId: string) => {
    const cfg = productsCfg[productId];
    const data = productData[productId];
    if (!cfg || !data?.rrp) return null;
    const rrp = num(data.rrp);
    const hm = num(cfg.hmPrice);
    if (!hm) return null;
    const diff = (rrp - hm) / hm;
    if (diff < 0.10) return { text: "Aggressive vs H&M", classes: "text-red-600" };
    if (diff < 0.30) return { text: "Mass-market range", classes: "text-amber-600" };
    if (diff < 0.80) return { text: "Premium positioning", classes: "text-emerald-600" };
    return { text: "Luxury positioning", classes: "text-purple-600" };
  };

  return (
    <Card className="border border-gray-100">
      <CardHeader>
        <CardTitle>Product Portfolio — Vintage Revival Collection</CardTitle>
        <p className="text-sm text-gray-600">
          {week <= 2
            ? "Set your Recommended Retail Price (RRP) and design choices by end of Week 2"
            : isPostLaunch
            ? "Live performance: design choices, last-week demand, and sales-to-date"
            : "Locked design and pricing — review while you build production and procurement plans"}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {productKeys.map((id) => {
            const cfg = productsCfg[id];
            const data = productData[id] || {};
            const status = getProductStatus(id as string);
            const pos = positioningHint(id as string);
            const dem = num(currentState?.weeklyDemand?.[id as any]);
            const sales = num(currentState?.weeklySales?.[id as any]);
            const lost = num(currentState?.lostSales?.[id as any]);
            const fillRate = dem > 0 ? sales / dem : null;
            const fabric = data.fabric || null;
            const hasPrint = !!data.hasPrint;

            return (
              <div key={id as string} className="border border-gray-200 rounded-lg p-4 bg-white">
                <div className="w-full h-32 bg-gray-100 rounded-lg mb-4 flex items-center justify-center">
                  <ProductIcon productId={id as string} size={56} />
                </div>

                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{cfg.name}</h3>
                  <Badge className={`${status.classes}`} variant="outline">{status.label}</Badge>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <TooltipWrapper content="Top-of-funnel forecast for the season — used as a planning anchor only.">
                      <span className="text-gray-600 cursor-help">Forecast (season):</span>
                    </TooltipWrapper>
                    <span className="font-mono">{formatNumber(cfg.forecast)} units</span>
                  </div>
                  <div className="flex justify-between">
                    <TooltipWrapper content="Mass-market reference price (H&M-style retailer).">
                      <span className="text-gray-600 cursor-help">H&amp;M price:</span>
                    </TooltipWrapper>
                    <span className="font-mono">{formatCurrency(cfg.hmPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <TooltipWrapper content="High-end retailer reference price range.">
                      <span className="text-gray-600 cursor-help">High-end:</span>
                    </TooltipWrapper>
                    <span className="font-mono text-xs">£{Array.isArray(cfg.highEndRange) ? `${cfg.highEndRange[0]}–${cfg.highEndRange[1]}` : cfg.highEndRange}</span>
                  </div>
                  <div className="flex justify-between">
                    <TooltipWrapper content="Price elasticity. More negative = demand drops faster as price rises.">
                      <span className="text-gray-600 cursor-help">Elasticity:</span>
                    </TooltipWrapper>
                    <span className="font-mono">{Number(cfg.elasticity).toFixed(2)}</span>
                  </div>

                  {data.rrp && (
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-600">Your RRP:</span>
                      <span className="font-mono font-semibold">{formatCurrency(data.rrp)}</span>
                    </div>
                  )}

                  {fabric && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Fabric:</span>
                      <span className="text-xs font-medium">{fabric}{hasPrint ? " (with print)" : ""}</span>
                    </div>
                  )}

                  {pos && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Positioning:</span>
                      <span className={`text-xs font-medium ${pos.classes}`}>{pos.text}</span>
                    </div>
                  )}
                </div>

                {isPostLaunch && (
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Last week</div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-gray-500 text-xs">Demand</div>
                        <div className="font-mono font-semibold">{formatNumber(dem)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">Sold</div>
                        <div className="font-mono font-semibold">{formatNumber(sales)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs">Lost</div>
                        <div className={`font-mono font-semibold ${lost > 0 ? "text-red-600" : ""}`}>{formatNumber(lost)}</div>
                      </div>
                    </div>
                    {fillRate != null && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Fill rate: {(fillRate * 100).toFixed(1)}%</div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${fillRate >= 0.95 ? "bg-emerald-500" : fillRate >= 0.85 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(fillRate * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
