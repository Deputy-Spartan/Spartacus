import { Router } from "express";
import { prisma } from "@spartacus/db";
import { PLAYING_NOW_DEFAULTS, cleanPlayingNow, cleanPlayingNowModes } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";
import { deleteChannelMessage } from "../lib/discordRest";
import { memberNames } from "../lib/memberNames";

// Engagement → Playing Now settings.
const router = Router();
const P = "/guilds/:guildId/playing-now";

async function view(guildId: string, panelError: string | null = null) {
  const [row, active] = await Promise.all([
    prisma.playingNowConfig.findUnique({ where: { guildId } }),
    prisma.playingNowPost.findMany({ where: { guildId, endedAt: null }, orderBy: { createdAt: "asc" } }),
  ]);
  const names = await memberNames(guildId, active.map((p) => p.userId));
  return {
    settings: row
      ? {
          channelId: row.channelId,
          roleId: row.roleId,
          notifyRoleId: row.notifyRoleId,
          maxMinutes: row.maxMinutes,
          pingCooldown: row.pingCooldown,
          endOnVoiceLeave: row.endOnVoiceLeave,
          modes: cleanPlayingNowModes(row.modes),
          matchmakingButton: row.matchmakingButton,
        }
      : { ...PLAYING_NOW_DEFAULTS },
    posted: !!row?.panelMessageId,
    panelError,
    active: active.map((p) => ({
      userId: p.userId,
      name: names[p.userId] ?? p.userId,
      mode: p.mode,
      need: p.need,
      joined: Array.isArray(p.joined) ? p.joined.length : 0,
      note: p.note,
      endsAt: p.endsAt.toISOString(),
    })),
  };
}

router.get(P, requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await view(req.params.guildId));
});

router.put(P, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const s = cleanPlayingNow((req.body ?? {}) as Record<string, unknown>);
  const before = await prisma.playingNowConfig.findUnique({ where: { guildId } });
  const moved = (before?.channelId ?? null) !== s.channelId;
  if (moved && before?.channelId && before.panelMessageId) await deleteChannelMessage(before.channelId, before.panelMessageId).catch(() => null);
  const data = { ...s, ...(moved ? { panelMessageId: null } : {}) };
  await prisma.playingNowConfig.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
  let panelError: string | null = null;
  const client = getBotClient();
  if (client && s.channelId) {
    const { syncPlayingNowPanel } = await import("@spartacus/bot");
    panelError = await syncPlayingNowPanel(client, guildId).catch((e: Error) => e.message);
  }
  res.json(await view(guildId, panelError));
});

// Makes the two roles (or finds them), and saves them.
router.post(`${P}/roles`, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "The bot is restarting. Try again in a minute." });
  const { createPlayingNowRoles, syncPlayingNowPanel } = await import("@spartacus/bot");
  const made = await createPlayingNowRoles(client, guildId);
  if (made.error && !made.roleId && !made.notifyRoleId) return res.status(400).json({ error: made.error });
  const data = { ...(made.roleId ? { roleId: made.roleId } : {}), ...(made.notifyRoleId ? { notifyRoleId: made.notifyRoleId } : {}) };
  await prisma.playingNowConfig.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
  const panelError = await syncPlayingNowPanel(client, guildId).catch((e: Error) => e.message);
  res.json(await view(guildId, made.error ?? panelError));
});

export default router;
