import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

function sanitizeStringList(input: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(input)) return [];
  return input.filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, 25);
}

router.get("/guilds/:guildId/channel-locks", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.channelLock.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

function buildNotifyFields(body: Record<string, unknown>) {
  return {
    notifyEnabled: Boolean(body.notifyEnabled),
    notifyHidden: Boolean(body.notifyHidden),
    notifyContent: typeof body.notifyContent === "string" ? body.notifyContent : undefined,
    notifyEmbedEnabled: Boolean(body.notifyEmbedEnabled),
    notifyEmbedTitle: typeof body.notifyEmbedTitle === "string" ? body.notifyEmbedTitle : undefined,
    notifyEmbedColor: typeof body.notifyEmbedColor === "string" ? body.notifyEmbedColor : undefined,
    notifyButtons: Array.isArray(body.notifyButtons) ? (body.notifyButtons as Prisma.InputJsonValue) : [],
    notifyDeleteAfterSec: Number.isFinite(Number(body.notifyDeleteAfterSec)) ? Number(body.notifyDeleteAfterSec) : 6,
    dmUser: Boolean(body.dmUser),
    savedEmbedId: typeof body.savedEmbedId === "string" ? body.savedEmbedId : null,
  };
}

router.post("/guilds/:guildId/channel-locks", requireAuth, requireGuildPermission, async (req, res) => {
  const {
    channelId,
    allowImages,
    allowLinks,
    allowFiles,
    allowMessages,
    slashCommandsOnly,
    allowedCommands,
    requiredPrefixes,
    bannedWords,
    allowedUserIds,
    allowedRoleIds,
  } = req.body;

  const data = {
    guildId: req.params.guildId,
    channelId,
    allowImages: Boolean(allowImages),
    allowLinks: Boolean(allowLinks),
    allowFiles: Boolean(allowFiles),
    allowMessages: Boolean(allowMessages),
    slashCommandsOnly: Boolean(slashCommandsOnly),
    allowedCommands: sanitizeStringList(allowedCommands),
    requiredPrefixes: sanitizeStringList(requiredPrefixes),
    bannedWords: sanitizeStringList(bannedWords),
    allowedUserIds: sanitizeStringList(allowedUserIds),
    allowedRoleIds: sanitizeStringList(allowedRoleIds),
    ...buildNotifyFields(req.body),
  };

  const row = await prisma.channelLock.upsert({
    where: { channelId },
    create: data,
    update: data,
  });
  res.status(201).json(row);
});

router.put("/guilds/:guildId/channel-locks/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.channelLock.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Channel lock not found" });
  }

  const {
    allowImages,
    allowLinks,
    allowFiles,
    allowMessages,
    slashCommandsOnly,
    allowedCommands,
    requiredPrefixes,
    bannedWords,
    allowedUserIds,
    allowedRoleIds,
  } = req.body;
  const row = await prisma.channelLock.update({
    where: { id: req.params.id },
    data: {
      allowImages: Boolean(allowImages),
      allowLinks: Boolean(allowLinks),
      allowFiles: Boolean(allowFiles),
      allowMessages: Boolean(allowMessages),
      slashCommandsOnly: Boolean(slashCommandsOnly),
      allowedCommands: sanitizeStringList(allowedCommands),
      requiredPrefixes: sanitizeStringList(requiredPrefixes),
      bannedWords: sanitizeStringList(bannedWords),
      allowedUserIds: sanitizeStringList(allowedUserIds),
      allowedRoleIds: sanitizeStringList(allowedRoleIds),
      ...buildNotifyFields(req.body),
    },
  });
  res.json(row);
});

router.delete("/guilds/:guildId/channel-locks/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.channelLock.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Channel lock not found" });
  }

  await prisma.channelLock.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
