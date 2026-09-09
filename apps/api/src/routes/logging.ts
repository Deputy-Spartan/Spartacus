import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

const DEFAULT_CONFIG = {
  logChannelId: null as string | null,

  // Moderation Events
  logMemberMuted: true,
  logMemberUnmuted: true,
  logModerationBan: true,
  logModerationUnban: true,

  // Message Events
  logEdits: true,
  logDeletes: true,
  logInvitePosted: false,

  // Member Events
  logNicknameChanged: false,
  logMemberBanned: true,
  logJoinsLeaves: true,
  logMemberUnbanned: true,
  logUserUpdated: false,

  // Role Events
  logRoleCreated: false,
  logRoleUpdated: false,
  logRoleDeleted: false,
  logMemberRolesChanged: false,

  // Voice Events
  logVoice: false,

  // Server Events
  logServerEdited: false,
  logEmojisUpdated: false,

  // Channel Events
  logChannelCreated: false,
  logChannelUpdated: false,
  logChannelDeleted: false,

  // Ignored / Additional settings
  ignoredChannelIds: [] as string[],
  ignoreBots: true,
  hideThumbnails: false,
};

const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG) as (keyof typeof DEFAULT_CONFIG)[];

router.get("/guilds/:guildId/logging", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.loggingConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(config ?? { guildId: req.params.guildId, ...DEFAULT_CONFIG });
});

router.put("/guilds/:guildId/logging", requireAuth, requireGuildPermission, async (req, res) => {
  const data: Record<string, unknown> = {};
  for (const key of CONFIG_KEYS) {
    if (req.body[key] !== undefined) data[key] = req.body[key];
  }

  const config = await prisma.loggingConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...DEFAULT_CONFIG, ...data },
    update: data,
  });
  res.json(config);
});

export default router;
