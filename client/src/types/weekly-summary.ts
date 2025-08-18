export type LedgerEntry = {
  weekNumber: number;
  entryType:
    | 'marketing'
    | 'materials_spt'
    | 'materials_gmc'
    | 'production'
    | 'logistics'
    | 'holding'
    | 'interest';
  refId: string | null;
  amount: number;
};

export type ProcurementArrival = {
  supplier: string;
  material: string;
  goodUnits: number;
  unitPrice: number;
  amount: number;
};

export type ProcurementSettlement = {
  kind: 'SPT' | 'GMC';
  supplier: string;
  material: string;
  goodUnits: number;
  unitPrice: number;
  amount: number;
  dueWeek: number;
};

export type InventoryDelta = {
  material: string;
  deltaUnits: number;
  deltaValue: number;
  onHandAfter: number;
  avgUnitCostAfter?: number;
};

export type ProductionStarted = {
  id: string;
  product: 'jacket' | 'dress' | 'pants';
  method: 'inhouse' | 'outsource';
  quantity: number;
  startWeek: number;
  endWeek: number;
  unitProductionCost: number;
};

export type ProductionCompleted = {
  id: string;
  product: 'jacket' | 'dress' | 'pants';
  quantity: number;
  endWeek: number;
  shipments: Array<{ method: 'standard' | 'expedited'; arrivalWeek: number; quantity: number; unitShippingCost: number }>;
};

export type FinishedGoodsLot = {
  id: string;
  product: 'jacket' | 'dress' | 'pants';
  quantity: number;
  unitCostBasis: number;
};

export type AwarenessIntentDelta = {
  awarenessFrom: number;
  awarenessTo: number;
  intentFrom: number;
  intentTo: number;
};

export type CashWaterfall = {
  openingCash: number;
  openingCredit: number;
  interest: number;
  outflows: {
    marketing: number;
    materialsSPT: number;
    materialsGMC: number;
    production: number;
    logistics: number;
    holding: number;
  };
  revenue: number;
  autoPaydown: number;
  closingCash: number;
  closingCredit: number;
};

export type WeeklySummary = {
  gameSessionId: string;
  weekNumber: number; // N+1
  generatedAt: string;

  cash: CashWaterfall;
  procurement: {
    arrivals: ProcurementArrival[];
    settlements: ProcurementSettlement[];
  };
  inventory: {
    rawMaterials: InventoryDelta[];
    finishedGoodsAdded: FinishedGoodsLot[];
  };
  production: {
    started: ProductionStarted[];
    completed: ProductionCompleted[];
  };
  marketing: {
    charged: number;
    aiDelta: AwarenessIntentDelta;
    planApplied?: Array<{ name: string; spend: number }>;
  };

  ledgerRows: LedgerEntry[];
};


