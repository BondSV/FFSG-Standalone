import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  integer,
  decimal,
  boolean,
  text,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Game sessions table
export const gameSessions = pgTable("game_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  isCompleted: boolean("is_completed").default(false),
  finalScore: decimal("final_score", { precision: 15, scale: 2 }),
  finalCash: decimal("final_cash", { precision: 15, scale: 2 }),
  finalServiceLevel: decimal("final_service_level", { precision: 5, scale: 2 }),
  finalEconomicProfit: decimal("final_economic_profit", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Weekly game state table
export const weeklyStates = pgTable("weekly_states", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameSessionId: varchar("game_session_id").notNull().references(() => gameSessions.id),
  weekNumber: integer("week_number").notNull(),
  phase: varchar("phase").notNull(), // 'strategy', 'development', 'sales', 'runout'
  cashOnHand: decimal("cash_on_hand", { precision: 15, scale: 2 }).notNull(),
  creditUsed: decimal("credit_used", { precision: 15, scale: 2 }).default('0'),
  interestAccrued: decimal("interest_accrued", { precision: 15, scale: 2 }).default('0'),
  
  // Product decisions
  productData: jsonb("product_data").notNull(), // Stores RRP, fabric choices, etc.
  
  // Inventory levels
  rawMaterials: jsonb("raw_materials").notNull(),
  workInProcess: jsonb("work_in_process").notNull(),
  finishedGoods: jsonb("finished_goods").notNull(),
  
  // Production and procurement
  productionSchedule: jsonb("production_schedule").notNull(),
  procurementContracts: jsonb("procurement_contracts").notNull(),
  materialPurchases: jsonb("material_purchases").default('[]'),
  materialInventory: jsonb("material_inventory").default('{}'),
  
  // Marketing and sales
  marketingSpend: decimal("marketing_spend", { precision: 10, scale: 2 }).default('0'),
  weeklyDiscounts: jsonb("weekly_discounts").notNull(),
  
  // Performance metrics
  weeklyRevenue: decimal("weekly_revenue", { precision: 15, scale: 2 }).default('0'),
  weeklyDemand: jsonb("weekly_demand").notNull(),
  weeklySales: jsonb("weekly_sales").notNull(),
  lostSales: jsonb("lost_sales").notNull(),
  
  // Costs
  materialCosts: decimal("material_costs", { precision: 15, scale: 2 }).default('0'),
  productionCosts: decimal("production_costs", { precision: 15, scale: 2 }).default('0'),
  logisticsCosts: decimal("logistics_costs", { precision: 15, scale: 2 }).default('0'),
  holdingCosts: decimal("holding_costs", { precision: 15, scale: 2 }).default('0'),
  
  // Validation and errors
  validationErrors: jsonb("validation_errors").notNull(),
  validationWarnings: jsonb("validation_warnings").notNull(),
  
  isCommitted: boolean("is_committed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Orders Log (immutable UI log of placed orders; row removed only via removedAt for current week)
export const ordersLog = pgTable("orders_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameSessionId: varchar("game_session_id").notNull().references(() => gameSessions.id),
  weekNumber: integer("week_number").notNull(),
  orderTimestamp: varchar("order_timestamp").notNull(),
  supplier: varchar("supplier").notNull(),
  orderType: varchar("order_type").notNull(), // 'spot' | 'gmc' | 'fvc'
  material: varchar("material").notNull(),
  quantity: integer("quantity").notNull(),
  effectiveUnitPrice: decimal("effective_unit_price", { precision: 12, scale: 4 }).notNull(),
  effectiveLineTotal: decimal("effective_line_total", { precision: 14, scale: 2 }).notNull(),
  removedAt: timestamp("removed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Cash ledger (optional; phase 2a). Entries appended by server for audit.
export const cashLedger = pgTable("cash_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameSessionId: varchar("game_session_id").notNull().references(() => gameSessions.id),
  weekNumber: integer("week_number").notNull(),
  entryType: varchar("entry_type").notNull(),
  refId: varchar("ref_id"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }),
  creditAfter: decimal("credit_after", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  gameSessions: many(gameSessions),
}));

export const gameSessionsRelations = relations(gameSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [gameSessions.userId],
    references: [users.id],
  }),
  weeklyStates: many(weeklyStates),
}));

export const weeklyStatesRelations = relations(weeklyStates, ({ one }) => ({
  gameSession: one(gameSessions, {
    fields: [weeklyStates.gameSessionId],
    references: [gameSessions.id],
  }),
}));

