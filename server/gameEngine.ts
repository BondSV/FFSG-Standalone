import { WeeklyState, GameSession, ExtendedWeeklyState, ProductKey, SupplierKey, MaterialKey } from "@shared/schema";

// Game constants from the specification
export const GAME_CONSTANTS = {
  STARTING_CAPITAL: 1000000,
  CREDIT_LIMIT: 10000000,
  WEEKLY_INTEREST_RATE: 0.002,
  HOLDING_COST_RATE: 0.003,
  BATCH_SIZE: 25000,
  BASELINE_MARKETING_SPEND: 216667,
  
  PRODUCTS: {
    jacket: {
      name: "Vintage Denim Jacket",
      forecast: 100000,
      hmPrice: 80,
      highEndRange: [300, 550],
      elasticity: -1.40,
    },
    dress: {
      name: "Floral Print Dress", 
      forecast: 150000,
      hmPrice: 50,
      highEndRange: [180, 210],
      elasticity: -1.20,
    },
    pants: {
      name: "Corduroy Pants",
      forecast: 120000,
      hmPrice: 60,
      highEndRange: [190, 220],
      elasticity: -1.55,
    }
  },
  
  SEASONALITY: [0.0, 0.20, 0.40, 0.60, 0.80, 1.00, 1.10, 1.20, 1.20, 1.10, 0.80, 0.50, 0.30, 0.10, 0.00],
  
  SUPPLIERS: {
    supplier1: {
      name: "Supplier-1 (Premium)",
      defectRate: 0.0,
      leadTime: 2,
      maxDiscount: 0.15,
      materials: {
        selvedgeDenim: { price: 16, printSurcharge: 3 },
        standardDenim: { price: 10, printSurcharge: 3 },
        egyptianCotton: { price: 12, printSurcharge: 2 },
        polyesterBlend: { price: 7, printSurcharge: 2 },
        fineWaleCorduroy: { price: 14, printSurcharge: 3 },
        wideWaleCorduroy: { price: 9, printSurcharge: 3 },
      }
    },
    supplier2: {
      name: "Supplier-2 (Standard)",
      defectRate: 0.05,
      leadTime: 2,
      maxDiscount: 0.10,
      materials: {
        selvedgeDenim: { price: 13, printSurcharge: 2 },
        egyptianCotton: { price: 10, printSurcharge: 1 },
        polyesterBlend: { price: 6, printSurcharge: 1 },
        fineWaleCorduroy: { price: 11, printSurcharge: 2 },
        wideWaleCorduroy: { price: 7, printSurcharge: 2 },
      }
    }
  },
  
  VOLUME_DISCOUNTS: [
    { min: 100000, max: 299999, discount: 0.03 },
    { min: 300000, max: 499999, discount: 0.07 },
    { min: 500000, max: Infinity, discount: 0.12 },
  ],
  
  MANUFACTURING: {
    jacket: { inHouseCost: 15, outsourceCost: 25, inHouseTime: 3, outsourceTime: 1 },
    dress: { inHouseCost: 8, outsourceCost: 14, inHouseTime: 2, outsourceTime: 1 },
    pants: { inHouseCost: 12, outsourceCost: 18, inHouseTime: 2, outsourceTime: 1 },
  },
  
  CAPACITY_SCHEDULE: [
    0, 0, 25000, 50000, 100000, 100000, 150000, 150000, 200000, 200000, 100000, 50000, 0, 0, 0
  ],
  
  SHIPPING: {
    jacket: { standard: 4, expedited: 7 },
    dress: { standard: 2.5, expedited: 4 },
    pants: { standard: 3, expedited: 6 },
  }
};

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  canCommit: boolean;
}

