export const FABRIC_DEMAND_LIFT: Record<string, number> = {
  selvedgeDenim: 0.06,
  standardDenim: 0.00,
  egyptianCotton: 0.05,
  polyesterBlend: -0.02,
  fineWaleCorduroy: 0.04,
  wideWaleCorduroy: 0.00,
};

export const PRINT_DEMAND_LIFT = 0.03;

type ProductInfo = {
  forecast: number;
  hmPrice: number;
  elasticity: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function calculatePositioningEffect(productInfo: ProductInfo, rrp: number): number {
  const targetPrice = productInfo.hmPrice * 1.2;
  if (!Number.isFinite(rrp) || rrp <= 0 || targetPrice <= 0) return 0;

  const ratioToTarget = rrp / targetPrice;
  const priceResistance = Math.pow(ratioToTarget, productInfo.elasticity);
  const targetFit = ratioToTarget < 1
    ? Math.max(0.65, 1 - 1.2 * Math.pow(1 - ratioToTarget, 0.8))
    : Math.max(0.25, 1 - 1.15 * Math.pow(ratioToTarget - 1, 1.35));

  return clamp(priceResistance * targetFit, 0.15, 2);
}

export function calculateDesignEffect(fabricId?: string | null, hasPrint = false): number {
  const fabricLift = fabricId ? FABRIC_DEMAND_LIFT[fabricId] || 0 : 0;
  const printLift = hasPrint ? PRINT_DEMAND_LIFT : 0;
  return Math.max(0.5, 1 + fabricLift + printLift);
}

export function estimateSeasonDemand(
  productInfo: ProductInfo,
  rrp: number,
  discount = 0,
  fabricId?: string | null,
  hasPrint = false
): number | null {
  if (!Number.isFinite(rrp) || rrp <= 0) return null;

  const finalPrice = Math.max(0.01, rrp * (1 - clamp(discount, -1, 0.95)));
  const discountEffect = Math.pow(finalPrice / Math.max(0.01, rrp), productInfo.elasticity);
  const demand = productInfo.forecast
    * calculatePositioningEffect(productInfo, rrp)
    * discountEffect
    * calculateDesignEffect(fabricId, hasPrint);

  return Math.round(clamp(demand, 0, productInfo.forecast * 2));
}
