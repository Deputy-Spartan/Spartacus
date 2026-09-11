import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

interface OptionInput {
  emoji: string;
  roleId: string;
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
  const { channelId, title, description, embedEnabled, embedColor, embedExtra, options } = req.body as {
    channelId: string;
    title?: string;
    description?: string;
    embedEnabled?: boolean;
    embedColor?: string;
    embedExtra?: Prisma.InputJsonValue;
    options?: OptionInput[];
  };

  const cleanOptions = (options ?? []).filter((o): o is OptionInput => !!o.emoji && !!o.roleId).slice(0, 20);
  if (!channelId || cleanOptions.length === 0) {
    return res.status(400).json({ error: "A channel and at least one emoji/role pair are required." });
  }
  const emojiSet = new Set(cleanOptions.map((o) => o.emoji));
  if (emojiSet.size !== cleanOptions.length) {
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
      options: {
        create: cleanOptions.map((o) => ({ guildId, channelId, emoji: o.emoji, roleId: o.roleId })),
      },
    },
    include: { options: true },
  });
  res.status(201).json(panel);
});

router.put("/guilds/:guildId/reaction-role-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId, id } = req.params;
  const existing = await prisma.reactionRolePanel.findUnique({ where: { id } });
  if (!existing || existing.guildId !== guildId) {
    return res.status(404).json({ error: "Reaction role panel not found" });
  }

  const { channelId, title, description, embedEnabled, embedColor, embedExtra, options } = req.body as {
    channelId?: string;
    title?: string;
    description?: string;
    embedEnabled?: boolean;
    embedColor?: string;
    embedExtra?: Prisma.InputJsonValue;
    options?: OptionInput[];
  };

  const nextChannelId = channelId || existing.channelId;
  const cleanOptions = options ? options.filter((o): o is OptionInput => !!o.emoji && !!o.roleId).slice(0, 20) : undefined;
  if (cleanOptions) {
    const emojiSet = new Set(cleanOptions.map((o) => o.emoji));
    if (emojiSet.size !== cleanOptions.length) {
      return res.status(400).json({ error: "Each emoji in this panel must be unique." });
    }
    if (cleanOptions.length === 0) {
      return res.status(400).json({ error: "A panel needs at least one emoji/role pair." });
    }
  }

  // Editing invalidates whatever's already posted (channel, options, and
  // content all affect what gets sent) — clearing messageId here makes the
  // poster job redraw a fresh message, same as RolePanel's edit flow. The
  // old message is left as-is in Discord (not deleted) but its reactions
  // stop doing anything the moment the old ReactionRole rows are replaced
  // below, since the add/remove listener can no longer find a matching row.
  const panel = await prisma.$transaction(async (tx) => {
    if (cleanOptions) {
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
        messageId: null,
        options: cleanOptions
          ? { create: cleanOptions.map((o) => ({ guildId, channelId: nextChannelId, emoji: o.emoji, roleId: o.roleId })) }
          : undefined,
      },
      include: { options: true },
    });
  });
  res.json(panel);
});

router.delete("/guilds/:guildId/reaction-role-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.reactionRolePanel.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Reaction role panel not found" });
  }
  await prisma.reactionRolePanel.delete({ where: { id: req.params.id } }); // cascades to its ReactionRole options
  res.status(204).send();
});

export default router;
