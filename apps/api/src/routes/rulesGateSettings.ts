import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission, requireGuildOwner } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();

router.get("/guilds/:guildId/rules-gate-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.rulesGateSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    channelId: row?.channelId ?? null,
    roleId: row?.roleId ?? null,
    savedEmbedId: row?.savedEmbedId ?? null,
    roleToRemoveId: row?.roleToRemoveId ?? null,
    logChannelId: row?.logChannelId ?? null,
    dmConfirmEnabled: row?.dmConfirmEnabled ?? false,
    dmConfirmMessage: row?.dmConfirmMessage ?? null,
    agreeReplyMessage: row?.agreeReplyMessage ?? null,
    alreadyAgreedMessage: row?.alreadyAgreedMessage ?? null,
    noRoleConfiguredMessage: row?.noRoleConfiguredMessage ?? null,
    rulesVersion: row?.rulesVersion ?? 1,
    minAccountAgeDays: row?.minAccountAgeDays ?? null,
    accountTooNewMessage: row?.accountTooNewMessage ?? null,
    declineEnabled: row?.declineEnabled ?? false,
    declineAction: row?.declineAction ?? "NONE",
    declineChannelId: row?.declineChannelId ?? null,
    declineReplyMessage: row?.declineReplyMessage ?? null,
    reminderEnabled: row?.reminderEnabled ?? false,
    reminderDelayHours: row?.reminderDelayHours ?? 24,
    reminderMessage: row?.reminderMessage ?? null,
    reminderRepeatEnabled: row?.reminderRepeatEnabled ?? false,
    reminderRepeatWeekday: row?.reminderRepeatWeekday ?? null,
    reminderRepeatHour: row?.reminderRepeatHour ?? null,
    defaultEmbedTitle: row?.defaultEmbedTitle ?? null,
    defaultEmbedDescription: row?.defaultEmbedDescription ?? null,
  });
});

interface RulesGateSettingsBody {
  channelId?: string | null;
  roleId?: string | null;
  savedEmbedId?: string | null;
  roleToRemoveId?: string | null;
  logChannelId?: string | null;
  dmConfirmEnabled?: boolean;
  dmConfirmMessage?: string | null;
  agreeReplyMessage?: string | null;
  alreadyAgreedMessage?: string | null;
  noRoleConfiguredMessage?: string | null;
  minAccountAgeDays?: number | null;
  accountTooNewMessage?: string | null;
  declineEnabled?: boolean;
  declineAction?: "NONE" | "KICK" | "CHANNEL";
  declineChannelId?: string | null;
  declineReplyMessage?: string | null;
  reminderEnabled?: boolean;
  reminderDelayHours?: number;
  reminderMessage?: string | null;
  reminderRepeatEnabled?: boolean;
  reminderRepeatWeekday?: number | null;
  reminderRepeatHour?: number | null;
  defaultEmbedTitle?: string | null;
  defaultEmbedDescription?: string | null;
}

function pickDefined<T extends object>(body: T, keys: (keyof T)[]) {
  const out: Partial<T> = {};
  for (const key of keys) if (body[key] !== undefined) out[key] = body[key];
  return out;
}

const SETTINGS_KEYS: (keyof RulesGateSettingsBody)[] = [
  "channelId",
  "roleId",
  "savedEmbedId",
  "roleToRemoveId",
  "logChannelId",
  "dmConfirmEnabled",
  "dmConfirmMessage",
  "agreeReplyMessage",
  "alreadyAgreedMessage",
  "noRoleConfiguredMessage",
  "minAccountAgeDays",
  "accountTooNewMessage",
  "declineEnabled",
  "declineAction",
  "declineChannelId",
  "declineReplyMessage",
  "reminderEnabled",
  "reminderDelayHours",
  "reminderMessage",
  "reminderRepeatEnabled",
  "reminderRepeatWeekday",
  "reminderRepeatHour",
  "defaultEmbedTitle",
  "defaultEmbedDescription",
];

router.put("/guilds/:guildId/rules-gate-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const body = req.body as RulesGateSettingsBody;
  const patch = pickDefined(body, SETTINGS_KEYS);

  const existing = await prisma.rulesGateSettings.findUnique({ where: { guildId: req.params.guildId } });
  // Any change that affects what the panel should look like clears
  // messageId so it gets redrawn (new channel) or reposted (new embed)
  // instead of trying to edit a message that's now stale or in the wrong
  // place — mirrors apps/api/src/routes/statusChannels.ts.
  const channelChanged = body.channelId !== undefined && existing && existing.channelId !== body.channelId;
  const embedChanged = body.savedEmbedId !== undefined && existing && existing.savedEmbedId !== body.savedEmbedId;

  const row = await prisma.rulesGateSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...patch },
    update: { ...patch, ...(channelChanged || embedChanged ? { messageId: null } : {}) },
  });

  // Post/repost right away instead of waiting on the catch-up cron (up to a
  // minute) — only when there's actually a new panel to draw.
  if ((channelChanged || embedChanged) && row.channelId) {
    const client = getBotClient();
    if (client) {
      // Clean up the old panel message first so changing the channel or the
      // embed doesn't leave a stale duplicate behind.
      if (existing?.messageId && existing.channelId) {
        const oldChannel = await client.channels.fetch(existing.channelId).catch(() => null);
        if (oldChannel?.isTextBased()) {
          await oldChannel.messages.delete(existing.messageId).catch(() => null);
        }
      }
      const { postRulesGatePanel } = await import("@spartacus/bot");
      await postRulesGatePanel(client, row).catch(() => null);
    }
  }

  res.json(row);
});

