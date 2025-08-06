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