export class GameEngine {
  // --------------------
  // Utility conversions
  // --------------------
  private static toNumber(value: any, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private static cloneJson<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  // --------------------
  // Procurement helpers
  // --------------------
  private static computeSupplierVolumeDiscount(totalUnits: number): number {
    for (const tier of GAME_CONSTANTS.VOLUME_DISCOUNTS) {
      if (totalUnits >= tier.min && totalUnits <= tier.max) {
        return tier.discount;
      }
    }
    return 0;
  }

  private static getSupplierLeadTime(supplier: SupplierKey): number {
    return GAME_CONSTANTS.SUPPLIERS[supplier].leadTime;
  }

  private static getSupplierDefectRate(supplier: SupplierKey): number {
    return GAME_CONSTANTS.SUPPLIERS[supplier].defectRate;
  }

  private static getMaterialBasePrice(supplier: SupplierKey, material: MaterialKey): number {
    return (GAME_CONSTANTS.SUPPLIERS as any)[supplier].materials[material].price || 0;
  }

  private static getMaterialPrintSurcharge(supplier: SupplierKey, material: MaterialKey): number {
    return (GAME_CONSTANTS.SUPPLIERS as any)[supplier].materials[material].printSurcharge || 0;
  }

  private static computeContractUnitPrice(contract: any): number {
    // Base + print surcharge less discount
    const base = Number(contract.unitBasePrice) || 0;
    const surcharge = Number(contract.printSurcharge) || 0;
    const discount = Number(contract.discountPercentApplied) || 0;
    const price = (base + surcharge) * (1 - discount);
    return price;
  }

  private static scheduleDeliveriesForContract(contract: any): any {
    // If deliveries already exist, keep them. Otherwise create based on type and supplier lead times.
    if (contract.deliveries && contract.deliveries.length > 0) return contract;
    const lead = this.getSupplierLeadTime(contract.supplier);
    const unitPrice = this.computeContractUnitPrice(contract);

    if (contract.type === 'FVC') {
      // Deliver full quantity after supplier lead time
      contract.deliveries = [{ week: contract.weekSigned + lead, units: contract.units, unitPrice }];
    } else if (contract.type === 'GMC') {
      // For GMC, deliveries are driven by iterative weekly orders, not pre-scheduled here.
      contract.deliveries = contract.deliveries || [];
    } else {
      // SPT: single shipment after lead
      contract.deliveries = [{ week: contract.weekSigned + lead, units: contract.units, unitPrice }];
    }
    return contract;
  }

  // --------------------
  // Capacity helpers
  // --------------------
  private static getProductionLead(product: keyof typeof GAME_CONSTANTS.MANUFACTURING, method: 'inhouse' | 'outsource'): number {
    const m = GAME_CONSTANTS.MANUFACTURING[product];
    return method === 'inhouse' ? m.inHouseTime : m.outsourceTime;
  }

  private static getProductionUnitCost(product: keyof typeof GAME_CONSTANTS.MANUFACTURING, method: 'inhouse' | 'outsource'): number {
    const m = GAME_CONSTANTS.MANUFACTURING[product];
    return method === 'inhouse' ? m.inHouseCost : m.outsourceCost;
    }

  private static getShippingWeeks(method: 'standard' | 'expedited'): number {
    return method === 'standard' ? 2 : 1;
  }

  private static getShippingUnitCost(product: keyof typeof GAME_CONSTANTS.SHIPPING, method: 'standard' | 'expedited'): number {
    const s = GAME_CONSTANTS.SHIPPING[product];
    return method === 'standard' ? s.standard : s.expedited;
  }

  // --------------------
  // Core weekly processing
  // --------------------
  static commitWeek(currentState: WeeklyState): WeeklyState {
    const state = this.cloneJson(currentState) as any as WeeklyState & ExtendedWeeklyState;
    const week = state.weekNumber;

    // Ensure nested structures exist
    state.rawMaterials = state.rawMaterials || {};
    state.workInProcess = state.workInProcess?.batches ? state.workInProcess : { batches: [] } as any;
    state.finishedGoods = (state.finishedGoods as any)?.lots ? state.finishedGoods : { lots: [] } as any;
    state.shipmentsInTransit = state.shipmentsInTransit || [];
    state.productionSchedule = state.productionSchedule || { batches: [] };
    state.procurementContracts = state.procurementContracts || { contracts: [] };
    state.weeklyDiscounts = state.weeklyDiscounts || { jacket: 0, dress: 0, pants: 0 };
    state.weeklyDemand = state.weeklyDemand || { jacket: 0, dress: 0, pants: 0 };
    state.weeklySales = state.weeklySales || { jacket: 0, dress: 0, pants: 0 };
    state.lostSales = state.lostSales || { jacket: 0, dress: 0, pants: 0 };

    const openingCash = this.toNumber(state.cashOnHand, GAME_CONSTANTS.STARTING_CAPITAL);
    let cashOnHand = openingCash;
    let creditUsed = this.toNumber(state.creditUsed, 0);
    let weeklyRevenue = 0;
    let costMaterials = 0;
    let costProduction = 0;
    let costLogistics = 0;
    let costMarketing = 0;
    let costHolding = 0;
    let costInterest = 0;
    let operationalOutflows = 0; // Sum of all operating cash payments for the week

    // 1) Process procurement: compute discounts once per contract if not set; schedule deliveries; pay deposits/instalments due this week
    const contracts = state.procurementContracts.contracts || [];
    // Compute supplier totals for discounts (FVC units + GMC commitments + SPT units)
    const supplierTotals: Record<string, number> = {};
    for (const c of contracts) {
      if (c.type === 'FVC' || c.type === 'SPT') {
        supplierTotals[c.supplier] = (supplierTotals[c.supplier] || 0) + this.toNumber(c.units);
      }
    }
    const gmcCommitmentsBySupplier: Record<string, number> = (state.procurementContracts as any)?.gmcCommitments || {};
    for (const [sup, commit] of Object.entries(gmcCommitmentsBySupplier)) {
      supplierTotals[sup] = (supplierTotals[sup] || 0) + this.toNumber(commit);
    }
    for (const c of contracts) {
      if (c.discountPercentApplied == null) {
        // Apply single-supplier bonus if week 1 and all contracts are with same supplier and total units >= 370k
        const allWeek1 = contracts.filter(x => x.weekSigned === 1);
        const uniqueSuppliers = new Set(allWeek1.map(x => x.supplier));
        const totalW1Units = allWeek1.reduce((s, x) => s + this.toNumber(x.units), 0);
        const needUnits = GAME_CONSTANTS.PRODUCTS.jacket.forecast + GAME_CONSTANTS.PRODUCTS.dress.forecast + GAME_CONSTANTS.PRODUCTS.pants.forecast;
        if (c.weekSigned === 1 && uniqueSuppliers.size === 1 && totalW1Units >= needUnits) {
          c.discountPercentApplied = GAME_CONSTANTS.SUPPLIERS[c.supplier].maxDiscount;
        } else {
          c.discountPercentApplied = this.computeSupplierVolumeDiscount(supplierTotals[c.supplier] || 0);
        }
      }
      if (c.unitBasePrice == null) {
        c.unitBasePrice = this.getMaterialBasePrice(c.supplier as SupplierKey, c.material as MaterialKey);
      }
      if (c.printSurcharge == null) {
        // If product decision has print for the fabric, surcharge applies. We cannot infer per-product here, so keep provided or default from supplier material catalogue.
        c.printSurcharge = this.getMaterialPrintSurcharge(c.supplier as SupplierKey, c.material as MaterialKey);
      }
      this.scheduleDeliveriesForContract(c);

      // Payments due
      const unitPrice = this.computeContractUnitPrice(c);
      const contractValue = unitPrice * this.toNumber(c.units);
      c.paidSoFar = this.toNumber(c.paidSoFar);
      if (c.type === 'FVC') {
        if (week === c.weekSigned) {
          // 30% on signing
          const due = contractValue * 0.30;
          operationalOutflows += due;
          costMaterials += due;
          c.paidSoFar += due;
        }
        // 70% due 8 weeks after signing (settlement period), regardless of delivery
        if (week === c.weekSigned + 8) {
          const due = contractValue * 0.70;
          operationalOutflows += due;
          costMaterials += due;
          c.paidSoFar += due;
        }
      } else if (c.type === 'GMC') {
        // Payment per batch order with 2-week settlement; orders stored in c.gmcOrders
        const orders = (c as any).gmcOrders || [];
        for (const o of orders) {
          if (week === this.toNumber(o.week) + 2) {
            const due = this.toNumber(o.units) * unitPrice;
            operationalOutflows += due;
            costMaterials += due;
            c.paidSoFar += due;
          }
        }
      }
    }

    // 2) Receive material deliveries scheduled for this week; account for defects for Supplier-2
    for (const c of contracts) {
      c.deliveredUnits = this.toNumber(c.deliveredUnits);
      // For GMC, build synthetic deliveries from gmcOrders (lead time)
      if (c.type === 'GMC' && !(c.deliveries && c.deliveries.length)) {
        const orders = (c as any).gmcOrders || [];
        const lead = this.getSupplierLeadTime(c.supplier as SupplierKey);
        const unitPrice = this.computeContractUnitPrice(c);
        c.deliveries = orders.map((o: any) => ({ week: this.toNumber(o.week) + lead, units: this.toNumber(o.units), unitPrice }));
      }
      for (const d of c.deliveries || []) {
        if (d.week === week) {
          const defectRate = this.getSupplierDefectRate(c.supplier as SupplierKey);
          const defectiveUnits = Math.round(d.units * defectRate);
          const goodUnits = d.units - defectiveUnits;
          // Update raw materials inventory on-hand
          const matKey = c.material as MaterialKey;
          const entry: any = state.rawMaterials[matKey] || { onHand: 0, allocated: 0, inTransit: [] };
          entry.onHand = this.toNumber(entry.onHand) + goodUnits;
          // Track simple moving average unit cost on-hand
          const unitPrice = d.unitPrice ?? this.computeContractUnitPrice(c);
          entry.onHandValue = this.toNumber(entry.onHandValue) + goodUnits * unitPrice;
          state.rawMaterials[matKey] = entry;
          c.deliveredUnits += goodUnits;
          // SPT and GMC per-batch settlements: pay on delivery for good units (defects not billed) when settlement hits
          if (c.type === 'SPT') {
            const deliveryCost = goodUnits * unitPrice;
            operationalOutflows += deliveryCost;
            costMaterials += deliveryCost;
          }
        }
      }
    }

    // 3) Start production batches in this week: allocate materials, pay production cost now
    const startingBatches = (state.productionSchedule.batches || []).filter((b: any) => b.startWeek === week);
    for (const b of startingBatches) {
      const product = b.product as ProductKey;
      const method = b.method as 'inhouse' | 'outsource';
      const prodLead = this.getProductionLead(product, method);
      const prodUnitCost = this.getProductionUnitCost(product, method);
      const quantity = this.toNumber(b.quantity);

      // Determine material to consume from product decision
      const fabric = (state.productData as any)[product]?.fabric as MaterialKey;
      const rmEntry: any = state.rawMaterials[fabric] || { onHand: 0, allocated: 0, inTransit: [] };
      const netAvailable = this.toNumber(rmEntry.onHand) - this.toNumber(rmEntry.allocated);
      if (netAvailable < quantity) {
        // Allocation failure will already be surfaced in validation; here we just clamp to 0 to avoid NaNs
      } else {
        rmEntry.allocated = this.toNumber(rmEntry.allocated) + quantity;
        rmEntry.onHand = this.toNumber(rmEntry.onHand) - quantity;
        // Reduce onHandValue proportionally using average cost if present
        const avgUnitRM = rmEntry.onHand > 0 ? (this.toNumber(rmEntry.onHandValue) / (this.toNumber(rmEntry.onHand) + quantity)) : this.toNumber(rmEntry.lastUnitCost, 0) || this.toNumber(rmEntry.onHandValue) / Math.max(1, this.toNumber(rmEntry.onHand));
        rmEntry.onHandValue = Math.max(0, this.toNumber(rmEntry.onHandValue) - quantity * avgUnitRM);
        rmEntry.lastUnitCost = avgUnitRM;
        state.rawMaterials[fabric] = rmEntry;
      }

      // Pay production cost this week
      const productionCash = quantity * prodUnitCost;
      operationalOutflows += productionCash;
      costProduction += productionCash;

      // Add to WIP with completion at end of week startWeek + lead
      const endWeek = week + prodLead;
      (state.workInProcess as any).batches.push({
        id: b.id,
        product,
        method,
        startWeek: week,
        endWeek,
        quantity,
        materialUnitCost: this.toNumber((state.productData as any)[product]?.confirmedMaterialCost) || this.toNumber(rmEntry.lastUnitCost, 0),
        productionUnitCost: prodUnitCost,
      });
    }

    // 4) Complete production whose endWeek equals current week: create shipments and pay shipping cost now
    const remainingWip: any[] = [];
    for (const wb of (state.workInProcess as any).batches) {
      if (wb.endWeek === week) {
        // Create shipment according to batch's planned shipping method
        const plan = (state.productionSchedule.batches || []).find((x: any) => x.id === wb.id);
        const shipMethod = (plan?.shipping || 'standard') as 'standard' | 'expedited';
        const shipWeeks = this.getShippingWeeks(shipMethod);
        const shipUnitCost = this.getShippingUnitCost(wb.product, shipMethod);
        const shipmentId = `${wb.id}-ship-${week}`;
        state.shipmentsInTransit!.push({
          id: shipmentId,
          product: wb.product,
          quantity: wb.quantity,
          unitShippingCost: shipUnitCost,
          unitMaterialCost: this.toNumber(wb.materialUnitCost),
          unitProductionCost: this.toNumber(wb.productionUnitCost),
          // Available for sale at start of the week AFTER shipping completes
          arrivalWeek: week + shipWeeks + 1,
        });
        const shippingCash = wb.quantity * shipUnitCost;
        operationalOutflows += shippingCash;
        costLogistics += shippingCash;
      } else {
        remainingWip.push(wb);
      }
    }
    (state.workInProcess as any).batches = remainingWip;

    // 5) At the start of this week, move shipments whose availability week equals current week into finished goods
    const remainingShipments: any[] = [];
    for (const sh of state.shipmentsInTransit || []) {
      if (sh.arrivalWeek === week) {
        // Lot cost basis = material + production + shipping (per unit)
        const materialCost = this.toNumber(sh.unitMaterialCost, this.toNumber((state.productData as any)[sh.product]?.confirmedMaterialCost));
        const productionCost = this.toNumber(sh.unitProductionCost, this.getProductionUnitCost(sh.product as any, 'inhouse'));
        const unitShipping = this.toNumber(sh.unitShippingCost);
        const unitCostBasis = materialCost + productionCost + unitShipping;
        (state.finishedGoods as any).lots.push({
          id: `lot-${sh.id}`,
          product: sh.product,
          quantity: sh.quantity,
          unitCostBasis,
          unitMaterialCost: materialCost,
          unitProductionCost: productionCost,
          unitShippingCost: unitShipping,
        });
      } else {
        remainingShipments.push(sh);
      }
    }
    state.shipmentsInTransit = remainingShipments;

    // 6) Sales for this week
    const discounts = this.cloneJson(state.weeklyDiscounts);
    // Automatic run-out markdowns override
    if (week === 13) { discounts.jacket = 0.20; discounts.dress = 0.20; discounts.pants = 0.20; }
    if (week === 14) { discounts.jacket = 0.35; discounts.dress = 0.35; discounts.pants = 0.35; }
    if (week === 15) { discounts.jacket = 0.50; discounts.dress = 0.50; discounts.pants = 0.50; }

    const productKeys: ProductKey[] = ['jacket', 'dress', 'pants'];
    const demandByProduct: Record<string, number> = {};
    const salesByProduct: Record<string, number> = {};
    const lostByProduct: Record<string, number> = {};
    let cogsMaterialsSold = 0;
    let cogsProductionSold = 0;
    let cogsLogisticsSold = 0;

    const marketingSpend = this.toNumber(state.marketingPlan?.totalSpend ?? state.marketingSpend);
    costMarketing += marketingSpend;
    operationalOutflows += marketingSpend;

    // Compute actual unit cost to enforce no-loss sales
    const totUnitsSold = this.toNumber((state.totals as any)?.unitsSoldToDate);
    const totRev = this.toNumber((state.totals as any)?.revenueToDate);
    const totMat = this.toNumber((state.totals as any)?.cogsMaterialsToDate);
    const totProd = this.toNumber((state.totals as any)?.cogsProductionToDate);
    const totLog = this.toNumber((state.totals as any)?.cogsLogisticsToDate);
    const totMkt = this.toNumber((state.totals as any)?.cogsMarketingToDate);
    const actualUnitCost = this.calculateActualUnitCost(totRev, totMat, totProd, totLog, totMkt, Math.max(1, totUnitsSold));

    for (const p of productKeys) {
      const dec = (state.productData as any)[p];
      const rrp = this.toNumber(dec?.rrp);
      const hasPrint = !!dec?.hasPrint;
      const discount = this.toNumber((discounts as any)[p]);
      const price = rrp * (1 - discount);
      // Demand
      const demand = this.calculateDemand(p, week, rrp, discount, marketingSpend, hasPrint);
      demandByProduct[p] = demand;

      // Available inventory for sale
      const availableLots = (state.finishedGoods as any).lots.filter((l: any) => l.product === p);
      let availableUnits = availableLots.reduce((s: number, l: any) => s + this.toNumber(l.quantity), 0);
      let unitsToSell = Math.min(availableUnits, demand);
      if (price < actualUnitCost) {
        unitsToSell = 0; // block loss-making sales
      }
      salesByProduct[p] = unitsToSell;
      lostByProduct[p] = Math.max(0, demand - unitsToSell);

      // Decrement lots FIFO and compute revenue and allocate COGS components
      let remaining = unitsToSell;
      for (const lot of availableLots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, this.toNumber(lot.quantity));
        lot.quantity = this.toNumber(lot.quantity) - take;
        weeklyRevenue += take * price;
        // Accumulate COGS components for sold units
        cogsMaterialsSold += take * this.toNumber(lot.unitMaterialCost);
        cogsProductionSold += take * this.toNumber(lot.unitProductionCost);
        cogsLogisticsSold += take * this.toNumber(lot.unitShippingCost);
        remaining -= take;
      }
      // Remove depleted lots
      (state.finishedGoods as any).lots = (state.finishedGoods as any).lots.filter((l: any) => this.toNumber(l.quantity) > 0);
    }

    // 7) Holding costs on end-of-week inventory value
    const rmValue = Object.values(state.rawMaterials || {}).reduce((s: number, v: any) => s + this.toNumber(v.onHandValue), 0);
    const wipValue = (state.workInProcess as any).batches.reduce((s: number, b: any) => s + b.quantity * (this.toNumber(b.materialUnitCost) + this.toNumber(b.productionUnitCost)), 0);
    const fgValue = (state.finishedGoods as any).lots.reduce((s: number, l: any) => s + this.toNumber(l.quantity) * this.toNumber(l.unitCostBasis), 0);
    const invValue = rmValue + wipValue + fgValue;
    costHolding = this.calculateHoldingCosts(invValue);
    operationalOutflows += costHolding;

    // 8) Apply cash waterfall
    // Start: opening cash, then add revenue
    cashOnHand = openingCash + weeklyRevenue;
    // Subtract operational outflows, drawing credit if needed
    if (cashOnHand >= operationalOutflows) {
      cashOnHand -= operationalOutflows;
    } else {
      const shortfall = operationalOutflows - cashOnHand;
      creditUsed = Math.min(GAME_CONSTANTS.CREDIT_LIMIT, creditUsed + shortfall);
      cashOnHand = 0;
    }
    // Interest on credit after operations
    costInterest = this.calculateInterest(creditUsed);
    if (cashOnHand >= costInterest) {
      cashOnHand -= costInterest;
    } else {
      const shortfall = costInterest - cashOnHand;
      creditUsed = Math.min(GAME_CONSTANTS.CREDIT_LIMIT, creditUsed + shortfall);
      cashOnHand = 0;
    }
    // Auto paydown principal
    if (cashOnHand > 0 && creditUsed > 0) {
      const payDown = Math.min(cashOnHand, creditUsed);
      creditUsed -= payDown;
      cashOnHand -= payDown;
    }

    // 9) Final week penalties (GMC undelivered)
    if (week === 15) {
      let gmcPenalty = 0;
      // Penalty per supplier based on GMC commitment minus delivered GMC units
      for (const [sup, commit] of Object.entries(gmcCommitmentsBySupplier)) {
        const deliveredSum = contracts
          .filter((c: any) => c.type === 'GMC' && c.supplier === sup)
          .reduce((s: number, c: any) => s + this.toNumber(c.deliveredUnits), 0);
        const undelivered = Math.max(0, this.toNumber(commit) - deliveredSum);
        if (undelivered > 0) {
          // Compute average GMC unit price for this supplier
          const gmcContracts = contracts.filter((c: any) => c.type === 'GMC' && c.supplier === sup);
          let avgUnit = 0;
          let totalUnitsForAvg = 0;
          for (const c of gmcContracts) {
            const unit = this.computeContractUnitPrice(c);
            const delivered = this.toNumber(c.deliveredUnits);
            if (delivered > 0) {
              avgUnit += unit * delivered;
              totalUnitsForAvg += delivered;
            }
          }
          if (totalUnitsForAvg > 0) {
            avgUnit = avgUnit / totalUnitsForAvg;
          } else if (gmcContracts.length > 0) {
            avgUnit = gmcContracts.reduce((s: number, c: any) => s + this.computeContractUnitPrice(c), 0) / gmcContracts.length;
          } else {
            avgUnit = 0;
          }
          gmcPenalty += undelivered * avgUnit * 0.20;
        }
      }
      if (gmcPenalty > 0) {
        // Apply after revenue/operations/interest, draw credit if needed
        if (cashOnHand >= gmcPenalty) {
          cashOnHand -= gmcPenalty;
        } else {
          const shortfall = gmcPenalty - cashOnHand;
          creditUsed = Math.min(GAME_CONSTANTS.CREDIT_LIMIT, creditUsed + shortfall);
          cashOnHand = 0;
        }
        costMaterials += gmcPenalty; // track inside materials bucket for simplicity
      }
    }

    // 9) Final auto-paydown pass (no double-adding revenue)
    if (cashOnHand > 0 && creditUsed > 0) {
      const payDown = Math.min(cashOnHand, creditUsed);
      creditUsed -= payDown;
      cashOnHand -= payDown;
    }

    // Update weekly metrics
    state.weeklyDemand = demandByProduct as any;
    state.weeklySales = salesByProduct as any;
    state.lostSales = lostByProduct as any;
    state.weeklyRevenue = `${weeklyRevenue.toFixed(2)}`;
    state.cashOnHand = `${cashOnHand.toFixed(2)}`;
    state.creditUsed = `${creditUsed.toFixed(2)}`;
    state.materialCosts = `${(this.toNumber(state.materialCosts) + costMaterials).toFixed(2)}`;
    state.productionCosts = `${(this.toNumber(state.productionCosts) + costProduction).toFixed(2)}`;
    state.logisticsCosts = `${(this.toNumber(state.logisticsCosts) + costLogistics).toFixed(2)}`;
    state.holdingCosts = `${(this.toNumber(state.holdingCosts) + costHolding).toFixed(2)}`;
    state.interestAccrued = `${(this.toNumber(state.interestAccrued) + costInterest).toFixed(2)}`;

    // Update totals for actual unit cost tracking (approximate allocation: allocate full marketing to COGS of sold units proportionally)
    const prevTotals = (state.totals as any) || {};
    const unitsSoldThisWeek = productKeys.reduce((s, p) => s + this.toNumber(salesByProduct[p]), 0);
    const marketingAllocated = unitsSoldThisWeek > 0 ? costMarketing : 0; // allocate all to weeks with sales
    state.totals = {
      revenueToDate: this.toNumber(prevTotals.revenueToDate) + weeklyRevenue,
      unitsSoldToDate: this.toNumber(prevTotals.unitsSoldToDate) + unitsSoldThisWeek,
      cogsMaterialsToDate: this.toNumber(prevTotals.cogsMaterialsToDate) + cogsMaterialsSold,
      cogsProductionToDate: this.toNumber(prevTotals.cogsProductionToDate) + cogsProductionSold,
      cogsLogisticsToDate: this.toNumber(prevTotals.cogsLogisticsToDate) + cogsLogisticsSold,
      cogsMarketingToDate: this.toNumber(prevTotals.cogsMarketingToDate) + marketingAllocated,
    } as any;

    // Mark committed
    (state as any).isCommitted = true;
    return state as any as WeeklyState;
  }

