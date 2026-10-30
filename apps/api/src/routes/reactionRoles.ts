import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { deleteChannelMessage, resolveEmojiInput } from "../lib/discordRest";
import { refreshPanelOrRepost } from "../lib/panelRefresh";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// One reaction can grant any mix of roles and channel access.
interface OptionInput {
  emoji: string;
  roleIds?: string[];
  channelIds?: string[];
  roleId?: string; // legacy single-role shape
}

interface CleanOption {
  emoji: string;
  roleIds: string[];
  channelIds: string[];
}

function cleanOption(o: OptionInput): CleanOption | null {
  const emoji = (o.emoji ?? "").trim();
  const roleIds = [...new Set([...(o.roleIds ?? []), ...(o.roleId ? [o.roleId] : [])].filter(Boolean))];
  const channelIds = [...new Set((o.channelIds ?? []).filter(Boolean))];
  if (!emoji || (roleIds.length === 0 && channelIds.length === 0)) return null;
  return { emoji, roleIds, channelIds };
}

function cleanOptions(options: OptionInput[] | undefined): CleanOption[] | undefined {
  if (!options) return undefined;
  return options.map(cleanOption).filter((o): o is CleanOption => o !== null).slice(0, 20);
}

function cleanNotify(v: unknown): string | undefined {
  return v === "PRIVATE" || v === "DM" || v === "NONE" ? v : undefined;
}

// Resolves ":name:" shortcodes etc. on every option; returns the first error.
async function resolveEmojis(guildId: string, opts: CleanOption[]): Promise<string | null> {
  for (const o of opts) {
    const r = await resolveEmojiInput(guildId, o.emoji);
    if (r.error) return r.error;
    o.emoji = r.emoji ?? o.emoji;
  }
  return null;
}

function toRow(o: CleanOption) {
  return { emoji: o.emoji, roleId: o.roleIds[0] ?? "", extraRoleIds: o.roleIds.slice(1), channelIds: o.channelIds };
}

router.get("/guilds/:guildId/reaction-role-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.reactionRolePanel.findMany({
    where: { guildId: req.params.guildId },
    include: { options: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(rows);
});

router.post("/guilds/:guildId/reaction-role-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const { channelId, title, description, embedEnabled, embedColor, embedExtra, savedEmbedId, notifyMode, options, adoptMessageId } = req.body as {
    adoptMessageId?: string; // switching a button/dropdown panel to reactions reuses its message
    channelId: string;
    title?: string;
    description?: string;
    embedEnabled?: boolean;
    embedColor?: string;
    embedExtra?: Prisma.InputJsonValue;
    savedEmbedId?: string | null;
    notifyMode?: string;
    options?: OptionInput[];
  };

  const clean = cleanOptions(options ?? []) ?? [];
  if (!channelId || clean.length === 0) {
    return res.status(400).json({ error: "A channel and at least one emoji with a role or channel are required." });
  }
  const emojiError = await resolveEmojis(guildId, clean);
  if (emojiError) return res.status(400).json({ error: emojiError });
  const emojiSet = new Set(clean.map((o) => o.emoji));
  if (emojiSet.size !== clean.length) {
    return res.status(400).json({ error: "Each emoji in this panel must be unique." });
  }

  const panel = await prisma.reactionRolePanel.create({
    data: {
      guildId,
      channelId,
      title: title || null,
      description: description || null,
      embedEnabled: Boolean(embedEnabled),
      embedColor: embedColor || null,
      embedExtra: (embedExtra ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      savedEmbedId: savedEmbedId ?? null,
      notifyMode: cleanNotify(notifyMode) ?? "PRIVATE",
      messageId: adoptMessageId || null,
      options: {
        create: clean.map((o) => ({ guildId, channelId, messageId: adoptMessageId || null, ...toRow(o) })),
      },
    },
    include: { options: true },
  });
  if (adoptMessageId) await refreshPanelOrRepost("reaction", panel.id, channelId, adoptMessageId);
  res.status(201).json(panel);
});

router.put("/guilds/:guildId/reaction-role-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId, id } = req.params;
  const existing = await prisma.reactionRolePanel.findUnique({ where: { id } });
  if (!existing || existing.guildId !== guildId) {
    return res.status(404).json({ error: "Reaction role panel not found" });
  }

  const { channelId, title, description, embedEnabled, embedColor, embedExtra, savedEmbedId, notifyMode, options } = req.body as {
    channelId?: string;
    title?: string;
    description?: string;
    embedEnabled?: boolean;
    embedColor?: string;
    embedExtra?: Prisma.InputJsonValue;
    savedEmbedId?: string | null;
    notifyMode?: string;
    options?: OptionInput[];
  };

  const nextChannelId = channelId || existing.channelId;
  const clean = cleanOptions(options);
  if (clean) {
    const emojiError = await resolveEmojis(guildId, clean);
    if (emojiError) return res.status(400).json({ error: emojiError });
    const emojiSet = new Set(clean.map((o) => o.emoji));
    if (emojiSet.size !== clean.length) {
      return res.status(400).json({ error: "Each emoji in this panel must be unique." });
    }
    if (clean.length === 0) {
      return res.status(400).json({ error: "A panel needs at least one emoji with a role or channel." });
    }
  }

  // Same channel: keep the posted message and edit it in place after the
  // save. Moved to another channel: delete the old message and clear
  // messageId so the poster job sends it in the new one.
  const keepMessageId = existing.messageId && nextChannelId === existing.channelId ? existing.messageId : null;
  if (existing.messageId && !keepMessageId) await deleteChannelMessage(existing.channelId, existing.messageId).catch(() => null);
  const panel = await prisma.$transaction(async (tx) => {
    if (clean) {
      await tx.reactionRole.deleteMany({ where: { panelId: id } });
    }
    return tx.reactionRolePanel.update({
      where: { id },
      data: {
        channelId: nextChannelId,
        title: title !== undefined ? title || null : undefined,
        description: description !== undefined ? description || null : undefined,
        embedEnabled: embedEnabled !== undefined ? Boolean(embedEnabled) : undefined,
        embedColor: embedColor !== undefined ? embedColor || null : undefined,
        embedExtra: embedExtra !== undefined ? ((embedExtra ?? Prisma.JsonNull) as Prisma.InputJsonValue) : undefined,
        savedEmbedId: savedEmbedId !== undefined ? savedEmbedId : undefined,
        notifyMode: cleanNotify(notifyMode),
        messageId: keepMessageId,
        options: clean
          ? { create: clean.map((o) => ({ guildId, channelId: nextChannelId, messageId: keepMessageId, ...toRow(o) })) }
          : undefined,
      },
      include: { options: true },
    });
  });
  if (keepMessageId) await refreshPanelOrRepost("reaction", id, nextChannelId, keepMessageId);
  res.json(panel);
});

router.delete("/guilds/:guildId/reaction-role-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.reactionRolePanel.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Reaction role panel not found" });
  }
  // ?keepMessage=1 when the dashboard is switching this panel to buttons/
  // dropdown — the new panel has already adopted this message.
  if (existing.messageId && req.query.keepMessage !== "1") await deleteChannelMessage(existing.channelId, existing.messageId).catch(() => null);
  await prisma.reactionRolePanel.delete({ where: { id: req.params.id } }); // cascades to its ReactionRole options
  res.status(204).send();
});

export default router;
