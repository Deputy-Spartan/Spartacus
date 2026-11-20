import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

// The command list post (Custom Commands › Command list post).
const router = Router();
const P = "/guilds/:guildId/command-list";
const DEFAULTS = { channelId: null, staffChannelId: null, style: "EMBED", autoUpdate: true, includeStaff: true, includeCustom: true, onlyEnabled: true, sections: {}, posted: false, staffPosted: false };
const has = (v: unknown) => Array.isArray(v) && v.length > 0;
const SNOWFLAKE = /^\d{15,25}$/;
type Row = Awaited<ReturnType<typeof prisma.commandListSettings.findUnique>>;

const anyPosted = (row: NonNullable<Row>) =>
  has(row.messageIds) || has(row.staffMessageIds) || (!!row.channelPosts && typeof row.channelPosts === "object" && Object.values(row.channelPosts as Record<string, unknown>).some(has));

async function view(guildId: string, row: Row) {
  // Each section with how many commands it has (needs the bot; without it, just the names).
  let sectionList: Array<{ emoji: string; name: string; count?: number; staffCount?: number }> = [];
  const client = getBotClient();
  const bot = await import("@spartacus/bot").catch(() => null);
  if (bot) sectionList = client ? await bot.commandListSections(client, guildId).catch(() => bot.COMMAND_SECTIONS) : bot.COMMAND_SECTIONS;
  const base = row
    ? {
        channelId: row.channelId,
        staffChannelId: row.staffChannelId,
        style: row.style,
        autoUpdate: row.autoUpdate,
        includeStaff: row.includeStaff,
        includeCustom: row.includeCustom,
        onlyEnabled: row.onlyEnabled,
        sections: row.sections ?? {},
        posted: anyPosted(row),
        staffPosted: anyPosted(row),
      }
    : DEFAULTS;
  return { ...base, sectionList };
}

// waitMs: how long the page waits for Discord. Past that the work carries on
// in the background and the page is told it's still updating ("pending").
async function post(guildId: string, force: boolean, editAll = force, waitMs = 0) {
  const client = getBotClient();
  if (!client) return "The bot isn't connected right now. Try again in a moment.";
  const { refreshCommandList } = await import("@spartacus/bot");
  const work = refreshCommandList(client, guildId, force, editAll).catch((e: Error) => ({ ok: false, error: e.message }));
  const r = waitMs ? await Promise.race([work, new Promise<"pending">((ok) => setTimeout(() => ok("pending"), waitMs))]) : await work;
  if (r === "pending") return "pending";
  return r.ok ? null : (r.error ?? "Couldn't post the list.");
}

// Only known sections, with an on/off and an optional channel.
function cleanSections(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, { on: boolean; channelId: string | null }> = {};
  for (const [name, s] of Object.entries(v as Record<string, unknown>).slice(0, 30)) {
    if (!s || typeof s !== "object" || name.length > 60) continue;
    const { on, channelId } = s as { on?: unknown; channelId?: unknown };
    out[name] = { on: on !== false, channelId: typeof channelId === "string" && SNOWFLAKE.test(channelId) ? channelId : null };
  }
  return out;
}

router.get(P, requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await view(req.params.guildId, await prisma.commandListSettings.findUnique({ where: { guildId: req.params.guildId } })));
});

router.put(P, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const channel = (v: unknown) => (typeof v === "string" && SNOWFLAKE.test(v) ? v : null);
  const data: Record<string, unknown> = {};
  if ("channelId" in b) data.channelId = channel(b.channelId);
  if ("staffChannelId" in b) data.staffChannelId = channel(b.staffChannelId);
  if ("style" in b) data.style = b.style === "PLAIN" ? "PLAIN" : "EMBED";
  if ("sections" in b) data.sections = cleanSections(b.sections);
  for (const k of ["autoUpdate", "includeStaff", "includeCustom", "onlyEnabled"]) if (typeof b[k] === "boolean") data[k] = b[k];
  const before = await prisma.commandListSettings.findUnique({ where: { guildId } });
  // Lists from before sections: note where their posts are while the old channels are still known.
  if (before && (has(before.messageIds) || has(before.staffMessageIds))) {
    const map: Record<string, unknown[]> = { ...((before.channelPosts as Record<string, unknown[]>) ?? {}) };
    if (before.channelId && has(before.messageIds)) map[before.channelId] = [...(map[before.channelId] ?? []), ...(before.messageIds as unknown[])];
    if (before.staffChannelId && has(before.staffMessageIds)) map[before.staffChannelId] = [...(map[before.staffChannelId] ?? []), ...(before.staffMessageIds as unknown[])];
    data.channelPosts = map;
    data.messageIds = [];
    data.staffMessageIds = [];
  }
  const row = await prisma.commandListSettings.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
  // A new place, style or section setup always posts (old posts are removed by the bot); other changes follow "Update by itself".
  const moved = ["channelId", "staffChannelId", "style", "sections", "includeStaff"].some((k) => k in data && JSON.stringify(data[k]) !== JSON.stringify((before as Record<string, unknown> | null)?.[k] ?? null));
  const changed = Object.keys(data).some((k) => k !== "autoUpdate");
  // Only changed cards are edited; moved ones are reposted. The page waits a few seconds at most.
  const result = changed ? await post(guildId, moved, false, 4000) : null;
  const pending = result === "pending";
  const error = pending ? null : result;
  res.json({ ...(await view(guildId, await prisma.commandListSettings.findUnique({ where: { guildId } }))), pending, error: row.channelId || moved ? error : null });
});

router.post(`${P}/post`, requireAuth, requireGuildPermission, async (req, res) => {
  const result = await post(req.params.guildId, true, true, 8000);
  if (result && result !== "pending") return res.status(400).json({ error: result });
  res.json({ pending: result === "pending", ...await view(req.params.guildId, await prisma.commandListSettings.findUnique({ where: { guildId: req.params.guildId } })) });
});

// Any change to the server's own commands or module switches updates the lists
// straight away (lists set to update by themselves), instead of waiting for the bot's 5-minute check.
const WATCH = /^\/guilds\/(\d{15,25})\/(commands|custom-slash-commands|modules|command-toggles)(\/|$)/;
export function commandListWatcher(req: Request, res: Response, next: NextFunction) {
  const m = req.method !== "GET" ? req.path.match(WATCH) : null;
  if (m) {
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      const client = getBotClient();
      if (!client) return;
      setTimeout(() => {
        void import("@spartacus/bot").then(({ refreshCommandList }) => refreshCommandList(client, m[1])).catch(() => null);
      }, 3000);
    });
  }
  next();
}

export default router;