  private static payAmount(cashOnHand: number, creditUsed: number, amount: number): { cashOnHand: number; creditUsed: number } {
    if (amount <= 0) return { cashOnHand, creditUsed };
    if (cashOnHand >= amount) {
      return { cashOnHand: cashOnHand - amount, creditUsed };
    }
    const remaining = amount - cashOnHand;
    const newCredit = Math.min(GAME_CONSTANTS.CREDIT_LIMIT, creditUsed + remaining);
    return { cashOnHand: 0, creditUsed: newCredit };
  }
  static processMaterialPurchases(currentState: any, updates: any): any {
    const newPurchases = updates.materialPurchases || [];
    const existingPurchases = currentState.materialPurchases || [];
    
    // Calculate total cost of new purchases
    let totalPurchaseCost = 0;
    const newPurchasesList = newPurchases.filter((purchase: any) => {
      // Only process purchases that aren't already in the existing list
      const isNew = !existingPurchases.some((existing: any) => 
        existing.timestamp === purchase.timestamp
      );
      if (isNew) {
        totalPurchaseCost += purchase.totalCommitment || 0;
      }
      return isNew;
    });

    if (newPurchasesList.length === 0) {
      return updates; // No new purchases to process
    }

    // Update financial data
    const currentCash = parseFloat(currentState.cashOnHand || GAME_CONSTANTS.STARTING_CAPITAL);
    const currentCreditUsed = parseFloat(currentState.creditUsed || 0);
    const creditAvailable = GAME_CONSTANTS.CREDIT_LIMIT - currentCreditUsed;
    
    let updatedCashOnHand = currentCash;
    let updatedCreditUsed = currentCreditUsed;
    
    if (totalPurchaseCost <= currentCash) {
      // Pay with cash
      updatedCashOnHand = currentCash - totalPurchaseCost;
    } else {
      // Use cash + credit
      const remainingCost = totalPurchaseCost - currentCash;
      updatedCashOnHand = 0;
      updatedCreditUsed = Math.min(GAME_CONSTANTS.CREDIT_LIMIT, currentCreditUsed + remainingCost);
    }



    // Update material inventory when shipments arrive
    const updatedMaterialInventory = { ...(currentState.materialInventory || {}) };
    newPurchases.forEach((purchase: any) => {
      if (purchase.shipmentWeek <= currentState.weekNumber) {
        // Materials have arrived, add to inventory
        purchase.orders?.forEach((order: any) => {
          const currentInventory = updatedMaterialInventory[order.material] || 0;
          updatedMaterialInventory[order.material] = currentInventory + order.quantity;
        });
      }
    });

    return {
      ...updates,
      cashOnHand: updatedCashOnHand.toString(),
      creditUsed: updatedCreditUsed.toString(),
      materialInventory: updatedMaterialInventory,
      materialCosts: (parseFloat(currentState.materialCosts || '0') + totalPurchaseCost).toString(),
    };
  }

