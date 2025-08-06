import { WeeklyState, GameSession } from "@shared/schema";

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
        }
      }
    }
    
    // Development phase validations (Week 3-6)
    if (phase === 'development') {
      // Check materials availability
      const rawMaterials = currentState.rawMaterials as any;
      const productionSchedule = currentState.productionSchedule as any;
      
      if (productionSchedule) {
        for (const batch of productionSchedule.batches || []) {
          // Check if production will complete before Week 7
          const completionWeek = batch.startWeek + (batch.method === 'inhouse' ? 
            GAME_CONSTANTS.MANUFACTURING[batch.product as keyof typeof GAME_CONSTANTS.MANUFACTURING].inHouseTime :
            GAME_CONSTANTS.MANUFACTURING[batch.product as keyof typeof GAME_CONSTANTS.MANUFACTURING].outsourceTime);
          
          if (completionWeek > 7) {
            errors.push(`Production batch for ${batch.product} will complete after launch deadline`);
          }
          
          // Check capacity constraints
          if (batch.method === 'inhouse') {
            const requiredCapacity = batch.quantity;
            const availableCapacity = GAME_CONSTANTS.CAPACITY_SCHEDULE[batch.startWeek - 1] || 0;
            if (requiredCapacity > availableCapacity) {
              errors.push(`Production capacity exceeded in week ${batch.startWeek}`);
            }
          }
        }
      }
    }
    
    // Sales phase validations (Week 7-12) 
    if (phase === 'sales') {
      // Check marketing spend
      if (!currentState.marketingSpend || Number(currentState.marketingSpend) === 0) {
        warnings.push("Zero marketing spend may negatively impact sales");
      }
    }
    
    // Cash flow validation
    const cashOnHand = Number(currentState.cashOnHand || 0);
    const creditUsed = Number(currentState.creditUsed || 0);
    const availableFunds = cashOnHand + (GAME_CONSTANTS.CREDIT_LIMIT - creditUsed);
    
    // Calculate immediate payment requirements
    let immediatePayments = 0;
    const procurementContracts = currentState.procurementContracts as any;
    if (procurementContracts) {
      for (const contract of procurementContracts.contracts || []) {
        if (contract.type === 'FVC' && contract.weekSigned === weekNumber) {
          immediatePayments += contract.value * 0.25; // 25% down payment
        }
        // Add other payment calculations...
      }
    }
    
    if (immediatePayments > availableFunds) {
      errors.push("Insufficient funds for immediate payments");
    }
    
    // Warning for negative future cash flow
    if (cashOnHand < 100000) {
      warnings.push("Low cash balance may lead to future liquidity issues");
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
      },
      rawMaterials: {},
      workInProcess: {},
      finishedGoods: {},
      productionSchedule: { batches: [] },
      procurementContracts: { contracts: [] },
      materialPurchases: [],
      materialInventory: {},
      marketingSpend: '0',
      weeklyDiscounts: { jacket: 0, dress: 0, pants: 0 },
      weeklyRevenue: '0',
      weeklyDemand: { jacket: 0, dress: 0, pants: 0 },
      weeklySales: { jacket: 0, dress: 0, pants: 0 },
      lostSales: { jacket: 0, dress: 0, pants: 0 },
      materialCosts: '0',
      productionCosts: '0',
      logisticsCosts: '0',
      holdingCosts: '0',
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
