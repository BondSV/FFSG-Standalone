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

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(";").forEach((p) => {
    const [k, ...rest] = p.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("="));
  });
  return out;
}

function buildSessionCookie(sid: string): string {
  const parts = [
    `sid=${encodeURIComponent(sid)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  // 30 days
  parts.push(`Max-Age=${30 * 24 * 60 * 60}`);
  return parts.join("; ");
}

/*
 * Attach a fake user object to every incoming request. In addition to
 * setting a static user identifier, this function ensures that a
 * corresponding user record exists in the in‑memory store by upserting
 * it once at startup. Without this step, calls to `/api/auth/user` would
 * return `undefined`, causing the frontend to remain on the landing page.
 */
export async function setupAuth(app: Express) {
  app.use(async (req: any, res: any, next: any) => {
    const cookies = parseCookies(req.headers["cookie"] as string | undefined);
    let sid = cookies["sid"];
    if (!sid) {
      sid = (globalThis.crypto ?? require("crypto")).randomUUID();
      res.setHeader("Set-Cookie", buildSessionCookie(sid));
    }
    // Upsert a lightweight pseudo-user keyed by session id
    const user = await storage.upsertUser({
      email: `session:${sid}@local`,
      firstName: "Session",
      lastName: sid.slice(0, 8),
      profileImageUrl: "",
    } as any);
    req.user = { claims: { sub: (user as any).id } };
    next();
  });
}

// Authentication middleware that always passes. In the original version
// this would ensure the session token is valid and refresh it if needed.
export const isAuthenticated: RequestHandler = (_req, _res, next) => {
  return next();
};