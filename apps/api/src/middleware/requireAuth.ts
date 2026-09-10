import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@spartacus/db";

interface SessionPayload {
  id: string;
  username: string;
  avatar: string | null;
  guilds: Array<{ id: string; name: string; icon: string | null; permissions: string }>;
}

export interface AuthedRequest extends Request {
  user?: { id: string; username: string; avatar: string | null };
  session?: SessionPayload;
}

export function isOwner(discordUserId: string | undefined): boolean {
  return !!discordUserId && !!process.env.OWNER_DISCORD_ID && discordUserId === process.env.OWNER_DISCORD_ID;
}

function readToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : req.cookies?.spartacus_session ?? null;
}

// Identity only — verifies the JWT and attaches req.user/req.session, but
// does NOT check dashboard access. Only the handful of routes an
// unapproved-but-logged-in visitor still needs (who am I, request access,
// check my status) should use this instead of requireAuth below.
export function requireAuthOnly(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = jwt.verify(token, process.env.NEXTAUTH_SECRET as string) as SessionPayload;
    req.session = payload;
    req.user = { id: payload.id, username: payload.username, avatar: payload.avatar };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}

// The dashboard is invite-only — this is the single choke point nearly
// every route in the app passes through (any route built with the normal
// `requireAuth` import automatically gets this for free, no per-route
// change needed). The owner (OWNER_DISCORD_ID) always passes; everyone
// else needs a DashboardAccess row. A logged-in-but-unapproved user gets a
// distinct 403 error code so the dashboard can show a "request access"
// screen instead of a generic error.
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, process.env.NEXTAUTH_SECRET as string) as SessionPayload;
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }

  req.session = payload;
  req.user = { id: payload.id, username: payload.username, avatar: payload.avatar };

  if (isOwner(payload.id)) return next();

  const access = await prisma.dashboardAccess.findUnique({ where: { discordUserId: payload.id } });
  if (!access) return res.status(403).json({ error: "ACCESS_REQUIRED" });

  next();
}