  static processProductionSchedule(currentState: any, updates: any): any {
    const newProductionSchedule = updates.productionSchedule;
    if (!newProductionSchedule) return updates;

    const existingBatches = currentState.productionSchedule?.batches || [];
    const newBatches = newProductionSchedule.batches || [];
    
    // Calculate cost of new batches
    let totalProductionCost = 0;
    const addedBatches = newBatches.filter((newBatch: any) => {
      return !existingBatches.some((existing: any) => existing.id === newBatch.id);
    });

    addedBatches.forEach((batch: any) => {
      totalProductionCost += batch.totalCost || 0;
    });

    if (totalProductionCost === 0) return updates;

    // Update financial data
    const currentCash = parseFloat(currentState.cashOnHand || GAME_CONSTANTS.STARTING_CAPITAL);
    const currentCreditUsed = parseFloat(currentState.creditUsed || 0);
    
    let updatedCashOnHand = currentCash;
    let updatedCreditUsed = currentCreditUsed;
    
    if (totalProductionCost <= currentCash) {
      // Pay with cash
      updatedCashOnHand = currentCash - totalProductionCost;
    } else {
      // Use cash + credit
      const remainingCost = totalProductionCost - currentCash;
      updatedCashOnHand = 0;
      updatedCreditUsed = Math.min(GAME_CONSTANTS.CREDIT_LIMIT, currentCreditUsed + remainingCost);
    }

    return {
      ...updates,
      cashOnHand: updatedCashOnHand.toString(),
      creditUsed: updatedCreditUsed.toString(),
      productionCosts: (parseFloat(currentState.productionCosts || '0') + totalProductionCost).toString(),
    };
  }
  