// "New Rules Version" — bumps rulesVersion and revokes the role from
// everyone holding it, so they have to re-agree. See bumpRulesVersion in
// apps/bot/src/modules/community/rulesGate.ts for the actual revoke/DM logic.
router.post("/guilds/:guildId/rules-gate-settings/bump-version", requireAuth, requireGuildPermission, async (req, res) => {
  const client = getBotClient();
  if (!client) {
    res.status(503).json({ error: "Bot is offline — try again shortly." });
    return;
  }
  const { bumpRulesVersion } = await import("@spartacus/bot");
  const result = await bumpRulesVersion(client, req.params.guildId);
  res.json(result);
});

// --- Sections (optional per-section acknowledgment buttons) ---
router.get("/guilds/:guildId/rules-gate-sections", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.rulesGateSection.findMany({ where: { guildId: req.params.guildId }, orderBy: { sortOrder: "asc" } });
  res.json(rows);
});

router.post("/guilds/:guildId/rules-gate-sections", requireAuth, requireGuildPermission, async (req, res) => {
  const { label, roleId } = req.body as { label?: string; roleId?: string };
  if (!label?.trim() || !roleId) {
    res.status(400).json({ error: "label and roleId are required" });
    return;
  }
  const settings = await prisma.rulesGateSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId },
    update: {},
  });
  const count = await prisma.rulesGateSection.count({ where: { settingsId: settings.id } });
  if (count >= 4) {
    res.status(400).json({ error: "Up to 4 sections are supported." });
    return;
  }
  const section = await prisma.rulesGateSection.create({
    data: { settingsId: settings.id, guildId: req.params.guildId, label: label.trim().slice(0, 80), roleId, sortOrder: count },
  });

  // Repost right away so the new button shows up without waiting on the cron.
  const client = getBotClient();
  if (client && settings.channelId && settings.messageId) {
    const { postRulesGatePanel } = await import("@spartacus/bot");
    const channel = await client.channels.fetch(settings.channelId).catch(() => null);
    if (channel?.isTextBased()) await channel.messages.delete(settings.messageId).catch(() => null);
    await prisma.rulesGateSettings.update({ where: { id: settings.id }, data: { messageId: null } });
    const fresh = await prisma.rulesGateSettings.findUnique({ where: { id: settings.id } });
    if (fresh) await postRulesGatePanel(client, fresh).catch(() => null);
  }

  res.json(section);
});

router.delete("/guilds/:guildId/rules-gate-sections/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const settings = await prisma.rulesGateSettings.findUnique({ where: { guildId: req.params.guildId } });
  if (!settings) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await prisma.rulesGateSection.deleteMany({ where: { id: req.params.id, settingsId: settings.id } });

  const client = getBotClient();
  if (client && settings.channelId && settings.messageId) {
    const { postRulesGatePanel } = await import("@spartacus/bot");
    const channel = await client.channels.fetch(settings.channelId).catch(() => null);
    if (channel?.isTextBased()) await channel.messages.delete(settings.messageId).catch(() => null);
    await prisma.rulesGateSettings.update({ where: { id: settings.id }, data: { messageId: null } });
    const fresh = await prisma.rulesGateSettings.findUnique({ where: { id: settings.id } });
    if (fresh) await postRulesGatePanel(client, fresh).catch(() => null);
  }

  res.json({ ok: true });
});

// Dashboard-side audit trail of every agreement (separate from the optional
// in-Discord log channel) — most recent first, capped so the page stays fast.
router.get("/guilds/:guildId/rules-gate-agreements", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.rulesGateAgreement.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { agreedAt: "desc" },
    take: 200,
  });
  res.json(rows);
});

// Server-owner-only, same reasoning as Player Reports' transcript purge —
// this is evidence of who agreed to the rules and when, so letting any
// Manage-Server staffer wipe it would let them erase their own tracks.
router.delete("/guilds/:guildId/rules-gate-agreements", requireAuth, requireGuildPermission, requireGuildOwner, async (req, res) => {
  const result = await prisma.rulesGateAgreement.deleteMany({ where: { guildId: req.params.guildId } });
  res.json({ deleted: result.count });
});

export default router;
