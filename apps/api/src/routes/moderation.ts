import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

interface AutomodConfig {
  bannedWordsEnabled: boolean;
  bannedWords: string[];
  repeatedTextEnabled: boolean;
  serverInvitesEnabled: boolean;
  externalLinksEnabled: boolean;
  excessiveCapsEnabled: boolean;
  excessiveEmojisEnabled: boolean;
  excessiveSpoilersEnabled: boolean;
  excessiveMentionsEnabled: boolean;
  zalgoEnabled: boolean;
  antiSpamEnabled: boolean;
  immuneRoleIds: string[];
}

const DEFAULT_CONFIG: AutomodConfig = {
  bannedWordsEnabled: false,
  bannedWords: [],
  repeatedTextEnabled: false,
  serverInvitesEnabled: false,
  externalLinksEnabled: false,
  excessiveCapsEnabled: false,
  excessiveEmojisEnabled: false,
  excessiveSpoilersEnabled: false,
  excessiveMentionsEnabled: false,
  zalgoEnabled: false,
  antiSpamEnabled: true,
  immuneRoleIds: [],
};

// Automod settings live on the MODERATION module's `config` JSON blob —
// apps/bot/src/events/messageCreate.ts reads this same row at message time.
router.get("/guilds/:guildId/moderation", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.moduleToggle.findUnique({
    where: { guildId_key: { guildId: req.params.guildId, key: "MODERATION" } },
  });
  res.json({ enabled: row?.enabled ?? false, config: { ...DEFAULT_CONFIG, ...((row?.config as object) ?? {}) } });
});

router.put("/guilds/:guildId/moderation", requireAuth, requireGuildPermission, async (req, res) => {
  const config = req.body as Partial<AutomodConfig>;

  const row = await prisma.moduleToggle.upsert({
    where: { guildId_key: { guildId: req.params.guildId, key: "MODERATION" } },
    create: { guildId: req.params.guildId, key: "MODERATION", enabled: false, config: { ...DEFAULT_CONFIG, ...config } },
    update: { config: { ...DEFAULT_CONFIG, ...config } },
  });

  res.json(row);
});

export default router;