  static calculateDemand(
    product: keyof typeof GAME_CONSTANTS.PRODUCTS,
    week: number,
    rrp: number,
    discount: number = 0,
    marketingSpend: number = 0,
    hasPrint: boolean = false
  ): number {
    const productData = GAME_CONSTANTS.PRODUCTS[product];
    const baseUnits = productData.forecast;
    const seasonality = GAME_CONSTANTS.SEASONALITY[week - 1] || 0;
    
    // Price effect
    const finalPrice = rrp * (1 - discount);
    const priceEffect = Math.pow(rrp / finalPrice, productData.elasticity);
    
    // Promo lift
    const promoLift = Math.max(0.2, marketingSpend / GAME_CONSTANTS.BASELINE_MARKETING_SPEND);
    
    // Positioning effect 
    const priceRatio = (rrp / productData.hmPrice) - 1;
    const positioningEffect = 1 + (0.8 / (1 + Math.exp(-(-50) * (priceRatio - 0.20)))) - 0.4;
    
    // Design appeal effect
    const designEffect = hasPrint ? 1.05 : 0.95;
    
    return Math.round(baseUnits * seasonality * priceEffect * promoLift * positioningEffect * designEffect);
  }
  
  static calculateProjectedUnitCost(
    product: keyof typeof GAME_CONSTANTS.PRODUCTS,
    materialChoice: string,
    hasPrint: boolean
  ): number {
    // Average material cost from both suppliers
    const s1Materials = GAME_CONSTANTS.SUPPLIERS.supplier1.materials;
    const s2Materials = GAME_CONSTANTS.SUPPLIERS.supplier2.materials;
    
    const s1Price = (s1Materials as any)[materialChoice]?.price || 0;
    const s2Price = (s2Materials as any)[materialChoice]?.price || 0;
    
    let avgMaterialCost = s2Price ? (s1Price + s2Price) / 2 : s1Price;
    
    if (hasPrint) {
      const s1PrintSurcharge = (s1Materials as any)[materialChoice]?.printSurcharge || 0;
      const s2PrintSurcharge = (s2Materials as any)[materialChoice]?.printSurcharge || 0;
      const avgPrintSurcharge = s2PrintSurcharge ? (s1PrintSurcharge + s2PrintSurcharge) / 2 : s1PrintSurcharge;
      avgMaterialCost += avgPrintSurcharge;
    }
    
    return avgMaterialCost;
  }
  
