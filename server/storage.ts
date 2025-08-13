/*
 * In the original Replit version of this project, data persistence was handled
 * via a hosted Postgres database using Drizzle ORM. That approach requires a
 * connection string (`DATABASE_URL`) and the `@neondatabase/serverless` client,
 * both of which are unavailable outside of Replit. To enable a stand‑alone
 * preview with no external dependencies, this module now provides a simple
 * in‑memory implementation of the storage layer. The interface is the same
 * as the original `DatabaseStorage` so the rest of the server can operate
 * unmodified.
 *
 * Because this store lives entirely in memory, all data will be lost when
 * the process restarts. This is acceptable for a single‑user preview but
 * should not be used in production.
 */

import { db } from "./db";
import { and, desc, eq, sql as dsql, asc } from "drizzle-orm";
import {
  users as usersTable,
  gameSessions as gameSessionsTable,
  weeklyStates as weeklyStatesTable,
  type GameSession,
  type WeeklyState,
  type User,
  type UpsertUser,
  type InsertGameSession,
  type InsertWeeklyState,
} from "@shared/schema";

// Define the shape of the storage interface. This mirrors the original
// interface used with the Postgres implementation but is simplified for
// clarity. All methods return Promises so they can be used interchangeably
// with the async database version.
export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createGameSession(gameSession: InsertGameSession): Promise<GameSession>;
  getGameSession(id: string): Promise<GameSession | undefined>;
  getUserActiveGameSession(userId: string): Promise<GameSession | undefined>;
  updateGameSession(id: string, updates: Partial<GameSession>): Promise<GameSession>;
  createWeeklyState(weeklyState: InsertWeeklyState): Promise<WeeklyState>;
  getWeeklyState(gameSessionId: string, weekNumber: number): Promise<WeeklyState | undefined>;
  getLatestWeeklyState(gameSessionId: string): Promise<WeeklyState | undefined>;
  updateWeeklyState(id: string, updates: Partial<WeeklyState>): Promise<WeeklyState>;
  getAllWeeklyStates(gameSessionId: string): Promise<WeeklyState[]>;
  commitWeeklyState(id: string): Promise<WeeklyState>;
}

// Helper to generate unique identifiers. The built‑in crypto module is
// available in modern versions of Node.js and does not require any
// additional dependencies.
function generateId(): string {
  return (globalThis.crypto ?? require("crypto")).randomUUID();
}

// In‑memory collections to hold users, game sessions and weekly states. The
// structure of these objects follows the shape defined in `@shared/schema`.
const usersStore: User[] = [];
const gameSessionsStore: GameSession[] = [];
const weeklyStatesStore: WeeklyState[] = [];

class InMemoryStorage implements IStorage {
  // Retrieve a user by its UUID. Returns undefined if not found.
  async getUser(id: string): Promise<User | undefined> {
    return usersStore.find(u => u.id === id);
  }

  // Create or update a user based on email. If a user with the same
  // email exists, update its fields; otherwise create a new user. The
  // returned object follows the User type.
  async upsertUser(userData: UpsertUser): Promise<User> {
    // Try to find existing user by email (since sub is not provided here).
    let existing = usersStore.find(u => u.email === userData.email);
    const now = new Date();
    if (existing) {
      Object.assign(existing, userData, { updatedAt: now });
      return existing;
    } else {
      const newUser: any = {
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        ...userData,
      };
      usersStore.push(newUser);
      return newUser;
    }
  }

  // Create a new game session. Generates an ID and timestamps if they
  // aren't provided.
  async createGameSession(gameSession: InsertGameSession): Promise<GameSession> {
    const now = new Date();
    const session: any = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      isCompleted: false,
      finalScore: null,
      finalCash: null,
      finalServiceLevel: null,
      finalEconomicProfit: null,
      ...gameSession,
    };
    gameSessionsStore.push(session);
    return session;
  }

  // Fetch a game session by ID.
  async getGameSession(id: string): Promise<GameSession | undefined> {
    return gameSessionsStore.find(s => s.id === id);
  }

  // Find the most recent active game session for a user. We treat the
  // last created session that is not completed as the active one.
  async getUserActiveGameSession(userId: string): Promise<GameSession | undefined> {
    const sessions = gameSessionsStore
      .filter(s => s.userId === userId && s.isCompleted === false)
      .sort((a, b) => (a.createdAt as any) > (b.createdAt as any) ? -1 : 1);
    return sessions[0];
  }

  // Update a game session with new fields and update the timestamp.
  async updateGameSession(id: string, updates: Partial<GameSession>): Promise<GameSession> {
    const session = gameSessionsStore.find(s => s.id === id);
    if (!session) throw new Error('Game session not found');
    Object.assign(session, updates, { updatedAt: new Date() });
    return session;
  }

  // Create a new weekly state for a game. Assigns an ID, timestamps and
  // merges any provided fields. Numeric values should already be strings
  // (to be consistent with the database version) so we simply spread them.
  async createWeeklyState(weeklyState: InsertWeeklyState): Promise<WeeklyState> {
    const now = new Date();
    const state: any = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      isCommitted: false,
      ...weeklyState,
    };
    weeklyStatesStore.push(state);
    return state;
  }

  // Retrieve a specific week of a game session.
  async getWeeklyState(gameSessionId: string, weekNumber: number): Promise<WeeklyState | undefined> {
    return weeklyStatesStore.find(w => w.gameSessionId === gameSessionId && w.weekNumber === weekNumber);
  }

  // Return the most recently created week for a game session. Sorting by
  // weekNumber ensures we always return the highest week.
  async getLatestWeeklyState(gameSessionId: string): Promise<WeeklyState | undefined> {
    const states = weeklyStatesStore
      .filter(w => w.gameSessionId === gameSessionId)
      .sort((a, b) => b.weekNumber - a.weekNumber);
    return states[0];
  }

  // Update a weekly state. Mutates the object in place and updates
  // timestamps.
  async updateWeeklyState(id: string, updates: Partial<WeeklyState>): Promise<WeeklyState> {
    const state = weeklyStatesStore.find(w => w.id === id);
    if (!state) throw new Error('Weekly state not found');
    Object.assign(state, updates, { updatedAt: new Date() });
    return state;
  }

  // Return all weekly states for a game session ordered by the week number.
  async getAllWeeklyStates(gameSessionId: string): Promise<WeeklyState[]> {
    return weeklyStatesStore
      .filter(w => w.gameSessionId === gameSessionId)
      .sort((a, b) => a.weekNumber - b.weekNumber);
  }

  // Mark a weekly state as committed. Returns the updated state.
  async commitWeeklyState(id: string): Promise<WeeklyState> {
    const state = weeklyStatesStore.find(w => w.id === id);
    if (!state) throw new Error('Weekly state not found');
    state.isCommitted = true;
    state.updatedAt = new Date();
    return state;
  }
}

