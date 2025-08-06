var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
function generateId() {
  return (globalThis.crypto ?? __require("crypto")).randomUUID();
}
var usersStore = [];
var gameSessionsStore = [];
var weeklyStatesStore = [];
var InMemoryStorage = class {
  // Retrieve a user by its UUID. Returns undefined if not found.
  async getUser(id) {
    return usersStore.find((u) => u.id === id);
  }
  // Create or update a user based on email. If a user with the same
  // email exists, update its fields; otherwise create a new user. The
  // returned object follows the User type.
  async upsertUser(userData) {
    let existing = usersStore.find((u) => u.email === userData.email);
    const now = /* @__PURE__ */ new Date();
    if (existing) {
      Object.assign(existing, userData, { updatedAt: now });
      return existing;
    } else {
      const newUser = {
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        ...userData
      };
      usersStore.push(newUser);
      return newUser;
    }
  }
  // Create a new game session. Generates an ID and timestamps if they
  // aren't provided.
  async createGameSession(gameSession) {
    const now = /* @__PURE__ */ new Date();
    const session = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      isCompleted: false,
      finalScore: null,
      finalCash: null,
      finalServiceLevel: null,
      finalEconomicProfit: null,
      ...gameSession
    };
    gameSessionsStore.push(session);
    return session;
  }
  // Fetch a game session by ID.
  async getGameSession(id) {
    return gameSessionsStore.find((s) => s.id === id);
  }
  // Find the most recent active game session for a user. We treat the
  // last created session that is not completed as the active one.
  async getUserActiveGameSession(userId) {
    const sessions = gameSessionsStore.filter((s) => s.userId === userId && s.isCompleted === false).sort((a, b) => a.createdAt > b.createdAt ? -1 : 1);
    return sessions[0];
  }
  // Update a game session with new fields and update the timestamp.
  async updateGameSession(id, updates) {
    const session = gameSessionsStore.find((s) => s.id === id);
    if (!session) throw new Error("Game session not found");
    Object.assign(session, updates, { updatedAt: /* @__PURE__ */ new Date() });
    return session;
  }
  // Create a new weekly state for a game. Assigns an ID, timestamps and
  // merges any provided fields. Numeric values should already be strings
  // (to be consistent with the database version) so we simply spread them.
  async createWeeklyState(weeklyState) {
    const now = /* @__PURE__ */ new Date();
    const state = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      isCommitted: false,
      ...weeklyState
    };
    weeklyStatesStore.push(state);
    return state;
  }
  // Retrieve a specific week of a game session.
  async getWeeklyState(gameSessionId, weekNumber) {
    return weeklyStatesStore.find((w) => w.gameSessionId === gameSessionId && w.weekNumber === weekNumber);
  }
  // Return the most recently created week for a game session. Sorting by
  // weekNumber ensures we always return the highest week.
  async getLatestWeeklyState(gameSessionId) {
    const states = weeklyStatesStore.filter((w) => w.gameSessionId === gameSessionId).sort((a, b) => b.weekNumber - a.weekNumber);
    return states[0];
  }
  // Update a weekly state. Mutates the object in place and updates
  // timestamps.
  async updateWeeklyState(id, updates) {
    const state = weeklyStatesStore.find((w) => w.id === id);
    if (!state) throw new Error("Weekly state not found");
    Object.assign(state, updates, { updatedAt: /* @__PURE__ */ new Date() });
    return state;
  }
  // Return all weekly states for a game session ordered by the week number.
  async getAllWeeklyStates(gameSessionId) {
    return weeklyStatesStore.filter((w) => w.gameSessionId === gameSessionId).sort((a, b) => a.weekNumber - b.weekNumber);
  }
  // Mark a weekly state as committed. Returns the updated state.
  async commitWeeklyState(id) {
    const state = weeklyStatesStore.find((w) => w.id === id);
    if (!state) throw new Error("Weekly state not found");
    state.isCommitted = true;
    state.updatedAt = /* @__PURE__ */ new Date();
    return state;
  }
};
var storage = new InMemoryStorage();

// server/replitAuth.ts
var demoUserId;
async function setupAuth(app2) {
  const demoUser = await storage.upsertUser({
    email: "demo@example.com",
    firstName: "Demo",
    lastName: "User",
    profileImageUrl: ""
  });
  demoUserId = demoUser.id;
  app2.use(async (req, _res, next) => {
    req.user = { claims: { sub: demoUserId } };
    next();
  });
}
var isAuthenticated = (_req, _res, next) => {
  return next();
};

