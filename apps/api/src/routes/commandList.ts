import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

// The command list post (Custom Commands › Command list post).
const router = Router();
const P = "/guilds/:guildId/command-list";
const DEFAULTS = { channelId: null, staffChannelId: null, style: "EMBED", autoUpdate: true, includeStaff: true, includeCustom: true, onlyEnabled: true, posted: false, staffPosted: false };
const has = (v: unknown) => Array.isArray(v) && v.length > 0;

const view = (row: Awaited<ReturnType<typeof prisma.commandListSettings.findUnique>>) =>
  row
    ? {
        channelId: row.channelId,
        staffChannelId: row.staffChannelId,
        style: row.style,
        autoUpdate: row.autoUpdate,
        includeStaff: row.includeStaff,
        includeCustom: row.includeCustom,
        onlyEnabled: row.onlyEnabled,
        posted: has(row.messageIds),
        staffPosted: has(row.staffMessageIds),
      }
    : DEFAULTS;

async function post(guildId: string, force: boolean) {
  const client = getBotClient();
  if (!client) return "The bot isn't connected right now. Try again in a moment.";
  const { refreshCommandList } = await import("@spartacus/bot");
  const r = await refreshCommandList(client, guildId, force).catch((e: Error) => ({ ok: false, error: e.message }));
  return r.ok ? null : (r.error ?? "Couldn't post the list.");
}

// Removes a list's posts from its old channel.
async function clear(channelId: string | null | undefined, posted: unknown) {
  const client = getBotClient();
  if (!client || !channelId || !Array.isArray(posted)) return;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch || !("messages" in ch)) return;
  for (const p of posted) {
    const id = typeof p === "string" ? p : (p as { id?: string })?.id;
    if (id) await ch.messages.fetch(id).then((m) => m.delete()).catch(() => null);
  }
}

router.get(P, requireAuth, requireGuildPermission, async (req, res) => {
  res.json(view(await prisma.commandListSettings.findUnique({ where: { guildId: req.params.guildId } })));
});

router.put(P, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const channel = (v: unknown) => (typeof v === "string" && /^\d{15,25}$/.test(v) ? v : null);
  const data: Record<string, unknown> = {};
  if ("channelId" in b) data.channelId = channel(b.channelId);
  if ("staffChannelId" in b) data.staffChannelId = channel(b.staffChannelId);
  if ("style" in b) data.style = b.style === "PLAIN" ? "PLAIN" : "EMBED";
  for (const k of ["autoUpdate", "includeStaff", "includeCustom", "onlyEnabled"]) if (typeof b[k] === "boolean") data[k] = b[k];
  const before = await prisma.commandListSettings.findUnique({ where: { guildId } });
  const restyled = "style" in data && data.style !== before?.style;
  // A new channel or style gets a fresh post (the old one is removed while it's still known).
  if (("channelId" in data && data.channelId !== before?.channelId) || restyled) {
    await clear(before?.channelId, before?.messageIds);
    data.messageIds = [];
  }
  if (("staffChannelId" in data && data.staffChannelId !== before?.staffChannelId) || restyled) {
    await clear(before?.staffChannelId, before?.staffMessageIds);
    data.staffMessageIds = [];
  }
  const row = await prisma.commandListSettings.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
  const changed = Object.keys(data).some((k) => k !== "autoUpdate");
  // A new place or style always posts; other changes follow "Update by itself".
  const moved = "messageIds" in data || "staffMessageIds" in data;
  const error = (row.channelId || row.staffChannelId) && changed ? await post(guildId, moved) : null;
  res.json({ ...view(await prisma.commandListSettings.findUnique({ where: { guildId } })), error });
});

router.post(`${P}/post`, requireAuth, requireGuildPermission, async (req, res) => {
  const error = await post(req.params.guildId, true);
  if (error) return res.status(400).json({ error });
  res.json(view(await prisma.commandListSettings.findUnique({ where: { guildId: req.params.guildId } })));
});

// Any change to the server's own commands or module switches updates the lists
// straight away (lists set to update by themselves), instead of waiting for the bot's 5-minute check.
const WATCH = /^\/guilds\/(\d{15,25})\/(commands|custom-slash-commands|modules)(\/|$)/;
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