// Export a single instance of the in‑memory storage. This mirrors the
// original API where a singleton `storage` was exported from this module.
class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    return rows[0];
  }
  async upsertUser(userData: UpsertUser): Promise<User> {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, userData.email as any)).limit(1);
    if (existing[0]) {
      const updated = await db
        .update(usersTable)
        .set({ ...userData, updatedAt: new Date() } as any)
        .where(eq(usersTable.id, existing[0].id))
        .returning();
      return updated[0] as any;
    }
    const inserted = await db.insert(usersTable).values(userData as any).returning();
    return inserted[0] as any;
  }
  async createGameSession(gameSession: InsertGameSession): Promise<GameSession> {
    const rows = await db.insert(gameSessionsTable).values(gameSession as any).returning();
    return rows[0] as any;
  }
  async getGameSession(id: string): Promise<GameSession | undefined> {
    const rows = await db.select().from(gameSessionsTable).where(eq(gameSessionsTable.id, id)).limit(1);
    return rows[0] as any;
  }
  async getUserActiveGameSession(userId: string): Promise<GameSession | undefined> {
    const rows = await db
      .select()
      .from(gameSessionsTable)
      .where(and(eq(gameSessionsTable.userId, userId), eq(gameSessionsTable.isCompleted, false as any)))
      .orderBy(desc(gameSessionsTable.createdAt))
      .limit(1);
    return rows[0] as any;
  }
  async updateGameSession(id: string, updates: Partial<GameSession>): Promise<GameSession> {
    const rows = await db.update(gameSessionsTable).set({ ...(updates as any), updatedAt: new Date() }).where(eq(gameSessionsTable.id, id)).returning();
    return rows[0] as any;
  }
  async createWeeklyState(weeklyState: InsertWeeklyState): Promise<WeeklyState> {
    const rows = await db.insert(weeklyStatesTable).values(weeklyState as any).returning();
    return rows[0] as any;
  }
  async getWeeklyState(gameSessionId: string, weekNumber: number): Promise<WeeklyState | undefined> {
    const rows = await db
      .select()
      .from(weeklyStatesTable)
      .where(and(eq(weeklyStatesTable.gameSessionId, gameSessionId), eq(weeklyStatesTable.weekNumber, weekNumber)))
      .limit(1);
    return rows[0] as any;
  }
  async getLatestWeeklyState(gameSessionId: string): Promise<WeeklyState | undefined> {
    const rows = await db
      .select()
      .from(weeklyStatesTable)
      .where(eq(weeklyStatesTable.gameSessionId, gameSessionId))
      .orderBy(desc(weeklyStatesTable.weekNumber))
      .limit(1);
    return rows[0] as any;
  }
  async updateWeeklyState(id: string, updates: Partial<WeeklyState>): Promise<WeeklyState> {
    const rows = await db
      .update(weeklyStatesTable)
      .set({ ...(updates as any), updatedAt: new Date() })
      .where(eq(weeklyStatesTable.id, id))
      .returning();
    return rows[0] as any;
  }
  async getAllWeeklyStates(gameSessionId: string): Promise<WeeklyState[]> {
    const rows = await db
      .select()
      .from(weeklyStatesTable)
      .where(eq(weeklyStatesTable.gameSessionId, gameSessionId))
      .orderBy(asc(weeklyStatesTable.weekNumber));
    return rows as any;
  }
  async commitWeeklyState(id: string): Promise<WeeklyState> {
    const rows = await db.update(weeklyStatesTable).set({ isCommitted: true, updatedAt: new Date() } as any).where(eq(weeklyStatesTable.id, id)).returning();
    return rows[0] as any;
  }
}

// Choose DB storage when DATABASE_URL is present; otherwise in-memory
let selected: IStorage;
if (process.env.DATABASE_URL) {
  selected = new DatabaseStorage();
} else {
  selected = new InMemoryStorage();
}

export const storage: IStorage = selected;
