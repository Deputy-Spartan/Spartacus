import type { NextFunction, Request, Response } from "express";
import { guildHasFeature, plansEnforced } from "@spartacus/db";
import { TIER_INFO, type PlanTier } from "@spartacus/shared";

// Paid plans for features that have no module switch: the OBS overlays and
// the Kick/Twitch chat bot (Streamer Kit, or each one bought on its own).
// Mounted once, before the routes.
//
// - What OBS loads (/public/...) answers 402 on a server without it, so the
//   overlay simply shows nothing.
// - Saving or changing them from the dashboard is refused with a message that
//   names the plan. Reading them is fine (the dashboard shows its own lock).
// Module switches are checked in routes/modules.ts, Stream Deck in routes/streamDeck.ts.

/** The single feature an overlay/chat path belongs to (all need the Streamer Kit otherwise). */
function featureOf(area: string, kind?: string): string {
  if (area === "money-counter") return "o:money";
  if (area === "kd-counter") return "o:kd";
  if (area === "socials-overlay") return "o:socials";
  if (area === "overlay") return `o:${kind}`;
  if (area === "tool") return `t:${kind}`;
  if (area === "overlay-visibility") return "o:*";
  return "cc"; // chat-commands, chat-command, chat-sound
}

const PUBLIC = /^\/public\/(money-counter|kd-counter|socials-overlay)\/(\d{15,20})$|^\/public\/(overlay|tool)\/([\w-]+)\/(\d{15,20})$|^\/public\/(chat-command|chat-sound)\/(\d{15,20})\//;
const GUILD = /^\/guilds\/(\d{15,20})\/(money-counter|kd-counter|overlay|tool|overlay-visibility|chat-commands|socials-overlay)(?:\/([\w-]+))?(?:\/|$)/;

export function lockedMessage(tier: PlanTier, name?: string) {
  return name ? `This needs ${name} or ${TIER_INFO[tier].name}. Unlock it from the Plans page.` : `This needs ${TIER_INFO[tier].name}. Unlock it from the Plans page.`;
}

export async function planGate(req: Request, res: Response, next: NextFunction) {
  if (!plansEnforced()) return next();
  const path = req.path;
  const p = PUBLIC.exec(path);
  if (p) {
    const [guildId, feature] = p[1] ? [p[2], featureOf(p[1])] : p[3] ? [p[5], featureOf(p[3], p[4])] : [p[7], "cc"];
    if (!(await guildHasFeature(guildId, feature, "kit"))) return res.status(402).set("Cache-Control", "no-store").json({ error: lockedMessage("kit"), locked: "kit" });
    return next();
  }
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    const g = GUILD.exec(path);
    if (g && !(await guildHasFeature(g[1], featureOf(g[2], g[3]), "kit"))) return res.status(402).json({ error: lockedMessage("kit"), locked: "kit" });
  }
  next();
}
