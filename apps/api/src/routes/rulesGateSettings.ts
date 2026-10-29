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
  });
});

router.put("/guilds/:guildId/rules-gate-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const {
    channelId,
    roleId,
    savedEmbedId,
    roleToRemoveId,
    logChannelId,
    dmConfirmEnabled,
    dmConfirmMessage,
    agreeReplyMessage,
    alreadyAgreedMessage,
    noRoleConfiguredMessage,
  } = req.body as {
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
  };

  const existing = await prisma.rulesGateSettings.findUnique({ where: { guildId: req.params.guildId } });
  // Any change that affects what the panel should look like clears
  // messageId so it gets redrawn (new channel) or reposted (new embed)
  // instead of trying to edit a message that's now stale or in the wrong
  // place — mirrors apps/api/src/routes/statusChannels.ts.
  const channelChanged = channelId !== undefined && existing && existing.channelId !== channelId;
  const embedChanged = savedEmbedId !== undefined && existing && existing.savedEmbedId !== savedEmbedId;

  const row = await prisma.rulesGateSettings.upsert({
    where: { guildId: req.params.guildId },
    create: {
      guildId: req.params.guildId,
      channelId: channelId ?? null,
      roleId: roleId ?? null,
      savedEmbedId: savedEmbedId ?? null,
      roleToRemoveId: roleToRemoveId ?? null,
      logChannelId: logChannelId ?? null,
      ...(dmConfirmEnabled !== undefined ? { dmConfirmEnabled } : {}),
      ...(dmConfirmMessage !== undefined ? { dmConfirmMessage } : {}),
      ...(agreeReplyMessage !== undefined ? { agreeReplyMessage } : {}),
      ...(alreadyAgreedMessage !== undefined ? { alreadyAgreedMessage } : {}),
      ...(noRoleConfiguredMessage !== undefined ? { noRoleConfiguredMessage } : {}),
    },
    update: {
      ...(channelId !== undefined ? { channelId } : {}),
      ...(roleId !== undefined ? { roleId } : {}),
      ...(savedEmbedId !== undefined ? { savedEmbedId } : {}),
      ...(roleToRemoveId !== undefined ? { roleToRemoveId } : {}),
      ...(logChannelId !== undefined ? { logChannelId } : {}),
      ...(dmConfirmEnabled !== undefined ? { dmConfirmEnabled } : {}),
      ...(dmConfirmMessage !== undefined ? { dmConfirmMessage } : {}),
      ...(agreeReplyMessage !== undefined ? { agreeReplyMessage } : {}),
      ...(alreadyAgreedMessage !== undefined ? { alreadyAgreedMessage } : {}),
      ...(noRoleConfiguredMessage !== undefined ? { noRoleConfiguredMessage } : {}),
      ...(channelChanged || embedChanged ? { messageId: null } : {}),
    },
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
