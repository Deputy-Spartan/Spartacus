import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

function sanitizeStringList(input: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(input)) return [];
  return input.filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, 25);
}

// Command names are matched against interaction.commandName, which Discord
// never includes a leading slash in — strip one off here in case someone
// types "/ticket" instead of "ticket", so the allowlist actually matches.
function sanitizeCommandList(input: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(input)) return [];
  return input
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => s.trim().replace(/^\//, "").toLowerCase())
    .filter((s) => s.length > 0)
    .slice(0, 25);
}

router.get("/guilds/:guildId/channel-locks", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.channelLock.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

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
    notifyEnabled,
    notifyContent,
  } = req.body;

  const data = {
    guildId: req.params.guildId,
    channelId,
    allowImages: Boolean(allowImages),
    allowLinks: Boolean(allowLinks),
    allowFiles: Boolean(allowFiles),
    allowMessages: Boolean(allowMessages),
    slashCommandsOnly: Boolean(slashCommandsOnly),
    allowedCommands: sanitizeCommandList(allowedCommands),
    requiredPrefixes: sanitizeStringList(requiredPrefixes),
    bannedWords: sanitizeStringList(bannedWords),
    allowedUserIds: sanitizeStringList(allowedUserIds),
    allowedRoleIds: sanitizeStringList(allowedRoleIds),
    notifyEnabled: Boolean(notifyEnabled),
    notifyContent: typeof notifyContent === "string" ? notifyContent : undefined,
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
    notifyEnabled,
    notifyContent,
  } = req.body;
  const row = await prisma.channelLock.update({
    where: { id: req.params.id },
    data: {
      allowImages: Boolean(allowImages),
      allowLinks: Boolean(allowLinks),
      allowFiles: Boolean(allowFiles),
      allowMessages: Boolean(allowMessages),
      slashCommandsOnly: Boolean(slashCommandsOnly),
      allowedCommands: sanitizeCommandList(allowedCommands),
      requiredPrefixes: sanitizeStringList(requiredPrefixes),
      bannedWords: sanitizeStringList(bannedWords),
      allowedUserIds: sanitizeStringList(allowedUserIds),
      allowedRoleIds: sanitizeStringList(allowedRoleIds),
      notifyEnabled: Boolean(notifyEnabled),
      notifyContent: typeof notifyContent === "string" ? notifyContent : undefined,
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