  static calculateActualUnitCost(
    totalRevenue: number,
    totalMaterialCosts: number,
    totalProductionCosts: number,
    totalLogisticsCosts: number,
    totalMarketingCosts: number,
    totalUnitsSold: number
  ): number {
    if (totalUnitsSold === 0) return 0;
    const totalCOGS = totalMaterialCosts + totalProductionCosts + totalLogisticsCosts + totalMarketingCosts;
    return totalCOGS / totalUnitsSold;
  }
  
  static calculateHoldingCosts(inventoryValue: number): number {
    return inventoryValue * GAME_CONSTANTS.HOLDING_COST_RATE;
  }
  
  static calculateInterest(creditBalance: number): number {
    return creditBalance * GAME_CONSTANTS.WEEKLY_INTEREST_RATE;
  }
  
  static getPhaseForWeek(week: number): string {
    if (week <= 2) return 'strategy';
    if (week <= 6) return 'development';
    if (week <= 12) return 'sales';
    return 'runout';
  }
  
  static validateWeeklyDecisions(
    weekNumber: number,
    currentState: Partial<WeeklyState>,
    gameSession: GameSession
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const phase = this.getPhaseForWeek(weekNumber);
    
    // Strategy phase validations (Week 1-2)
    if (phase === 'strategy') {
      const productData = currentState.productData as any;
      if (!productData) {
        errors.push("Product data not provided");
      } else {
        // Check if all RRPs are set
        for (const [product, data] of Object.entries(productData)) {
          const productInfo = data as any;
          if (!productInfo.rrp) {
            errors.push(`RRP not set for ${product}`);
          }
          // Price floor: selling price should not be less than 105% of confirmed material + production cost
          const confirmed = Number(productInfo.confirmedMaterialCost || 0);
          const productionCost = GAME_CONSTANTS.MANUFACTURING[product as keyof typeof GAME_CONSTANTS.MANUFACTURING]?.inHouseCost || 0; // conservative
          if (productInfo.rrp && productInfo.rrp < 1.05 * (confirmed + productionCost)) {
            errors.push(`RRP for ${product} below cost floor`);
          }
        }
      }
    }
    
    // Development phase validations (Week 3-6)
    if (phase === 'development') {
      const productionSchedule = currentState.productionSchedule as any;
      const productData = currentState.productData as any;
      const rawMaterials = currentState.rawMaterials as any;

      const capacityMap: Record<number, number> = {};
      for (const b of productionSchedule?.batches || []) {
        // Batch size multiple of 25k
        if (Number(b.quantity || 0) % GAME_CONSTANTS.BATCH_SIZE !== 0) {
          errors.push(`Batch ${b.id} quantity must be in increments of ${GAME_CONSTANTS.BATCH_SIZE}`);
        }
        const lead = this.getProductionLead(b.product, b.method);
        for (let w = b.startWeek; w < b.startWeek + lead; w++) {
          if (b.method === 'inhouse') {
            capacityMap[w] = (capacityMap[w] || 0) + Number(b.quantity);
            const available = GAME_CONSTANTS.CAPACITY_SCHEDULE[w - 1] || 0;
            if (capacityMap[w] > available) {
              errors.push(`Production capacity exceeded in week ${w}`);
            }
          }
        }
        // Launch deadline: need arrival by end of week 6 for launch at week 7
        const shipWeeks = this.getShippingWeeks(b.shipping || 'standard');
        const completionWeek = b.startWeek + lead;
        const arrivalBy = completionWeek + shipWeeks; // arrives end-of-week
        if (arrivalBy > 6) {
          errors.push(`Batch ${b.id} for ${b.product} arrives after launch deadline`);
        }

        // Materials check: Net available
        const fabric = productData?.[b.product]?.fabric;
        if (fabric) {
          const entry = rawMaterials?.[fabric] || { onHand: 0, allocated: 0 };
          const netAvailable = Number(entry.onHand || 0) - Number(entry.allocated || 0);
          if (netAvailable < Number(b.quantity || 0)) {
            errors.push(`Insufficient materials for batch ${b.id} (${b.product})`);
          }
        } else {
          errors.push(`No fabric selected for ${b.product}`);
        }
      }
    }

    // Procurement validations
    const procurement = currentState.procurementContracts as any;
    if (procurement) {
      const contracts = procurement.contracts || [];
      for (const c of contracts) {
        if (c.type === 'FVC' && c.weekSigned !== 1) {
          errors.push('FVC contracts can only be signed in Week 1');
        }
      }
      const seasonNeed = GAME_CONSTANTS.PRODUCTS.jacket.forecast + GAME_CONSTANTS.PRODUCTS.dress.forecast + GAME_CONSTANTS.PRODUCTS.pants.forecast;
      const gmcUnits = contracts.filter((c: any) => c.type === 'GMC').reduce((s: number, c: any) => s + Number(c.units || 0), 0);
      if (gmcUnits > 0 && gmcUnits < 0.7 * seasonNeed) {
        errors.push('GMC total commitment must be at least 70% of season requirements');
      }
    }
    
    // Sales phase validations (Week 7-12) 
    if (phase === 'sales') {
      // Check marketing spend
      const marketingSpend = Number((currentState as any).marketingPlan?.totalSpend ?? currentState.marketingSpend ?? 0);
      if (!marketingSpend || marketingSpend === 0) {
        warnings.push("Zero marketing spend may negatively impact sales");
      }
      // Aggressive pricing warning: Positioning_Effect penalty > 15%
      const productData = currentState.productData as any;
      for (const [product, data] of Object.entries(productData || {})) {
        const rrp = Number((data as any).rrp);
        const hm = GAME_CONSTANTS.PRODUCTS[product as keyof typeof GAME_CONSTANTS.PRODUCTS].hmPrice;
        const x = rrp / hm - 1;
        const positioningEffect = 1 + (0.8 / (1 + Math.exp(-(-50) * (x - 0.20)))) - 0.4;
        if (positioningEffect < 0.85) {
          warnings.push(`Aggressive pricing for ${product} may hurt demand`);
        }
        // Price floor with discount
        const discount = Number((currentState as any).weeklyDiscounts?.[product as keyof any] ?? 0);
        const prodCost = GAME_CONSTANTS.MANUFACTURING[product as keyof typeof GAME_CONSTANTS.MANUFACTURING]?.inHouseCost || 0;
        const confirmed = Number((data as any).confirmedMaterialCost || 0);
        if (rrp && rrp * (1 - discount) < 1.05 * (confirmed + prodCost)) {
          errors.push(`Discounted price below cost floor for ${product}`);
        }
      }
    }
    
    // Cash flow validation: estimate this week's due payments (procurement instalments + production starts + shipping + marketing + holding)
    const cashOnHand = Number(currentState.cashOnHand || 0);
    const creditUsed = Number(currentState.creditUsed || 0);
    const availableFunds = cashOnHand + (GAME_CONSTANTS.CREDIT_LIMIT - creditUsed);
    let immediatePayments = 0;
    const procurementContracts = currentState.procurementContracts as any;
    if (procurementContracts) {
      for (const c of procurementContracts.contracts || []) {
        const unitBase = (GAME_CONSTANTS.SUPPLIERS as any)[c.supplier]?.materials?.[c.material]?.price || 0;
        const surcharge = (GAME_CONSTANTS.SUPPLIERS as any)[c.supplier]?.materials?.[c.material]?.printSurcharge || 0;
        const discount = this.computeSupplierVolumeDiscount(Number(c.units || 0));
        const unitPrice = (unitBase + surcharge) * (1 - discount);
        if (c.type === 'FVC') {
          if (c.weekSigned === weekNumber) immediatePayments += (Number(c.units || 0) * unitPrice) * 0.30;
          if ((c.weekSigned + 8) === weekNumber) immediatePayments += (Number(c.units || 0) * unitPrice) * 0.70;
        } else if (c.type === 'GMC') {
          const orders = (c as any).gmcOrders || [];
          for (const o of orders) {
            if (this.toNumber(o.week) + 2 === weekNumber) {
              immediatePayments += this.toNumber(o.units) * unitPrice;
            }
          }
        } else if (c.type === 'SPT') {
          const lead = this.getSupplierLeadTime(c.supplier);
          if (c.weekSigned + lead === weekNumber) {
            const defectRate = this.getSupplierDefectRate(c.supplier);
            const goodUnits = Number(c.units || 0) * (1 - defectRate);
            immediatePayments += goodUnits * unitPrice;
          }
        }
      }
    }
    // Production starts this week
    const prod = currentState.productionSchedule as any;
    for (const b of prod?.batches || []) {
      if (b.startWeek === weekNumber) {
        immediatePayments += Number(b.quantity || 0) * this.getProductionUnitCost(b.product, b.method);
        // Shipping will be paid at production completion; skip here
      }
    }
    // Marketing spend
    immediatePayments += Number((currentState as any).marketingPlan?.totalSpend ?? currentState.marketingSpend ?? 0);

    if (immediatePayments > availableFunds) {
      errors.push("Inadequate cash for this week's plan");
    }

    // Warnings
    if (cashOnHand < 100000) warnings.push("Low cash balance may lead to future liquidity issues");
    // High inventory value vs next week demand
    const nextWeek = weekNumber + 1;
    if (nextWeek >= 7 && nextWeek <= 12) {
      const productData = currentState.productData as any;
      let nextDemand = 0;
      for (const p of ['jacket', 'dress', 'pants']) {
        const d = productData?.[p];
        if (d?.rrp) {
          nextDemand += this.calculateDemand(p as any, nextWeek, Number(d.rrp), 0, Number((currentState as any).marketingPlan?.totalSpend ?? 0), Boolean(d.hasPrint));
        }
      }
      // Approx finished goods value in units
      const fgUnits = ((currentState as any).finishedGoods?.lots || []).reduce((s: number, l: any) => s + Number(l.quantity || 0), 0);
      if (fgUnits > 3 * nextDemand) warnings.push("High inventory levels relative to demand");
      if (nextDemand > fgUnits * 1.2) warnings.push("Low service level risk: demand may exceed available inventory");
    }
    
    return {
      errors,
      warnings,
      canCommit: errors.length === 0
    };
  }
  
