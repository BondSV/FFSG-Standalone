import type { WeeklySummary, LedgerEntry, InventoryDelta } from '@/types/weekly-summary';

export function computeWeekSummary(params: {
  gameSessionId: string;
  prevState: any;      // Week N
  nextState: any;      // Week N+1 (fresh)
  ledgerRowsN1: LedgerEntry[]; // filtered to weekNumber === nextState.weekNumber
}): WeeklySummary {
  const { gameSessionId, prevState, nextState, ledgerRowsN1 } = params;
  const w = Number(nextState.weekNumber);

  const sum = (t: string) => ledgerRowsN1.filter(r => r.entryType === t).reduce((s, r) => s + Number(r.amount || 0), 0);

  const cash: WeeklySummary['cash'] = {
    openingCash: Number(nextState.cashOnHand || 0),
    openingCredit: Number(nextState.creditUsed || 0),
    interest: sum('interest'),
    outflows: {
      marketing: sum('marketing'),
      materialsSPT: sum('materials_spt'),
      materialsGMC: sum('materials_gmc'),
      production: sum('production'),
      logistics: sum('logistics'),
      holding: sum('holding'),
    },
    revenue: Number(prevState.weeklyRevenue || 0),
    autoPaydown: 0,
    closingCash: Number(nextState.cashOnHand || 0),
    closingCredit: Number(nextState.creditUsed || 0),
  };

  // Inventory deltas (RM)
  const prevRM = prevState.rawMaterials || {};
  const nextRM = nextState.rawMaterials || {};
  const mats = Array.from(new Set([...Object.keys(prevRM), ...Object.keys(nextRM)]));
  const rmDeltas: InventoryDelta[] = mats.map(material => {
    const p = prevRM[material] || { onHand: 0, onHandValue: 0 };
    const n = nextRM[material] || { onHand: 0, onHandValue: 0 };
    return {
      material,
      deltaUnits: Number(n.onHand || 0) - Number(p.onHand || 0),
      deltaValue: Number(n.onHandValue || 0) - Number(p.onHandValue || 0),
      onHandAfter: Number(n.onHand || 0),
      avgUnitCostAfter: Number(n.onHand || 0) > 0 ? Number(n.onHandValue || 0) / Number(n.onHand || 1) : undefined,
    };
  }).filter(d => d.deltaUnits !== 0 || d.deltaValue !== 0);

  const arrivals = rmDeltas
    .filter(d => d.deltaUnits > 0)
    .map(d => {
      const unitPrice = d.deltaUnits !== 0 ? Math.abs(d.deltaValue) / Math.abs(d.deltaUnits) : 0;
      const refRow = ledgerRowsN1.find(r => (r.entryType === 'materials_spt' || r.entryType === 'materials_gmc') && r.refId?.endsWith(`:${d.material}`));
      const supplier = refRow?.refId?.split(':')[0] || 'unknown';
      return { supplier, material: d.material, goodUnits: d.deltaUnits, unitPrice, amount: unitPrice * d.deltaUnits };
    });

  const settlements = ledgerRowsN1
    .filter(r => r.entryType === 'materials_spt' || r.entryType === 'materials_gmc')
    .map(r => {
      const [supplier, material] = (r.refId || 'unknown:unknown').split(':');
      return {
        kind: r.entryType === 'materials_spt' ? 'SPT' as const : 'GMC' as const,
        supplier,
        material,
        goodUnits: NaN,
        unitPrice: NaN,
        amount: Number(r.amount || 0),
        dueWeek: Number(r.weekNumber),
      };
    });

  const fgPrev = (prevState.finishedGoods?.lots || []) as any[];
  const fgNext = (nextState.finishedGoods?.lots || []) as any[];
  const prevIds = new Set(fgPrev.map(l => l.id));
  const finishedGoodsAdded = fgNext.filter(l => !prevIds.has(l.id)).map(l => ({
    id: String(l.id), product: l.product, quantity: Number(l.quantity || 0), unitCostBasis: Number(l.unitCostBasis || 0)
  }));

  const started = ((nextState.workInProcess?.batches || []) as any[]).filter(
    b => Number(b.startWeek) === w
  ).map(b => ({
    id: String(b.id), product: b.product, method: b.method, quantity: Number(b.quantity || 0), startWeek: Number(b.startWeek), endWeek: Number(b.endWeek), unitProductionCost: Number(b.productionUnitCost || 0)
  }));

  const completed = ((prevState.workInProcess?.batches || []) as any[]).filter(
    b => Number(b.endWeek) === w
  ).map(b => ({ id: String(b.id), product: b.product, quantity: Number(b.quantity || 0), endWeek: Number(b.endWeek), shipments: [] }));

  const aiDelta = {
    awarenessFrom: Number(prevState.awareness || 0),
    awarenessTo: Number(nextState.awareness || 0),
    intentFrom: Number(prevState.intent || 0),
    intentTo: Number(nextState.intent || 0),
  };
  const chargedMarketing = sum('marketing');

  return {
    gameSessionId,
    weekNumber: w,
    generatedAt: new Date().toISOString(),
    cash,
    procurement: { arrivals, settlements },
    inventory: { rawMaterials: rmDeltas, finishedGoodsAdded },
    production: { started, completed },
    marketing: { charged: chargedMarketing, aiDelta, planApplied: nextState.marketingPlan?.channels || [] },
    ledgerRows: ledgerRowsN1,
  };
}


