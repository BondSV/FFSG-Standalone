import type { WeeklySummary, LedgerEntry, InventoryDelta } from '@/types/weekly-summary';

export function computeWeekSummary(params: {
  gameSessionId: string;
  prevState: any;      // Week N
  nextState: any;      // Week N+1 (fresh)
  ledgerRowsN1: LedgerEntry[]; // filtered to weekNumber === nextState.weekNumber
  allWeeks?: any[];    // optional: full weeks array for demand chart
}): WeeklySummary {
  const { gameSessionId, prevState, nextState, ledgerRowsN1, allWeeks } = params;
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

  // Aggregate ordered units by material for deliveries that arrive this week (from contracts)
  const orderedByMaterial: Record<string, number> = {};
  try {
    const contracts = (nextState.procurementContracts?.contracts || []) as any[];
    for (const c of contracts) {
      for (const del of (c.deliveries || [])) {
        if (Number(del.week) === w) {
          const mat = String(c.material || 'unknown');
          orderedByMaterial[mat] = (orderedByMaterial[mat] || 0) + Number(del.units || 0);
        }
      }
    }
  } catch {}
  const arrivals = rmDeltas
    .filter(d => d.deltaUnits > 0)
    .map(d => {
      const unitPrice = d.deltaUnits !== 0 ? Math.abs(d.deltaValue) / Math.abs(d.deltaUnits) : 0;
      const ordered = Number(orderedByMaterial[d.material] || 0);
      const defectiveUnits = ordered > 0 && ordered > d.deltaUnits ? ordered - d.deltaUnits : undefined;
      return { material: d.material, goodUnits: d.deltaUnits, defectiveUnits, unitPrice, amount: unitPrice * d.deltaUnits };
    });

  const settlements = ledgerRowsN1
    .filter(r => r.entryType === 'materials_spt' || r.entryType === 'materials_gmc')
    .map(r => {
      const [supplier] = (r.refId || 'unknown:unknown').split(':');
      return {
        kind: r.entryType === 'materials_spt' ? 'SPT' as const : 'GMC' as const,
        supplier,
        material: '',
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

  // Alternative: use new WIP tracking system if available
  const startedFromWipTracking = (nextState.wipByWeek?.[w] || []).map((b: any) => ({
    id: String(b.id || 'batch'), 
    product: b.product, 
    method: b.method, 
    quantity: Number(b.quantity || 0), 
    startWeek: Number(b.startWeek), 
    endWeek: Number(b.startWeek) + (b.method === 'inhouse' ? 
      (b.product === 'jacket' ? 3 : 2) : 1), 
    unitProductionCost: b.method === 'inhouse' ? 
      (b.product === 'jacket' ? 15 : b.product === 'dress' ? 8 : 12) : 
      (b.product === 'jacket' ? 25 : b.product === 'dress' ? 14 : 18)
  }));

  // Use new WIP tracking if available, fallback to old system
  const batchesStarted = startedFromWipTracking.length > 0 ? startedFromWipTracking : started;

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

  // Demand series (W1..W15) for chart: use states if available in prev/next hints; fallback to flat values
  let demandSeries: Array<{ week: number; awareness: number; intent: number; demand: number }> = [];
  if (Array.isArray(allWeeks) && allWeeks.length > 0) {
    const byWeek: Record<number, any> = {};
    for (const w of allWeeks) byWeek[Number(w.weekNumber)] = w;
    for (let wk = 1; wk <= 15; wk++) {
      const s = byWeek[wk] || {};
      const aw = Number(s.awareness || 0);
      const it = Number(s.intent || 0);
      const demand = Number((s.weeklyDemand?.jacket || 0) + (s.weeklyDemand?.dress || 0) + (s.weeklyDemand?.pants || 0));
      demandSeries.push({ week: wk, awareness: aw, intent: it, demand });
    }
  } else {
    const prevAw = Number(prevState.awareness || 0);
    const prevIn = Number(prevState.intent || 0);
    const nextAw = Number(nextState.awareness || prevAw);
    const nextIn = Number(nextState.intent || prevIn);
    for (let wk = 1; wk <= 15; wk++) {
      const isPrev = wk === Number(prevState.weekNumber);
      const isNext = wk === Number(nextState.weekNumber);
      const aw = isNext ? nextAw : isPrev ? prevAw : 0;
      const it = isNext ? nextIn : isPrev ? prevIn : 0;
      const demand = Number((isPrev ? prevState.weeklyDemand?.jacket : 0) + (isPrev ? prevState.weeklyDemand?.dress : 0) + (isPrev ? prevState.weeklyDemand?.pants : 0) || 0);
      demandSeries.push({ week: wk, awareness: aw, intent: it, demand });
    }
  }

  return {
    gameSessionId,
    weekNumber: w,
    generatedAt: new Date().toISOString(),
    cash,
    procurement: { arrivals, settlements },
    inventory: { rawMaterials: rmDeltas, finishedGoodsAdded },
    production: { started: batchesStarted, completed },
    marketing: { charged: chargedMarketing, aiDelta, planApplied: nextState.marketingPlan?.channels || [] },
    ledgerRows: ledgerRowsN1,
    demandSeries,
  };
}


