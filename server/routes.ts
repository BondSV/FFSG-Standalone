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
      
      if (!gameSession) {
        return res.status(404).json({ message: "No active game session" });
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
        if (updates.materialPurchases) {
          const processedUpdates = GameEngine.processMaterialPurchases(weeklyState, updates);
          weeklyState = await storage.updateWeeklyState(weeklyState.id, processedUpdates);
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
      
      // Commit the week
      const committedState = await storage.commitWeeklyState(weeklyState.id);
      
      // If this is week 15, mark game as completed
      if (week === 15) {
        const allStates = await storage.getAllWeeklyStates(gameId);
        const serviceLevel = GameEngine.calculateServiceLevel(allStates);
        
        // Calculate final metrics (simplified)
        const totalRevenue = allStates.reduce((sum, state) => sum + Number(state.weeklyRevenue), 0);
        const totalCosts = allStates.reduce((sum, state) => 
          sum + Number(state.materialCosts) + Number(state.productionCosts) + 
          Number(state.logisticsCosts) + Number(state.holdingCosts), 0);
        
        const economicProfit = GameEngine.calculateEconomicProfit(totalRevenue, totalCosts, GAME_CONSTANTS.STARTING_CAPITAL);
        
        await storage.updateGameSession(gameId, {
          isCompleted: true,
          finalServiceLevel: serviceLevel.toString(),
          finalCash: committedState.cashOnHand,
          finalEconomicProfit: economicProfit.toString(),
        });
      }
      
      // Create next week's state if not final week
      if (week < 15) {
        const nextWeekState = {
          ...weeklyState,
          id: undefined,
          weekNumber: week + 1,
          phase: GameEngine.getPhaseForWeek(week + 1),
          isCommitted: false,
          validationErrors: [],
          validationWarnings: [],
        };
        
        await storage.createWeeklyState(nextWeekState as any);
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
