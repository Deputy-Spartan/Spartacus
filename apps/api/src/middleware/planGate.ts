import type { NextFunction, Request, Response } from "express";
import { guildHasTier, plansEnforced } from "@spartacus/db";
import { TIER_INFO, type PlanTier } from "@spartacus/shared";

// Paid plans for features that have no module switch: the OBS overlays and
// the Kick/Twitch chat bot (Streamer Kit). Mounted once, before the routes.
//
// - What OBS loads (/public/...) answers 402 on a server without the plan, so
//   the overlay simply shows nothing.
// - Saving or changing them from the dashboard is refused with a message that
//   names the plan. Reading them is fine (the dashboard shows its own lock).
// Module switches are checked in routes/modules.ts, Stream Deck in routes/streamDeck.ts.
const KIT = "money-counter|kd-counter|overlay|tool|overlay-visibility|chat-commands|socials-overlay";
const PUBLIC_KIT = new RegExp(`^/public/(?:money-counter|kd-counter|socials-overlay)/(\\d{15,20})$|^/public/(?:overlay|tool)/[\\w-]+/(\\d{15,20})$|^/public/chat-(?:command|sound)/(\\d{15,20})/`);
const GUILD_KIT = new RegExp(`^/guilds/(\\d{15,20})/(?:${KIT})(?:/|$)`);

export function lockedMessage(tier: PlanTier) {
  return `This needs ${TIER_INFO[tier].name}. Unlock it from the Plans page.`;
}

export async function planGate(req: Request, res: Response, next: NextFunction) {
  if (!plansEnforced()) return next();
  const path = req.path;
  const pub = PUBLIC_KIT.exec(path);
  if (pub) {
    const guildId = pub[1] || pub[2] || pub[3];
    if (!(await guildHasTier(guildId, "kit"))) return res.status(402).set("Cache-Control", "no-store").json({ error: lockedMessage("kit"), locked: "kit" });
    return next();
  }
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    const g = GUILD_KIT.exec(path);
    if (g && !(await guildHasTier(g[1], "kit"))) return res.status(402).json({ error: lockedMessage("kit"), locked: "kit" });
  }
  next();
}
