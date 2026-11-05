import { Router } from "express";
import { prisma } from "@spartacus/db";
import { AI_CHAT_DEFAULTS, AI_CHAT_LIMIT_CHOICES, AI_CHAT_WINDOW_CHOICES, SLOWMODE_CHOICES } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { setChannelSlowmode } from "../lib/discordRest";

const router = Router();

const pick = <T extends number>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "number" && (allowed as readonly number[]).includes(v) ? (v as T) : fallback;

router.get("/guilds/:guildId/ai-config", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.aiConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(
    config ?? {
      guildId: req.params.guildId,
      chatChannelId: null,
      chatSystemPrompt: null,
      moderationEnabled: false,
      ...AI_CHAT_DEFAULTS,
    }
  );
});

router.put("/guilds/:guildId/ai-config", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const body = req.body as Record<string, unknown>;
  const before = await prisma.aiConfig.findUnique({ where: { guildId } });

  const data = {
    chatChannelId: typeof body.chatChannelId === "string" && body.chatChannelId ? body.chatChannelId : null,
    chatSystemPrompt: typeof body.chatSystemPrompt === "string" ? body.chatSystemPrompt.slice(0, 4000) : null,
    moderationEnabled: body.moderationEnabled === undefined ? (before?.moderationEnabled ?? false) : Boolean(body.moderationEnabled),
    chatLimit: pick(body.chatLimit, AI_CHAT_LIMIT_CHOICES, before?.chatLimit ?? AI_CHAT_DEFAULTS.chatLimit),
    chatLimitWindow: pick(body.chatLimitWindow, AI_CHAT_WINDOW_CHOICES, before?.chatLimitWindow ?? AI_CHAT_DEFAULTS.chatLimitWindow),
    chatStaffExempt: typeof body.chatStaffExempt === "boolean" ? body.chatStaffExempt : (before?.chatStaffExempt ?? true),
    chatSlowmode: pick(body.chatSlowmode, SLOWMODE_CHOICES, before?.chatSlowmode ?? 0),
  };
  // Slowmode only means something on a picked channel.
  if (!data.chatChannelId) data.chatSlowmode = 0;

  // Put the slowmode on the AI channel in Discord. When the channel changes,
  // the old one gets back the no-slowmode it had before Spartacus set one.
  let slowmodeError: string | null = null;
  const oldChannel = before?.chatChannelId ?? null;
  const oldSlow = before?.chatSlowmode ?? 0;
  if (oldChannel && oldSlow > 0 && oldChannel !== data.chatChannelId) {
    await setChannelSlowmode(oldChannel, 0).catch(() => null);
  }
  if (data.chatChannelId && (data.chatChannelId !== oldChannel || data.chatSlowmode !== oldSlow)) {
    if (data.chatSlowmode > 0 || oldSlow > 0) {
      const r = await setChannelSlowmode(data.chatChannelId, data.chatSlowmode).catch((e: Error) => ({ error: e.message }));
      if (r.error) {
        slowmodeError = "Spartacus couldn't set slowmode on that channel. Give its role Manage Channels there and save again.";
        data.chatSlowmode = data.chatChannelId === oldChannel ? oldSlow : 0;
      }
    }
  }

  const config = await prisma.aiConfig.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
  res.json({ ...config, slowmodeError });
});

export default router;
