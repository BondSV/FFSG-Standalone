/*
 * Session identification for the stand‑alone app (legacy module name).
 *
 * This file is not tied to any vendor. It issues an `sid` cookie, upserts a
 * lightweight user row, and sets `req.user` so game routes have a stable user
 * id. `isAuthenticated` passes all requests — replace with real auth for
 * production if you need login, SSO, or stricter checks.
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

// Authentication middleware that always passes (demo / single-tenant default).
export const isAuthenticated: RequestHandler = (_req, _res, next) => {
  return next();
};