/*
 * Stand‑alone authentication stub
 *
 * The original project integrated with Replit's OIDC provider via Passport.js.
 * That workflow requires environment variables such as `REPLIT_DOMAINS`,
 * `REPL_ID`, `SESSION_SECRET` and a Postgres session store. None of these
 * dependencies exist in a generic Node environment, and for a local preview
 * they're unnecessary. To provide a frictionless demo, this module exports
 * replacements for `setupAuth` and `isAuthenticated` that simply attach a
 * dummy user to each request and allow all requests to proceed.
 */

import type { Express, RequestHandler } from "express";
import { storage } from "./storage";

/*
 * Attach a fake user object to every incoming request. In addition to
 * setting a static user identifier, this function ensures that a
 * corresponding user record exists in the in‑memory store by upserting
 * it once at startup. Without this step, calls to `/api/auth/user` would
 * return `undefined`, causing the frontend to remain on the landing page.
 */
let demoUserId: string | undefined;

export async function setupAuth(app: Express) {
  // Create or update a demo user once when the server is configured. This
  // ensures that the user exists in storage and has an ID we can reference.
  const demoUser = await storage.upsertUser({
    email: "demo@example.com",
    firstName: "Demo",
    lastName: "User",
    profileImageUrl: "",
  } as any);
  demoUserId = demoUser.id as string;

  app.use(async (req: any, _res: any, next: any) => {
    // Provide a consistent user ID so that storage can track sessions
    req.user = { claims: { sub: demoUserId } };
    next();
  });
}

// Authentication middleware that always passes. In the original version
// this would ensure the session token is valid and refresh it if needed.
export const isAuthenticated: RequestHandler = (_req, _res, next) => {
  return next();
};