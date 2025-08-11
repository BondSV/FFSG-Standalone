import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { GameEngine, GAME_CONSTANTS } from "./gameEngine";
import { insertGameSessionSchema, insertWeeklyStateSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Game session routes
  app.post('/api/game/start', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check if user has an active game
      const existingGame = await storage.getUserActiveGameSession(userId);
      if (existingGame) {
        return res.status(400).json({ message: "User already has an active game session" });
      }
      
      // Create new game session
      const gameSession = await storage.createGameSession({
        userId,
        isCompleted: false,
      });
      
      // Create initial weekly state
      const initialState = GameEngine.initializeNewGame(userId);
      await storage.createWeeklyState({
        gameSessionId: gameSession.id,
        ...initialState,
      } as any);
      
      res.json(gameSession);
    } catch (error) {
      console.error("Error starting game:", error);
      res.status(500).json({ message: "Failed to start game" });
    }
  });

  app.get('/api/game/current', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const gameSession = await storage.getUserActiveGameSession(userId);
      
      // Return an explicit empty payload instead of 404 so the client can render a start screen gracefully
      if (!gameSession) {
        return res.status(200).json({ gameSession: null, currentState: null });
      }
      
      const latestState = await storage.getLatestWeeklyState(gameSession.id);
      
      res.json({
        gameSession,
        currentState: latestState,
      });
    } catch (error) {
      console.error("Error fetching current game:", error);
      res.status(500).json({ message: "Failed to fetch current game" });
    }
  });

  // Restart current game: mark active session as completed so the client shows the welcome/start screen
  app.post('/api/game/restart', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const active = await storage.getUserActiveGameSession(userId);
      if (!active) {
        return res.status(404).json({ message: 'No active game to restart' });
      }
      await storage.updateGameSession(active.id, { isCompleted: true });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error restarting game:', error);
      res.status(500).json({ message: 'Failed to restart game' });
    }
  });

  // List all weekly states for a game session (for analytics/final dashboard)
  app.get('/api/game/:gameId/weeks', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const gameSession = await storage.getGameSession(gameId);
      if (!gameSession) {
        return res.status(404).json({ message: "Game session not found" });
      }
      const weeklyStates = await storage.getAllWeeklyStates(gameId);
      // Sort by weekNumber ascending
      const sorted = weeklyStates.sort((a: any, b: any) => Number(a.weekNumber) - Number(b.weekNumber));
      res.json({ gameSession, weeks: sorted });
    } catch (error) {
      console.error("Error fetching weekly states:", error);
      res.status(500).json({ message: "Failed to fetch weekly states" });
    }
  });

  // Weekly state routes
  app.get('/api/game/:gameId/week/:weekNumber', isAuthenticated, async (req: any, res) => {
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

  app.post('/api/game/:gameId/week/:weekNumber/update', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId, weekNumber } = req.params;
      const week = parseInt(weekNumber);
      const updates = req.body;
      
      // Get existing state
      let weeklyState = await storage.getWeeklyState(gameId, week);
      
      if (!weeklyState) {
        // Create new weekly state if it doesn't exist
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
          ...updates,
        } as any);
      } else {
        // Process material purchases if they exist in updates
        if (updates.materialPurchases || updates.gmcCommitments || (updates.procurementContracts && typeof updates.procurementContracts.singleSupplierDeal !== 'undefined')) {
          // Convert material purchases UI into procurement contracts (iterative orders)
          // We will append GMC/SPT/FVC entries under procurementContracts and ignore immediate cash effects.
          const existing = (weeklyState as any).procurementContracts || { contracts: [] };
          const contracts = existing.contracts || [];
          const gmcCommitments = { ...(existing as any).gmcCommitments };
          const singleSupplierDeal = (updates.procurementContracts && updates.procurementContracts.singleSupplierDeal) || (existing as any).singleSupplierDeal;
          const currentWeek = Number(weeklyState.weekNumber);
          const purchases = (updates.materialPurchases as any[]) || [];

          // Build current supplier totals similar to engine (FVC + SPT + GMC commitments)
          const supplierTotals: Record<string, number> = {};
          for (const c of contracts) {
            if (c.type === 'FVC' || c.type === 'SPT') {
              supplierTotals[c.supplier] = (supplierTotals[c.supplier] || 0) + Number(c.units || 0);
            }
          }
          for (const [sup, commit] of Object.entries(gmcCommitments)) {
            supplierTotals[sup] = (supplierTotals[sup] || 0) + Number(commit || 0);
          }
          // Running additions within this update call
          const pendingAddBySupplier: Record<string, number> = {};
          for (const p of purchases) {
            // One contract per material
            for (const order of (p.orders || [])) {
              // Pull base and surcharge from constants to keep source of truth in engine
              const sup = GAME_CONSTANTS.SUPPLIERS as any;
              const base = sup[p.supplier]?.materials?.[order.material]?.price || 0;
              const surchargeCatalog = sup[p.supplier]?.materials?.[order.material]?.printSurcharge || 0;
              const applyPrint = Boolean(p.printOptions?.[order.material]);

              const contractBase: any = {
                id: `${p.timestamp}-${order.material}`,
                supplier: p.supplier,
                material: order.material,
                unitBasePrice: base,
                printSurcharge: applyPrint ? surchargeCatalog : 0,
              };

              // Compute effective discounted unit price at order time
              const baseUnit = base + (applyPrint ? surchargeCatalog : 0);
              const runningTotal = (supplierTotals[p.supplier] || 0) + (pendingAddBySupplier[p.supplier] || 0) + Number(order.quantity || 0);
              // Use engine's generic tiers for now
              let tierDisc = 0;
              const tiers = (GAME_CONSTANTS as any).VOLUME_DISCOUNTS || [];
              for (const t of tiers) {
                if (runningTotal >= t.min && runningTotal <= t.max) { tierDisc = Number(t.discount || 0); break; }
              }
              const extraSSD = singleSupplierDeal === p.supplier ? 0.02 : 0;
              const effDiscount = tierDisc + extraSSD;
              const effectiveUnitPrice = baseUnit * (1 - effDiscount);
              // annotate order lines for UI/logging
              (order as any).effectiveUnitPrice = effectiveUnitPrice;
              (order as any).effectiveLineTotal = effectiveUnitPrice * Number(order.quantity || 0);
              pendingAddBySupplier[p.supplier] = (pendingAddBySupplier[p.supplier] || 0) + Number(order.quantity || 0);

              if (p.type === 'fvc') {
                contracts.push({
                  ...contractBase,
                  type: 'FVC',
                  units: order.quantity,
                  weekSigned: currentWeek,
                });
              } else if (p.type === 'gmc') {
                // GMC: commitment lives on a contract, orders recorded per week
                let contract = contracts.find((c: any) => c.type === 'GMC' && c.supplier === p.supplier && c.material === order.material);
                if (!contract) {
                  contract = { ...contractBase, type: 'GMC', units: p.gmcCommitmentUnits || 0, weekSigned: 1, gmcOrders: [] };
                  contracts.push(contract);
                }
                contract.gmcOrders = contract.gmcOrders || [];
                contract.gmcOrders.push({ week: currentWeek, units: order.quantity, unitPrice: effectiveUnitPrice });
                // Ensure the stored gmcCommitments also reflect the explicit commitment value per supplier
                if (p.gmcCommitmentUnits) {
                  gmcCommitments[p.supplier] = p.gmcCommitmentUnits;
                }
              } else if (p.type === 'spot') {
                contracts.push({
                  ...contractBase,
                  type: 'SPT',
                  units: order.quantity,
                  weekSigned: currentWeek,
                });
              }
            }
          }
          if (updates.gmcCommitments && typeof updates.gmcCommitments === 'object') {
            Object.assign(gmcCommitments, updates.gmcCommitments);
          }
          // Merge purchases into existing state (do not drop previous orders for this week)
          const mergedPurchases = [
            ...((weeklyState as any).materialPurchases || []),
            ...purchases,
          ];
          weeklyState = await storage.updateWeeklyState(weeklyState.id, {
            procurementContracts: { contracts, gmcCommitments, singleSupplierDeal },
            materialPurchases: mergedPurchases,
          } as any);
        } 
        // Process production schedule if it exists in updates
        else if (updates.productionSchedule) {
          const processedUpdates = GameEngine.processProductionSchedule(weeklyState, updates);
          weeklyState = await storage.updateWeeklyState(weeklyState.id, processedUpdates);
        } 
        else {
          // Update existing state
          weeklyState = await storage.updateWeeklyState(weeklyState.id, updates);
        }
      }
      
      res.json(weeklyState);
    } catch (error) {
      console.error("Error updating weekly state:", error);
      res.status(500).json({ message: "Failed to update weekly state" });
    }
  });

  app.post('/api/game/:gameId/week/:weekNumber/validate', isAuthenticated, async (req: any, res) => {
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
      
      // Update validation results in the state
      await storage.updateWeeklyState(weeklyState.id, {
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
      });
      
      res.json(validation);
    } catch (error) {
      console.error("Error validating weekly state:", error);
      res.status(500).json({ message: "Failed to validate weekly state" });
    }
  });

  app.post('/api/game/:gameId/week/:weekNumber/commit', isAuthenticated, async (req: any, res) => {
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
      
      // Validate before committing
      const validation = GameEngine.validateWeeklyDecisions(week, weeklyState, gameSession);
      if (!validation.canCommit) {
        return res.status(400).json({ 
          message: "Cannot commit week due to validation errors",
          errors: validation.errors 
        });
      }
      
      // Commit the week via engine (full simulation); persist result
      const computed = GameEngine.commitWeek(weeklyState as any);
      const committedState = await storage.updateWeeklyState(weeklyState.id, computed as any);
      await storage.commitWeeklyState(weeklyState.id);
      
      // If this is week 15, mark game as completed
      if (week === 15) {
        const allStates = await storage.getAllWeeklyStates(gameId);
        const serviceLevel = GameEngine.calculateServiceLevel(allStates);

        const totalRevenue = allStates.reduce((sum, state) => sum + Number(state.weeklyRevenue), 0);
        const totalOperationalCosts = allStates.reduce((sum, state) => 
          sum + Number(state.materialCosts) + Number(state.productionCosts) + 
          Number(state.logisticsCosts) + Number(state.holdingCosts), 0);
        const totalInterest = allStates.reduce((sum, state) => sum + Number(state.interestAccrued || 0), 0);
        const totalMarketing = allStates.reduce((sum, state) => sum + Number((state as any).marketingPlan?.totalSpend ?? state.marketingSpend ?? 0), 0);
        const totalCosts = totalOperationalCosts + totalMarketing + totalInterest;
        const economicProfit = GameEngine.calculateEconomicProfit(totalRevenue, totalCosts, GAME_CONSTANTS.STARTING_CAPITAL);

        // Dead stock penalty: value of remaining finished goods at unit cost basis
        const finalState = committedState as any;
        const deadStockPenalty = (finalState.finishedGoods?.lots || []).reduce((s: number, l: any) => s + Number(l.quantity || 0) * Number(l.unitCostBasis || 0), 0);
        const finalScore = economicProfit - deadStockPenalty;

        await storage.updateGameSession(gameId, {
          isCompleted: true,
          finalServiceLevel: serviceLevel.toString(),
          finalCash: committedState.cashOnHand,
          finalEconomicProfit: economicProfit.toString(),
          finalScore: finalScore.toString(),
        });
      }
      
      // Create next week's skeleton from committed state if not final week
      if (week < 15) {
        const nextWeekState: any = {
          ...computed,
          id: undefined,
          weekNumber: week + 1,
          phase: GameEngine.getPhaseForWeek(week + 1),
          isCommitted: false,
          validationErrors: [],
          validationWarnings: [],
        };
        await storage.createWeeklyState(nextWeekState);
      }
      
      res.json(committedState);
    } catch (error) {
      console.error("Error committing weekly state:", error);
      res.status(500).json({ message: "Failed to commit weekly state" });
    }
  });

  // Game data endpoints
  app.get('/api/game/constants', async (req, res) => {
    res.json(GAME_CONSTANTS);
  });

  app.post('/api/game/calculate-demand', async (req, res) => {
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

  app.post('/api/game/calculate-unit-cost', async (req, res) => {
    try {
      const { product, materialChoice, hasPrint } = req.body;
      
      const cost = GameEngine.calculateProjectedUnitCost(product, materialChoice, hasPrint);
      
      res.json({ cost });
    } catch (error) {
      console.error("Error calculating unit cost:", error);
      res.status(500).json({ message: "Failed to calculate unit cost" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
