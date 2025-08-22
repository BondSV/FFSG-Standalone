import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { ordersLog as ordersLogTable, cashLedger as cashLedgerTable } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";
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

  // Inventory overview (read-only aggregate)
  app.get('/api/game/:gameId/inventory/overview', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const weeklyState = await storage.getLatestWeeklyState(gameId);
      if (!weeklyState) return res.status(404).json({ message: 'No state' });

      const currentWeek = Number((weeklyState as any).weekNumber || 1);
      const rawMaterials = (weeklyState as any).rawMaterials || {};
      const workInProcess = ((weeklyState as any).workInProcess || {}).batches || [];
      const shipmentsInTransit = (weeklyState as any).shipmentsInTransit || [];
      const finishedGoods = ((weeklyState as any).finishedGoods || {}).lots || [];
      const materialPurchases = (weeklyState as any).materialPurchases || [];
      const procurementContracts = ((weeklyState as any).procurementContracts || {}).contracts || [];
      const productData = (weeklyState as any).productData || {};

      // RM arrivals timeline from purchases
      const inTransitByWeek: Record<string, Record<number, number>> = {};
      const addArrival = (material: string, arrivalWeek: number, qty: number) => {
        if (!material || !Number.isFinite(arrivalWeek) || !Number.isFinite(qty)) return;
        inTransitByWeek[material] = inTransitByWeek[material] || {};
        inTransitByWeek[material][arrivalWeek] = (inTransitByWeek[material][arrivalWeek] || 0) + qty;
      };
      // From procurement contracts (planned arrivals, canonical)
      for (const c of procurementContracts) {
        const supplier = String(c.supplier || '');
        const lead = Number((GAME_CONSTANTS.SUPPLIERS as any)?.[supplier]?.leadTime || 0);
        const material = String(c.material || 'unknown');
        if (c.type === 'SPT') {
          const week = Number(c.weekSigned || 0) + lead;
          const qty = Number(c.units || 0);
          if (week > currentWeek) addArrival(material, week, qty);
        } else if (c.type === 'GMC') {
          const orders = (c as any).gmcOrders || [];
          for (const o of orders) {
            const week = Number(o.week || 0) + lead;
            const qty = Number(o.units || 0);
            if (week > currentWeek) addArrival(material, week, qty);
          }
        }
      }

      // FG available timeline: current lots + shipments arrival weeks
      const availableForSaleByWeek: Array<{ week: number; products: Record<string, number>; total: number }> = [];
      for (let w = currentWeek; w <= 15; w++) {
        const products: Record<string, number> = {};
        let total = 0;
        if (w === currentWeek) {
          for (const lot of finishedGoods) {
            const qty = Number(lot.quantity || 0);
            products[lot.product] = (products[lot.product] || 0) + qty;
            total += qty;
          }
        }
        for (const sh of shipmentsInTransit) {
          if (Number(sh.arrivalWeek) === w) {
            const qty = Number(sh.quantity || 0);
            products[sh.product] = (products[sh.product] || 0) + qty;
            total += qty;
          }
        }
        availableForSaleByWeek.push({ week: w, products, total });
      }

      const fgThisWeek: Record<string, number> = {};
      for (const lot of finishedGoods) {
        const qty = Number(lot.quantity || 0);
        fgThisWeek[lot.product] = (fgThisWeek[lot.product] || 0) + qty;
      }
      const nextWeekEntry = availableForSaleByWeek.find(e => e.week === currentWeek + 1) || { products: {} } as any;

      const summary = {
        rawMaterialsOnHand: Object.values(rawMaterials).reduce((s: number, v: any) => s + Number(v.onHand || 0), 0),
        wipUnits: (workInProcess as any[]).reduce((s, b: any) => s + Number(b.quantity || 0), 0),
        finishedGoodsAvailableThisWeek: fgThisWeek,
        finishedGoodsAvailableNextWeek: nextWeekEntry.products || {},
        totalFinishedGoodsAvailableThisWeek: Object.values(fgThisWeek).reduce((s: number, v: any) => s + Number(v || 0), 0),
        totalFinishedGoodsAvailableNextWeek: Object.values(nextWeekEntry.products || {}).reduce((s: number, v: any) => s + Number(v || 0), 0),
      };

      const materialKeys = new Set<string>([...Object.keys(rawMaterials), ...Object.keys(inTransitByWeek)]);
      const rmList = Array.from(materialKeys).map((material: string) => {
        const v: any = (rawMaterials as any)[material] || {};
        return {
          material,
          onHand: Number(v.onHand || 0),
          allocated: Number(v.allocated || 0),
          onHandValue: Number(v.onHandValue || 0),
          avgUnitCost: Number(v.onHand || 0) > 0 ? Number(v.onHandValue || 0) / Number(v.onHand || 1) : undefined,
          inTransitByWeek: Object.entries(inTransitByWeek[material] || {}).map(([week, quantity]) => ({ week: Number(week), quantity: Number(quantity) })),
        };
      });

      const wipList = (workInProcess as any[]).map((b: any) => ({
        id: String(b.id || ''),
        product: String(b.product || ''),
        startWeek: Number(b.startWeek || 0),
        endWeek: Number(b.endWeek || 0),
        quantity: Number(b.quantity || 0),
        unitMaterialCost: Number(b.unitMaterialCost || 0),
        unitProductionCost: Number(b.unitProductionCost || 0),
        unitShippingCost: Number(b.unitShippingCost || 0),
        unitCostBasis: Number(b.unitMaterialCost || 0) + Number(b.unitProductionCost || 0) + Number(b.unitShippingCost || 0),
      }));

      const fgLots = (finishedGoods as any[]).map((l: any) => ({
        id: String(l.id || ''),
        product: String(l.product || ''),
        quantity: Number(l.quantity || 0),
        availableWeek: currentWeek, // existing lots are available now
        unitCostBasis: Number(l.unitCostBasis || (Number(l.unitMaterialCost || 0) + Number(l.unitProductionCost || 0) + Number(l.unitShippingCost || 0))),
      }));

      const shipments = (shipmentsInTransit as any[]).map((s: any) => ({
        id: String(s.id || ''),
        product: String(s.product || ''),
        quantity: Number(s.quantity || 0),
        arrivalWeek: Number(s.arrivalWeek || 0),
      }));

      res.json({ summary, rawMaterials: rmList, wip: wipList, shipmentsInTransit: shipments, finishedGoodsLots: fgLots, availableForSaleByWeek });
    } catch (e) {
      console.error('inventory overview error', e);
      res.status(500).json({ message: 'Failed to build inventory overview' });
    }
  });

  // Production preview (read-only)
  app.post('/api/game/:gameId/production/preview', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const { product, method, startWeek, batches } = req.body || {};
      const weeklyState = await storage.getLatestWeeklyState(gameId);
      if (!weeklyState) return res.status(404).json({ message: 'No state' });
      const units = Number(batches || 0) * GAME_CONSTANTS.BATCH_SIZE;
      const mfg = (GAME_CONSTANTS.MANUFACTURING as any)[product] || {};
      const lead = method === 'inhouse' ? Number(mfg.inHouseTime || 2) : Number(mfg.outsourceTime || 1);
      const completionWeek = Number(startWeek) + lead;
      // Assume standard shipping for preview
      const shipWeeks = Number((GAME_CONSTANTS.SHIPPING as any)[product]?.standard || 2);
      const availableWeek = completionWeek + shipWeeks + 1;

      // Capacity check for inhouse
      let okCapacity = true;
      const capacityDetail: Array<{ week: number; used: number; capacity: number }> = [];
      const schedule = (weeklyState as any).productionSchedule?.batches || [];
      if (method === 'inhouse') {
        const perWeekUnits = Math.ceil(units / lead);
        for (let w = Number(startWeek); w < Number(startWeek) + lead; w++) {
          const capacity = Number(GAME_CONSTANTS.CAPACITY_SCHEDULE[w - 1] || 0);
          const used = schedule.filter((b: any) => b.method === 'inhouse' && w >= Number(b.startWeek) && w < Number(b.startWeek) + (b.method === 'inhouse' ? Number((GAME_CONSTANTS.MANUFACTURING as any)[b.product]?.inHouseTime || 2) : Number((GAME_CONSTANTS.MANUFACTURING as any)[b.product]?.outsourceTime || 1))).reduce((s: number, b: any) => s + Math.ceil(Number(b.quantity || 0) / (b.method === 'inhouse' ? Number((GAME_CONSTANTS.MANUFACTURING as any)[b.product]?.inHouseTime || 2) : Number((GAME_CONSTANTS.MANUFACTURING as any)[b.product]?.outsourceTime || 1))), 0);
          const newUsed = used + perWeekUnits;
          capacityDetail.push({ week: w, used: newUsed, capacity });
          if (newUsed > capacity) okCapacity = false;
        }
      }

      // Materials check (coarse): shipmentWeek <= startWeek for required fabric
      const productFabric = (weeklyState as any).productData?.[product]?.fabric;
      let okMaterials = true;
      let projectedOnHandAtStart = 0;
      let allocatedAtStart = 0;
      let inboundByStart = 0;
      const materialPurchases = (weeklyState as any).materialPurchases || [];
      inboundByStart = materialPurchases.filter((p: any) => Number(p.shipmentWeek || 0) <= Number(startWeek)).reduce((s: number, p: any) => s + (p.orders || []).filter((o: any) => o.material === productFabric).reduce((ss: number, o: any) => ss + Number(o.quantity || 0), 0), 0);
      const rmEntry = (weeklyState as any).rawMaterials?.[productFabric] || { onHand: 0, allocated: 0 };
      projectedOnHandAtStart = Number(rmEntry.onHand || 0) + inboundByStart;
      allocatedAtStart = Number(rmEntry.allocated || 0);
      okMaterials = projectedOnHandAtStart - allocatedAtStart >= units;

      const unitProductionCost = method === 'inhouse' ? Number(mfg.inHouseCost || 10) : Number(mfg.outsourceCost || 15);
      const projectedCost = { unitProductionCost, totalProductionCost: units * unitProductionCost };
      const materialsDetail = { material: productFabric, projectedOnHandAtStart, allocatedAtStart, inTransitArrivingByStart: inboundByStart, needed: units };

      res.json({ completionWeek, availableWeek, okCapacity, capacityDetail, okMaterials, materialsDetail, projectedCost });
    } catch (e) {
      console.error('production preview error', e);
      res.status(500).json({ message: 'Failed to preview production' });
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
          // We will append GMC/SPT entries under procurementContracts and ignore immediate cash effects.
          const existing = (weeklyState as any).procurementContracts || { contracts: [] };
          const contracts = existing.contracts || [];
          const gmcCommitments = { ...(existing as any).gmcCommitments };
          const singleSupplierDeal = (updates.procurementContracts && updates.procurementContracts.singleSupplierDeal) || (existing as any).singleSupplierDeal;
          const currentWeek = Number(weeklyState.weekNumber);
          const purchases = (updates.materialPurchases as any[]) || [];

          // Only run deletion/diff logic when purchases are explicitly provided in the update payload
          if (Array.isArray(updates.materialPurchases)) {
            const existingPurchasesList: any[] = ((weeklyState as any).materialPurchases || []);
            const existingTimestamps = new Set(existingPurchasesList.map((p: any) => p.timestamp).filter(Boolean));
            const nextTimestamps = new Set(purchases.map((p: any) => p.timestamp).filter(Boolean));
            const removedTimestamps: string[] = Array.from(existingTimestamps).filter(ts => !nextTimestamps.has(ts)) as string[];

            if (removedTimestamps.length > 0) {
              // Remove GMC order lines and SPT contracts derived from these timestamps
              for (const c of contracts) {
                if ((c as any).type === 'GMC') {
                  const prev = (c as any).gmcOrders || [];
                  (c as any).gmcOrders = prev.filter((o: any) => !removedTimestamps.some(ts => String(o.orderId || '').startsWith(ts)));
                }
              }
              // Remove SPT contracts that originated from removed timestamps (id starts with timestamp)
              const remainingContracts: any[] = [];
              for (const c of contracts) {
                if ((c as any).type === 'SPT' && removedTimestamps.some(ts => String((c as any).id || '').startsWith(ts))) {
                  // skip -> removed
                  continue;
                }
                remainingContracts.push(c);
              }
              while (contracts.length) contracts.pop();
              for (const rc of remainingContracts) contracts.push(rc);
              // Soft-delete Orders Log rows for these timestamps
              try {
                await db
                  .update(ordersLogTable)
                  .set({ removedAt: new Date() } as any)
                  .where(and(eq(ordersLogTable.gameSessionId, (weeklyState as any).gameSessionId), inArray(ordersLogTable.orderTimestamp, removedTimestamps)));
              } catch {}
            }
          }

          // Helper: compute per-supplier tier discount from constants
          const getTierDiscount = (supplier: keyof typeof GAME_CONSTANTS.SUPPLIERS, units: number) => {
            const tiers: any[] = ((GAME_CONSTANTS as any).VOLUME_DISCOUNTS || {})[supplier] || [];
            for (const t of tiers) {
              if (units >= Number(t.min) && units <= Number(t.max)) return Number(t.discount || 0);
            }
            return 0;
          };

          // Existing orderIds to avoid duplicates when re-saving same purchases
          const existingOrderIds = new Set<string>();
          for (const c of contracts) {
            if ((c as any).type === 'GMC') {
              for (const o of ((c as any).gmcOrders || [])) {
                if (o?.orderId) existingOrderIds.add(String(o.orderId));
              }
            }
            // Also include SPT contract ids
            if ((c as any).type === 'SPT' && (c as any).id) existingOrderIds.add(String((c as any).id));
          }
          for (const p of purchases) {
            // One contract per material
            for (const order of (p.orders || [])) {
              // Pull base and surcharge from constants to keep source of truth in engine
              const sup = GAME_CONSTANTS.SUPPLIERS as any;
              const base = sup[p.supplier]?.materials?.[order.material]?.price || 0;
              const surchargeCatalog = sup[p.supplier]?.materials?.[order.material]?.printSurcharge || 0;
              const applyPrint = Boolean(p.printOptions?.[order.material]);

              const contractBase: any = {
                id: `${p.timestamp}-${p.supplier}-${order.material}`,
                supplier: p.supplier,
                material: order.material,
                unitBasePrice: base,
                printSurcharge: applyPrint ? surchargeCatalog : 0,
              };

              // Identify if this order has already been converted to canonical records
              const orderId = `${p.timestamp}-${p.supplier}-${order.material}`;
              const isExisting = existingOrderIds.has(orderId);

              if (isExisting) {
                // Do not recompute or re-annotate existing orders; keep their original locked values
                continue;
              }

              // Compute effective discounted unit price at order time based on rules (only for new orders)
              const baseUnit = base + (applyPrint ? surchargeCatalog : 0);
              const extraSSD = singleSupplierDeal === p.supplier ? 0.02 : 0;

              let tierDisc = 0;
              if (p.type === 'spot') {
                const basketTotal = (p.orders || []).reduce((s: number, o: any) => s + Number(o.quantity || 0), 0);
                tierDisc = getTierDiscount(p.supplier, basketTotal);
              } else if (p.type === 'gmc') {
                const committed = Number((updates.gmcCommitments && updates.gmcCommitments[p.supplier]) ?? gmcCommitments[p.supplier] ?? 0);
                tierDisc = getTierDiscount(p.supplier, committed);
              } else if (p.type === 'fvc') {
                const committed = Number(gmcCommitments[p.supplier] || 0);
                tierDisc = getTierDiscount(p.supplier, committed);
              }
              const effDiscount = tierDisc + extraSSD;
              const effectiveUnitPrice = baseUnit * (1 - effDiscount);

              // annotate and create canonical records for new orders only
              (order as any).orderId = orderId;
              (order as any).effectiveUnitPrice = effectiveUnitPrice;
              (order as any).effectiveLineTotal = effectiveUnitPrice * Number(order.quantity || 0);

              if (p.type === 'gmc') {
                let contract = contracts.find((c: any) => c.type === 'GMC' && c.supplier === p.supplier && c.material === order.material);
                if (!contract) {
                  contract = { ...contractBase, type: 'GMC', units: p.gmcCommitmentUnits || 0, weekSigned: 1, gmcOrders: [] };
                  contracts.push(contract);
                }
                contract.gmcOrders = contract.gmcOrders || [];
                contract.gmcOrders.push({ orderId, week: currentWeek, units: order.quantity, unitPrice: effectiveUnitPrice });
                existingOrderIds.add(orderId);
                if (p.gmcCommitmentUnits) {
                  gmcCommitments[p.supplier] = p.gmcCommitmentUnits;
                }
              } else if (p.type === 'spot') {
                contracts.push({
                  ...contractBase,
                  type: 'SPT',
                  units: order.quantity,
                  weekSigned: currentWeek,
                  lockedUnitPrice: effectiveUnitPrice,
                });
                existingOrderIds.add(orderId);
              }

              // Insert immutable Orders Log row in DB
              try {
                await db.insert(ordersLogTable).values({
                  id: orderId,
                  gameSessionId: (weeklyState as any).gameSessionId,
                  weekNumber: currentWeek,
                  orderTimestamp: String(p.timestamp || ''),
                  supplier: String(p.supplier),
                  orderType: String(p.type).toUpperCase(),
                  material: String(order.material),
                  quantity: Number(order.quantity || 0),
                  effectiveUnitPrice: Number(order.effectiveUnitPrice || 0) as any,
                  effectiveLineTotal: Number(order.effectiveLineTotal || 0) as any,
                } as any);
              } catch {}
            }
          }
          if (updates.gmcCommitments && typeof updates.gmcCommitments === 'object') {
            Object.assign(gmcCommitments, updates.gmcCommitments);
          }
          // Only replace purchases if an explicit list was provided; otherwise, keep existing
          let mergedPurchases: any[];
          if (Array.isArray(updates.materialPurchases)) {
            mergedPurchases = Array.from(
              new Map((purchases || []).filter((x: any) => !!x?.timestamp).map((x: any) => [x.timestamp, x])).values()
            );
          } else {
            mergedPurchases = (weeklyState as any).materialPurchases || [];
          }
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
        else if (updates.plannedMarketingPlan || updates.plannedWeeklyDiscounts || typeof updates.plannedLocked !== 'undefined') {
          // Update planning-only fields without touching purchases
          weeklyState = await storage.updateWeeklyState(weeklyState.id, {
            plannedMarketingPlan: updates.plannedMarketingPlan ?? (weeklyState as any).plannedMarketingPlan,
            plannedWeeklyDiscounts: updates.plannedWeeklyDiscounts ?? (weeklyState as any).plannedWeeklyDiscounts,
            plannedLocked: updates.plannedLocked,
          } as any);
        } else {
          // Generic fall-through update
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
      const computed = await GameEngine.commitWeek(weeklyState as any);
      // Preserve Orders Log (materialPurchases) in the committed week
      (computed as any).materialPurchases = (weeklyState as any).materialPurchases || [];
      const { ledgerEntries, createdAt: _ca, updatedAt: _ua, ...toPersist } = (computed as any);
      // Coerce numeric types expected by DB
      // Persist A/I as decimals, not integers
      (toPersist as any).awareness = Number((toPersist as any).awareness ?? 0).toFixed(2);
      (toPersist as any).intent = Number((toPersist as any).intent ?? 0).toFixed(2);
      const committedState = await storage.updateWeeklyState(weeklyState.id, toPersist as any);
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
        const { createdAt: _c2, updatedAt: _u2, ledgerEntries: _l2, ...rest } = (computed as any);
        const nextWeekState: any = {
          ...rest,
          id: undefined,
          weekNumber: week + 1,
          phase: GameEngine.getPhaseForWeek(week + 1),
          isCommitted: false,
          validationErrors: [],
          validationWarnings: [],
        };
        // New week starts with empty UI Orders Log; historical Orders Log remains on committed weeks
        nextWeekState.materialPurchases = [];
        // Carry forward canonical procurement contracts (so arrivals timeline persists)
        nextWeekState.procurementContracts = (computed as any).procurementContracts ?? (weeklyState as any).procurementContracts ?? { contracts: [], gmcCommitments: {}, singleSupplierDeal: (weeklyState as any)?.procurementContracts?.singleSupplierDeal };
        // Apply planned marketing and discounts into next week's live plan
        if ((computed as any).plannedMarketingPlan) {
          nextWeekState.marketingPlan = (computed as any).plannedMarketingPlan;
        }
        if ((computed as any).plannedWeeklyDiscounts) {
          nextWeekState.weeklyDiscounts = (computed as any).plannedWeeklyDiscounts;
        }
        // Preserve plans for subsequent programming and unlock planning for the new week
        nextWeekState.plannedMarketingPlan = (computed as any).plannedMarketingPlan;
        nextWeekState.plannedWeeklyDiscounts = (computed as any).plannedWeeklyDiscounts;
        nextWeekState.plannedLocked = false;

        // Apply start-of-week N+1 A/I
        if ((computed as any).nextWeekAwareness !== undefined) {
          nextWeekState.awareness = (computed as any).nextWeekAwareness;
        }
        if ((computed as any).nextWeekIntent !== undefined) {
          nextWeekState.intent = (computed as any).nextWeekIntent;
        }

        // Persist next-week demand/sales/revenue metrics computed by the engine
        if ((computed as any).nextWeekMetrics) {
          const nx: any = (computed as any).nextWeekMetrics;
          if (nx.weeklyDemand) nextWeekState.weeklyDemand = nx.weeklyDemand;
          if (nx.weeklySales) nextWeekState.weeklySales = nx.weeklySales;
          if (nx.lostSales) nextWeekState.lostSales = nx.lostSales;
          if (nx.weeklyRevenue != null) nextWeekState.weeklyRevenue = `${Number(nx.weeklyRevenue || 0).toFixed(2)}`;
        }

        // Apply staged N+1 arrivals and outflows into the new state's opening snapshot
        const arrivals: Array<{ material: string; goodUnits: number; unitPrice: number }> = (computed as any).nextWeekArrivals || [];
        nextWeekState.rawMaterials = nextWeekState.rawMaterials || {};
        for (const a of arrivals) {
          const mat = String(a.material || 'unknown');
          const entry: any = nextWeekState.rawMaterials[mat] || { onHand: 0, allocated: 0, inTransit: [] };
          entry.onHand = Number(entry.onHand || 0) + Number(a.goodUnits || 0);
          entry.onHandValue = Number(entry.onHandValue || 0) + Number(a.goodUnits || 0) * Number(a.unitPrice || 0);
          nextWeekState.rawMaterials[mat] = entry;
        }

        // Apply cash waterfall for N+1 outflows at start of week (interest + ops)
        const out = (computed as any).nextWeekOutflows || {};
        let cashOnHandN1 = Number(nextWeekState.cashOnHand || 0);
        let creditUsedN1 = Number(nextWeekState.creditUsed || 0);
        const costInterest = Number(out.interest || 0);
        if (costInterest > 0) {
          if (cashOnHandN1 >= costInterest) cashOnHandN1 -= costInterest; else { creditUsedN1 += (costInterest - cashOnHandN1); cashOnHandN1 = 0; }
        }
        const ops = Number(out.marketing || 0) + Number(out.materials_spt || 0) + Number(out.materials_gmc || 0) + Number(out.holding || 0);
        if (ops > 0) {
          if (cashOnHandN1 >= ops) cashOnHandN1 -= ops; else { creditUsedN1 += (ops - cashOnHandN1); cashOnHandN1 = 0; }
        }
        nextWeekState.cashOnHand = cashOnHandN1.toFixed(2);
        nextWeekState.creditUsed = Math.min(GAME_CONSTANTS.CREDIT_LIMIT, creditUsedN1).toFixed(2);


        await storage.createWeeklyState(nextWeekState);
      }
      
      // Cash ledger entries are written directly by gameEngine
      
      res.json(committedState);
    } catch (error) {
      console.error("Error committing weekly state:", error);
      res.status(500).json({ message: "Failed to commit weekly state" });
    }
  });

  // Helper: preview due payments for a specific week (no mutation)
  app.get('/api/game/:gameId/week/:weekNumber/due-payments', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId, weekNumber } = req.params;
      const week = parseInt(weekNumber);
      const weeklyState = await storage.getWeeklyState(gameId, week);
      if (!weeklyState) return res.status(404).json({ message: 'Weekly state not found' });

      // Clone state and simulate only the payment schedule parts without sales
      const state: any = JSON.parse(JSON.stringify(weeklyState));
      const contracts = (state.procurementContracts?.contracts || []) as any[];
      const result: Array<{ type: string; amount: number; refId?: string }> = [];

      // Marketing spend due this week
      const marketingDue = Number(state.marketingPlan?.totalSpend ?? state.marketingSpend ?? 0);
      if (marketingDue > 0) result.push({ type: 'marketing', amount: marketingDue });

      // Procurement instalments
      for (const c of contracts) {
        const unitPrice = ((): number => {
          if (c.lockedUnitPrice != null) return Number(c.lockedUnitPrice);
          const base = Number(c.unitBasePrice || 0);
          const surcharge = Number(c.printSurcharge || 0);
          const disc = Number(c.discountPercentApplied || 0);
          return (base + surcharge) * (1 - disc);
        })();
        if (c.type === 'FVC') {
          const contractValue = unitPrice * Number(c.units || 0);
          if (week === Number(c.weekSigned)) result.push({ type: 'materials_fvc_deposit', amount: contractValue * 0.30, refId: `${c.supplier}:${c.material}` });
          if (week === Number(c.weekSigned) + 8) result.push({ type: 'materials_fvc_balance', amount: contractValue * 0.70, refId: `${c.supplier}:${c.material}` });
        } else if (c.type === 'SPT') {
          for (const d of (c.deliveries || [])) {
            if (Number(d.week) === week) {
              const goodUnits = Number((d as any).goodUnits ?? d.units);
              const u = Number(d.unitPrice ?? unitPrice);
              result.push({ type: 'materials_spt', amount: goodUnits * u, refId: `${c.supplier}:${c.material}` });
            }
          }
        } else if (c.type === 'GMC') {
          for (const d of (c.deliveries || [])) {
            if (Number(d.week) + 2 === week) {
              const goodUnits = Number((d as any).goodUnits ?? d.units);
              const u = Number(d.unitPrice ?? unitPrice);
              result.push({ type: 'materials_gmc', amount: goodUnits * u, refId: `${c.supplier}:${c.material}` });
            }
          }
        }
      }

      // Production/logistics due on schedule start this week
      const batches = (state.productionSchedule?.batches || []) as any[];
      for (const b of batches) {
        if (Number(b.startWeek) === week) {
          const product = String(b.product || '');
          const method = String(b.method || 'inhouse');
          const units = Number(b.quantity || 0);
          const mfg = (GAME_CONSTANTS.MANUFACTURING as any)[product] || {};
          const unitProd = method === 'inhouse' ? Number(mfg.inHouseCost || 0) : Number(mfg.outsourceCost || 0);
          result.push({ type: 'production', amount: units * unitProd, refId: product });
          const shipUnit = 0; // shipping cost is already captured at schedule time by engine; unknown per-product config here
          if (shipUnit > 0) result.push({ type: 'logistics', amount: units * shipUnit, refId: product });
        }
      }

      res.json({ week, due: result });
    } catch (error) {
      console.error('Error computing due payments:', error);
      res.status(500).json({ message: 'Failed to compute due payments' });
    }
  });

  // Ledger rollup (returns raw rows; client will compute sums per type)
  app.get('/api/game/:gameId/ledger/rollup', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const rows = await db.select().from(cashLedgerTable).where(eq(cashLedgerTable.gameSessionId, gameId as any));
      res.json({ rows });
    } catch (error) {
      console.error('Error fetching ledger rollup:', error);
      res.status(500).json({ rows: [] });
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

  // Preview next week's A/I and demand using current planned marketing/discounts
  app.get('/api/game/:gameId/week/:weekNumber/marketing-preview', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId, weekNumber } = req.params;
      const week = parseInt(weekNumber);
      const weeklyState = await storage.getWeeklyState(gameId, week);
      if (!weeklyState) return res.status(404).json({ message: 'Weekly state not found' });
      const result = GameEngine.previewNextWeekMarketing(weeklyState as any);
      res.json(result);
    } catch (error) {
      console.error('Error generating marketing preview:', error);
      res.status(500).json({ message: 'Failed to generate marketing preview' });
    }
  });

  app.post('/api/game/:gameId/week/:weekNumber/marketing-preview', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId, weekNumber } = req.params;
      const week = parseInt(weekNumber);
      const weeklyState = await storage.getWeeklyState(gameId, week);
      if (!weeklyState) return res.status(404).json({ message: 'Weekly state not found' });
      const plan = req.body?.plan || req.body?.plannedMarketingPlan || undefined;
      const discounts = req.body?.discounts || req.body?.plannedWeeklyDiscounts || undefined;
      const result = GameEngine.previewNextWeekMarketing(weeklyState as any, plan, discounts);
      res.json(result);
    } catch (error) {
      console.error('Error generating marketing preview (POST):', error);
      res.status(500).json({ message: 'Failed to generate marketing preview' });
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