  static initializeNewGame(userId: string): Partial<WeeklyState> {
    return {
      weekNumber: 1,
      phase: 'strategy',
      cashOnHand: GAME_CONSTANTS.STARTING_CAPITAL.toString(),
      creditUsed: '0',
      interestAccrued: '0',
      productData: {
        jacket: { rrp: null, fabric: null, hasPrint: false },
        dress: { rrp: null, fabric: null, hasPrint: false },
        pants: { rrp: null, fabric: null, hasPrint: false }
      } as any,
      rawMaterials: {},
      workInProcess: { batches: [] } as any,
      finishedGoods: { lots: [] } as any,
      shipmentsInTransit: [],
      productionSchedule: { batches: [] },
      procurementContracts: { contracts: [] },
      materialPurchases: [],
      materialInventory: {},
      marketingSpend: '0', // legacy UI field
      marketingPlan: { totalSpend: 0 } as any,
      weeklyDiscounts: { jacket: 0, dress: 0, pants: 0 },
      weeklyRevenue: '0',
      weeklyDemand: { jacket: 0, dress: 0, pants: 0 },
      weeklySales: { jacket: 0, dress: 0, pants: 0 },
      lostSales: { jacket: 0, dress: 0, pants: 0 },
      materialCosts: '0',
      productionCosts: '0',
      logisticsCosts: '0',
      holdingCosts: '0',
      totals: { revenueToDate: 0, unitsSoldToDate: 0, cogsMaterialsToDate: 0, cogsProductionToDate: 0, cogsLogisticsToDate: 0, cogsMarketingToDate: 0 } as any,
      validationErrors: [],
      validationWarnings: [],
      isCommitted: false
    };
  }
  
  static calculateServiceLevel(weeklyStates: WeeklyState[]): number {
    const salesWeeks = weeklyStates.filter(w => w.weekNumber >= 7 && w.weekNumber <= 12);
    if (salesWeeks.length === 0) return 0;
    
    let totalDemand = 0;
    let totalServed = 0;
    
    for (const week of salesWeeks) {
      const demand = week.weeklyDemand as any;
      const sales = week.weeklySales as any;
      
      for (const product of ['jacket', 'dress', 'pants']) {
        totalDemand += demand[product] || 0;
        totalServed += sales[product] || 0;
      }
    }
    
    return totalDemand > 0 ? (totalServed / totalDemand) * 100 : 0;
  }
  
  static calculateEconomicProfit(
    totalRevenue: number,
    totalCosts: number,
    averageCapitalEmployed: number
  ): number {
    const capitalCharge = averageCapitalEmployed * 0.10; // 10% annual charge
    return totalRevenue - totalCosts - capitalCharge;
  }
}