// server/gameEngine.ts
var GAME_CONSTANTS = {
  STARTING_CAPITAL: 1e6,
  CREDIT_LIMIT: 1e7,
  WEEKLY_INTEREST_RATE: 2e-3,
  HOLDING_COST_RATE: 3e-3,
  BATCH_SIZE: 25e3,
  BASELINE_MARKETING_SPEND: 216667,
  PRODUCTS: {
    jacket: {
      name: "Vintage Denim Jacket",
      forecast: 1e5,
      hmPrice: 80,
      highEndRange: [300, 550],
      elasticity: -1.4
    },
    dress: {
      name: "Floral Print Dress",
      forecast: 15e4,
      hmPrice: 50,
      highEndRange: [180, 210],
      elasticity: -1.2
    },
    pants: {
      name: "Corduroy Pants",
      forecast: 12e4,
      hmPrice: 60,
      highEndRange: [190, 220],
      elasticity: -1.55
    }
  },
  SEASONALITY: [0, 0.2, 0.4, 0.6, 0.8, 1, 1.1, 1.2, 1.2, 1.1, 0.8, 0.5, 0.3, 0.1, 0],
  SUPPLIERS: {
    supplier1: {
      name: "Supplier-1 (Premium)",
      defectRate: 0,
      leadTime: 2,
      maxDiscount: 0.15,
      materials: {
        selvedgeDenim: { price: 16, printSurcharge: 3 },
        standardDenim: { price: 10, printSurcharge: 3 },
        egyptianCotton: { price: 12, printSurcharge: 2 },
        polyesterBlend: { price: 7, printSurcharge: 2 },
        fineWaleCorduroy: { price: 14, printSurcharge: 3 },
        wideWaleCorduroy: { price: 9, printSurcharge: 3 }
      }
    },
    supplier2: {
      name: "Supplier-2 (Standard)",
      defectRate: 0.05,
      leadTime: 2,
      maxDiscount: 0.1,
      materials: {
        selvedgeDenim: { price: 13, printSurcharge: 2 },
        egyptianCotton: { price: 10, printSurcharge: 1 },
        polyesterBlend: { price: 6, printSurcharge: 1 },
        fineWaleCorduroy: { price: 11, printSurcharge: 2 },
        wideWaleCorduroy: { price: 7, printSurcharge: 2 }
      }
    }
  },
  VOLUME_DISCOUNTS: [
    { min: 1e5, max: 299999, discount: 0.03 },
    { min: 3e5, max: 499999, discount: 0.07 },
    { min: 5e5, max: Infinity, discount: 0.12 }
  ],
  MANUFACTURING: {
    jacket: { inHouseCost: 15, outsourceCost: 25, inHouseTime: 3, outsourceTime: 1 },
    dress: { inHouseCost: 8, outsourceCost: 14, inHouseTime: 2, outsourceTime: 1 },
    pants: { inHouseCost: 12, outsourceCost: 18, inHouseTime: 2, outsourceTime: 1 }
  },
  CAPACITY_SCHEDULE: [
    0,
    0,
    25e3,
    5e4,
    1e5,
    1e5,
    15e4,
    15e4,
    2e5,
    2e5,
    1e5,
    5e4,
    0,
    0,
    0
  ],
  SHIPPING: {
    jacket: { standard: 4, expedited: 7 },
    dress: { standard: 2.5, expedited: 4 },
    pants: { standard: 3, expedited: 6 }
  }
};
var GameEngine = class {
  static processMaterialPurchases(currentState, updates) {
    const newPurchases = updates.materialPurchases || [];
    const existingPurchases = currentState.materialPurchases || [];
    let totalPurchaseCost = 0;
    const newPurchasesList = newPurchases.filter((purchase) => {
      const isNew = !existingPurchases.some(
        (existing) => existing.timestamp === purchase.timestamp
      );
      if (isNew) {
        totalPurchaseCost += purchase.totalCommitment || 0;
      }
      return isNew;
    });
    if (newPurchasesList.length === 0) {
      return updates;
    }
    const currentCash = parseFloat(currentState.cashOnHand || GAME_CONSTANTS.STARTING_CAPITAL);
    const currentCreditUsed = parseFloat(currentState.creditUsed || 0);
    const creditAvailable = GAME_CONSTANTS.CREDIT_LIMIT - currentCreditUsed;
    let updatedCashOnHand = currentCash;
    let updatedCreditUsed = currentCreditUsed;
    if (totalPurchaseCost <= currentCash) {
      updatedCashOnHand = currentCash - totalPurchaseCost;
    } else {
      const remainingCost = totalPurchaseCost - currentCash;
      updatedCashOnHand = 0;
      updatedCreditUsed = Math.min(GAME_CONSTANTS.CREDIT_LIMIT, currentCreditUsed + remainingCost);
    }
    const updatedMaterialInventory = { ...currentState.materialInventory || {} };
    newPurchases.forEach((purchase) => {
      if (purchase.shipmentWeek <= currentState.weekNumber) {
        purchase.orders?.forEach((order) => {
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
      materialCosts: (parseFloat(currentState.materialCosts || "0") + totalPurchaseCost).toString()
    };
  }
  static processProductionSchedule(currentState, updates) {
    const newProductionSchedule = updates.productionSchedule;
    if (!newProductionSchedule) return updates;
    const existingBatches = currentState.productionSchedule?.batches || [];
    const newBatches = newProductionSchedule.batches || [];
    let totalProductionCost = 0;
    const addedBatches = newBatches.filter((newBatch) => {
      return !existingBatches.some((existing) => existing.id === newBatch.id);
    });
    addedBatches.forEach((batch) => {
      totalProductionCost += batch.totalCost || 0;
    });
    if (totalProductionCost === 0) return updates;
    const currentCash = parseFloat(currentState.cashOnHand || GAME_CONSTANTS.STARTING_CAPITAL);
    const currentCreditUsed = parseFloat(currentState.creditUsed || 0);
    let updatedCashOnHand = currentCash;
    let updatedCreditUsed = currentCreditUsed;
    if (totalProductionCost <= currentCash) {
      updatedCashOnHand = currentCash - totalProductionCost;
    } else {
      const remainingCost = totalProductionCost - currentCash;
      updatedCashOnHand = 0;
      updatedCreditUsed = Math.min(GAME_CONSTANTS.CREDIT_LIMIT, currentCreditUsed + remainingCost);
    }
    return {
      ...updates,
      cashOnHand: updatedCashOnHand.toString(),
      creditUsed: updatedCreditUsed.toString(),
      productionCosts: (parseFloat(currentState.productionCosts || "0") + totalProductionCost).toString()
    };
  }
  static calculateDemand(product, week, rrp, discount = 0, marketingSpend = 0, hasPrint = false) {
    const productData = GAME_CONSTANTS.PRODUCTS[product];
    const baseUnits = productData.forecast;
    const seasonality = GAME_CONSTANTS.SEASONALITY[week - 1] || 0;
    const finalPrice = rrp * (1 - discount);
    const priceEffect = Math.pow(rrp / finalPrice, productData.elasticity);
    const promoLift = Math.max(0.2, marketingSpend / GAME_CONSTANTS.BASELINE_MARKETING_SPEND);
    const priceRatio = rrp / productData.hmPrice - 1;
    const positioningEffect = 1 + 0.8 / (1 + Math.exp(50 * (priceRatio - 0.2))) - 0.4;
    const designEffect = hasPrint ? 1.05 : 0.95;
    return Math.round(baseUnits * seasonality * priceEffect * promoLift * positioningEffect * designEffect);
  }
  static calculateProjectedUnitCost(product, materialChoice, hasPrint) {
    const s1Materials = GAME_CONSTANTS.SUPPLIERS.supplier1.materials;
    const s2Materials = GAME_CONSTANTS.SUPPLIERS.supplier2.materials;
    const s1Price = s1Materials[materialChoice]?.price || 0;
    const s2Price = s2Materials[materialChoice]?.price || 0;
    let avgMaterialCost = s2Price ? (s1Price + s2Price) / 2 : s1Price;
    if (hasPrint) {
      const s1PrintSurcharge = s1Materials[materialChoice]?.printSurcharge || 0;
      const s2PrintSurcharge = s2Materials[materialChoice]?.printSurcharge || 0;
      const avgPrintSurcharge = s2PrintSurcharge ? (s1PrintSurcharge + s2PrintSurcharge) / 2 : s1PrintSurcharge;
      avgMaterialCost += avgPrintSurcharge;
    }
    return avgMaterialCost;
  }
  static calculateActualUnitCost(totalRevenue, totalMaterialCosts, totalProductionCosts, totalLogisticsCosts, totalMarketingCosts, totalUnitsSold) {
    if (totalUnitsSold === 0) return 0;
    const totalCOGS = totalMaterialCosts + totalProductionCosts + totalLogisticsCosts + totalMarketingCosts;
    return totalCOGS / totalUnitsSold;
  }
  static calculateHoldingCosts(inventoryValue) {
    return inventoryValue * GAME_CONSTANTS.HOLDING_COST_RATE;
  }
  static calculateInterest(creditBalance) {
    return creditBalance * GAME_CONSTANTS.WEEKLY_INTEREST_RATE;
  }
  static getPhaseForWeek(week) {
    if (week <= 2) return "strategy";
    if (week <= 6) return "development";
    if (week <= 12) return "sales";
    return "runout";
  }
  static validateWeeklyDecisions(weekNumber, currentState, gameSession) {
    const errors = [];
    const warnings = [];
    const phase = this.getPhaseForWeek(weekNumber);
    if (phase === "strategy") {
      const productData = currentState.productData;
      if (!productData) {
        errors.push("Product data not provided");
      } else {
        for (const [product, data] of Object.entries(productData)) {
          const productInfo = data;
          if (!productInfo.rrp) {
            errors.push(`RRP not set for ${product}`);
          }
        }
      }
    }
    if (phase === "development") {
      const rawMaterials = currentState.rawMaterials;
      const productionSchedule = currentState.productionSchedule;
      if (productionSchedule) {
        for (const batch of productionSchedule.batches || []) {
          const completionWeek = batch.startWeek + (batch.method === "inhouse" ? GAME_CONSTANTS.MANUFACTURING[batch.product].inHouseTime : GAME_CONSTANTS.MANUFACTURING[batch.product].outsourceTime);
          if (completionWeek > 7) {
            errors.push(`Production batch for ${batch.product} will complete after launch deadline`);
          }
          if (batch.method === "inhouse") {
            const requiredCapacity = batch.quantity;
            const availableCapacity = GAME_CONSTANTS.CAPACITY_SCHEDULE[batch.startWeek - 1] || 0;
            if (requiredCapacity > availableCapacity) {
              errors.push(`Production capacity exceeded in week ${batch.startWeek}`);
            }
          }
        }
      }
    }
    if (phase === "sales") {
      if (!currentState.marketingSpend || Number(currentState.marketingSpend) === 0) {
        warnings.push("Zero marketing spend may negatively impact sales");
      }
    }
    const cashOnHand = Number(currentState.cashOnHand || 0);
    const creditUsed = Number(currentState.creditUsed || 0);
    const availableFunds = cashOnHand + (GAME_CONSTANTS.CREDIT_LIMIT - creditUsed);
    let immediatePayments = 0;
    const procurementContracts = currentState.procurementContracts;
    if (procurementContracts) {
      for (const contract of procurementContracts.contracts || []) {
        if (contract.type === "FVC" && contract.weekSigned === weekNumber) {
          immediatePayments += contract.value * 0.25;
        }
      }
    }
    if (immediatePayments > availableFunds) {
      errors.push("Insufficient funds for immediate payments");
    }
    if (cashOnHand < 1e5) {
      warnings.push("Low cash balance may lead to future liquidity issues");
    }
    return {
      errors,
      warnings,
      canCommit: errors.length === 0
    };
  }
  static initializeNewGame(userId) {
    return {
      weekNumber: 1,
      phase: "strategy",
      cashOnHand: GAME_CONSTANTS.STARTING_CAPITAL.toString(),
      creditUsed: "0",
      interestAccrued: "0",
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
      marketingSpend: "0",
      weeklyDiscounts: { jacket: 0, dress: 0, pants: 0 },
      weeklyRevenue: "0",
      weeklyDemand: { jacket: 0, dress: 0, pants: 0 },
      weeklySales: { jacket: 0, dress: 0, pants: 0 },
      lostSales: { jacket: 0, dress: 0, pants: 0 },
      materialCosts: "0",
      productionCosts: "0",
      logisticsCosts: "0",
      holdingCosts: "0",
      validationErrors: [],
      validationWarnings: [],
      isCommitted: false
    };
  }
  static calculateServiceLevel(weeklyStates) {
    const salesWeeks = weeklyStates.filter((w) => w.weekNumber >= 7 && w.weekNumber <= 12);
    if (salesWeeks.length === 0) return 0;
    let totalDemand = 0;
    let totalServed = 0;
    for (const week of salesWeeks) {
      const demand = week.weeklyDemand;
      const sales = week.weeklySales;
      for (const product of ["jacket", "dress", "pants"]) {
        totalDemand += demand[product] || 0;
        totalServed += sales[product] || 0;
      }
    }
    return totalDemand > 0 ? totalServed / totalDemand * 100 : 0;
  }
  static calculateEconomicProfit(totalRevenue, totalCosts, averageCapitalEmployed) {
    const capitalCharge = averageCapitalEmployed * 0.1;
    return totalRevenue - totalCosts - capitalCharge;
  }
};

// server/routes.ts
async function registerRoutes(app2) {
  await setupAuth(app2);
  app2.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  app2.post("/api/game/start", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const existingGame = await storage.getUserActiveGameSession(userId);
      if (existingGame) {
        return res.status(400).json({ message: "User already has an active game session" });
      }
      const gameSession = await storage.createGameSession({
        userId,
        isCompleted: false
      });
      const initialState = GameEngine.initializeNewGame(userId);
      await storage.createWeeklyState({
        gameSessionId: gameSession.id,
        ...initialState
      });
      res.json(gameSession);
    } catch (error) {
      console.error("Error starting game:", error);
      res.status(500).json({ message: "Failed to start game" });
    }
  });
  app2.get("/api/game/current", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user.claims.sub;
      const gameSession = await storage.getUserActiveGameSession(userId);
      if (!gameSession) {
        return res.status(404).json({ message: "No active game session" });
      }
      const latestState = await storage.getLatestWeeklyState(gameSession.id);
      res.json({
        gameSession,
        currentState: latestState
      });
    } catch (error) {
      console.error("Error fetching current game:", error);
      res.status(500).json({ message: "Failed to fetch current game" });
    }
  });
  app2.get("/api/game/:gameId/week/:weekNumber", isAuthenticated, async (req, res) => {
    try {
      const { gameId, weekNumber } = req.params;
      const week = parseInt(weekNumber);
      const weeklyState = await storage.getWeeklyState(gameId, week);
      if (!weeklyState) {
        return res.status(404).json({ message: "Weekly state not found" });
      }
      res.json(weeklyState);
    } catch (error) {
      console.error("Error fetching weekly state:", error);
      res.status(500).json({ message: "Failed to fetch weekly state" });
    }
  });
  app2.post("/api/game/:gameId/week/:weekNumber/update", isAuthenticated, async (req, res) => {
    try {
      const { gameId, weekNumber } = req.params;
      const week = parseInt(weekNumber);
      const updates = req.body;
      let weeklyState = await storage.getWeeklyState(gameId, week);
      if (!weeklyState) {
        const gameSession = await storage.getGameSession(gameId);
        if (!gameSession) {
          return res.status(404).json({ message: "Game session not found" });
        }
        const initialState = GameEngine.initializeNewGame(gameSession.userId);
        weeklyState = await storage.createWeeklyState({
          gameSessionId: gameId,
          weekNumber: week,
          phase: GameEngine.getPhaseForWeek(week),
          ...initialState,
          ...updates
        });
      } else {
        if (updates.materialPurchases) {
          const processedUpdates = GameEngine.processMaterialPurchases(weeklyState, updates);
          weeklyState = await storage.updateWeeklyState(weeklyState.id, processedUpdates);
        } else if (updates.productionSchedule) {
          const processedUpdates = GameEngine.processProductionSchedule(weeklyState, updates);
          weeklyState = await storage.updateWeeklyState(weeklyState.id, processedUpdates);
        } else {
          weeklyState = await storage.updateWeeklyState(weeklyState.id, updates);
        }
      }
      res.json(weeklyState);
    } catch (error) {
      console.error("Error updating weekly state:", error);
      res.status(500).json({ message: "Failed to update weekly state" });
    }
  });
  app2.post("/api/game/:gameId/week/:weekNumber/validate", isAuthenticated, async (req, res) => {
    try {
      const { gameId, weekNumber } = req.params;
      const week = parseInt(weekNumber);
      const weeklyState = await storage.getWeeklyState(gameId, week);
      if (!weeklyState) {
        return res.status(404).json({ message: "Weekly state not found" });
      }
      const gameSession = await storage.getGameSession(gameId);
      if (!gameSession) {
        return res.status(404).json({ message: "Game session not found" });
      }
      const validation = GameEngine.validateWeeklyDecisions(week, weeklyState, gameSession);
      await storage.updateWeeklyState(weeklyState.id, {
        validationErrors: validation.errors,
        validationWarnings: validation.warnings
      });
      res.json(validation);
    } catch (error) {
      console.error("Error validating weekly state:", error);
      res.status(500).json({ message: "Failed to validate weekly state" });
    }
  });
  app2.post("/api/game/:gameId/week/:weekNumber/commit", isAuthenticated, async (req, res) => {
    try {
      const { gameId, weekNumber } = req.params;
      const week = parseInt(weekNumber);
      const weeklyState = await storage.getWeeklyState(gameId, week);
      if (!weeklyState) {
        return res.status(404).json({ message: "Weekly state not found" });
      }
      const gameSession = await storage.getGameSession(gameId);
      if (!gameSession) {
        return res.status(404).json({ message: "Game session not found" });
      }
      const validation = GameEngine.validateWeeklyDecisions(week, weeklyState, gameSession);
      if (!validation.canCommit) {
        return res.status(400).json({
          message: "Cannot commit week due to validation errors",
          errors: validation.errors
        });
      }
      const committedState = await storage.commitWeeklyState(weeklyState.id);
      if (week === 15) {
        const allStates = await storage.getAllWeeklyStates(gameId);
        const serviceLevel = GameEngine.calculateServiceLevel(allStates);
        const totalRevenue = allStates.reduce((sum, state) => sum + Number(state.weeklyRevenue), 0);
        const totalCosts = allStates.reduce((sum, state) => sum + Number(state.materialCosts) + Number(state.productionCosts) + Number(state.logisticsCosts) + Number(state.holdingCosts), 0);
        const economicProfit = GameEngine.calculateEconomicProfit(totalRevenue, totalCosts, GAME_CONSTANTS.STARTING_CAPITAL);
        await storage.updateGameSession(gameId, {
          isCompleted: true,
          finalServiceLevel: serviceLevel.toString(),
          finalCash: committedState.cashOnHand,
          finalEconomicProfit: economicProfit.toString()
        });
      }
      if (week < 15) {
        const nextWeekState = {
          ...weeklyState,
          id: void 0,
          weekNumber: week + 1,
          phase: GameEngine.getPhaseForWeek(week + 1),
          isCommitted: false,
          validationErrors: [],
          validationWarnings: []
        };
        await storage.createWeeklyState(nextWeekState);
      }
      res.json(committedState);
    } catch (error) {
      console.error("Error committing weekly state:", error);
      res.status(500).json({ message: "Failed to commit weekly state" });
    }
  });
  app2.get("/api/game/constants", async (req, res) => {
    res.json(GAME_CONSTANTS);
  });
  app2.post("/api/game/calculate-demand", async (req, res) => {
    try {
      const { product, week, rrp, discount, marketingSpend, hasPrint } = req.body;
      const demand = GameEngine.calculateDemand(
        product,
        week,
        rrp,
        discount || 0,
        marketingSpend || 0,
        hasPrint || false
      );
      res.json({ demand });
    } catch (error) {
      console.error("Error calculating demand:", error);
      res.status(500).json({ message: "Failed to calculate demand" });
    }
  });
  app2.post("/api/game/calculate-unit-cost", async (req, res) => {
    try {
      const { product, materialChoice, hasPrint } = req.body;
      const cost = GameEngine.calculateProjectedUnitCost(product, materialChoice, hasPrint);
      res.json({ cost });
    } catch (error) {
      console.error("Error calculating unit cost:", error);
      res.status(500).json({ message: "Failed to calculate unit cost" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
var vite_config_default = defineConfig({
  plugins: [
    react()
    // Additional plugins can be added here. Replit‑specific plugins have
    // been removed to ensure this configuration works on any platform.
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