export type OrdersLog = typeof ordersLog.$inferSelect;
export type CashLedger = typeof cashLedger.$inferSelect;

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGameSessionSchema = createInsertSchema(gameSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWeeklyStateSchema = createInsertSchema(weeklyStates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type GameSession = typeof gameSessions.$inferSelect;
export type WeeklyState = typeof weeklyStates.$inferSelect;
export type InsertGameSession = z.infer<typeof insertGameSessionSchema>;
export type InsertWeeklyState = z.infer<typeof insertWeeklyStateSchema>;

// ----------------------------
// Runtime JSON Shapes (Server)
// ----------------------------
// These TypeScript interfaces describe the structure of the JSON fields stored
// in the weekly state. They are not enforced by the database schema (jsonb),
// but they provide compile-time safety for the game engine and routes.

export type ProductKey = 'jacket' | 'dress' | 'pants';
export type SupplierKey = 'supplier1' | 'supplier2';
export type MaterialKey =
  | 'selvedgeDenim'
  | 'standardDenim'
  | 'egyptianCotton'
  | 'polyesterBlend'
  | 'fineWaleCorduroy'
  | 'wideWaleCorduroy';

export interface ProductDecision {
  rrp: number | null;
  fabric: MaterialKey | null;
  hasPrint: boolean;
  rrpLocked?: boolean;
  confirmedMaterialCost?: number; // after procurement contracts
}

export type ProductDecisions = Record<ProductKey, ProductDecision>;

export interface MaterialsInventoryByKey {
  onHand: number; // units
  allocated: number; // units reserved for production
  inTransit: Array<{ quantity: number; arrivalWeek: number; supplier: SupplierKey; unitCost: number }>;
}

export type RawMaterialsInventory = Partial<Record<MaterialKey, MaterialsInventoryByKey>>;

export interface WorkInProcessBatchSnapshot {
  id: string;
  product: ProductKey;
  method: 'inhouse' | 'outsource';
  startWeek: number;
  endWeek: number; // production completes at endWeek
  quantity: number; // units
  materialUnitCost: number; // confirmed material unit cost used
  productionUnitCost: number; // per unit
}

export interface FinishedGoodsLot {
  id: string;
  product: ProductKey;
  quantity: number; // on-hand units
  unitCostBasis: number; // sum below
  unitMaterialCost: number;
  unitProductionCost: number;
  unitShippingCost: number;
}

export interface ShipmentInTransit {
  id: string;
  product: ProductKey;
  quantity: number;
  unitShippingCost: number;
  unitMaterialCost?: number;
  unitProductionCost?: number;
  arrivalWeek: number; // available at start of next week after this arrival
}

export interface ProductionBatchPlan {
  id: string;
  product: ProductKey;
  quantity: number; // must be multiple of 25,000
  method: 'inhouse' | 'outsource';
  startWeek: number;
  shipping: 'standard' | 'expedited';
}

export interface ProcurementContract {
  id: string;
  type: 'FVC' | 'GMC' | 'SPT';
  supplier: SupplierKey;
  material: MaterialKey;
  units: number; // committed units
  weekSigned: number; // for SPT this is the order week
  unitBasePrice: number; // list price before discounts and surcharges
  printSurcharge: number; // per unit if applicable
  // deprecated: dynamic discounts are no longer recomputed; kept for backward compatibility
  discountPercentApplied?: number;
  // authoritative locked unit price for SPT/FVC
  lockedUnitPrice?: number;
  // planned arrivals, each with a locked unit price
  deliveries?: Array<{ week: number; units: number; unitPrice?: number }>; // planned arrivals
  paidSoFar?: number; // bookkeeping for payment waterfall
  deliveredUnits?: number; // track delivered
}

export interface GmcOrderLine {
  orderId: string; // timestamp-supplier-material
  week: number;
  units: number;
  unitPrice: number; // locked at order time
}

export interface MarketingPlan {
  totalSpend: number; // this week
  channels?: Array<{ name: string; spend: number }>; // optional breakdown
}

export interface WeeklyDiscountsByProduct {
  jacket: number; // 0..1
  dress: number;
  pants: number;
}

export interface WeeklyDemandByProduct {
  jacket: number;
  dress: number;
  pants: number;
}

export interface WeeklySalesByProduct {
  jacket: number;
  dress: number;
  pants: number;
}

export interface CostBreakdown {
  materials: number;
  production: number;
  logistics: number;
  marketing: number;
  holding: number;
  interest: number;
}

export interface RunningTotals {
  revenueToDate: number;
  unitsSoldToDate: number;
  cogsMaterialsToDate: number;
  cogsProductionToDate: number;
  cogsLogisticsToDate: number;
  cogsMarketingToDate: number; // allocated portion of marketing
}

export interface ExtendedWeeklyState {
  productData: ProductDecisions;
  rawMaterials: RawMaterialsInventory;
  workInProcess: { batches: WorkInProcessBatchSnapshot[] };
  finishedGoods: { lots: FinishedGoodsLot[] };
  shipmentsInTransit?: ShipmentInTransit[];
  productionSchedule: { batches: ProductionBatchPlan[] };
  procurementContracts: { contracts: ProcurementContract[] };
  marketingPlan?: MarketingPlan;
  // Planned marketing to be applied to NEXT week when week is committed
  plannedMarketingPlan?: MarketingPlan;
  // Planned discounts to be applied to NEXT week when week is committed
  plannedWeeklyDiscounts?: WeeklyDiscountsByProduct;
  // Awareness and Intent state variables (0..100)
  awareness?: number;
  intent?: number;
  // Discount trend tracking (for intent penalties)
  lastDiscountAvg?: number; // last week's average discount 0..1
  discountDeepenStreak?: number; // consecutive weeks of deeper discounts
  weeklyDiscounts: WeeklyDiscountsByProduct;
  weeklyDemand: WeeklyDemandByProduct;
  weeklySales: WeeklySalesByProduct;
  lostSales: WeeklySalesByProduct;
  costBreakdown?: CostBreakdown;
  totals?: RunningTotals;
}
