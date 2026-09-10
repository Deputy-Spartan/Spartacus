import { NextFunction, Response } from "express";
import { AuthedRequest, isOwner } from "./requireAuth";

// Stack this after requireAuthOnly (or requireAuth) — locks a route to the
// one Discord account in OWNER_DISCORD_ID, regardless of who else has
// dashboard access. Used for account-wide settings (Bot Customization,
// the manual status override) and the access-control endpoints themselves.
export function requireOwner(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!isOwner(req.user?.id)) return res.status(403).json({ error: "Owner only" });
  next();
}
