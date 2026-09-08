import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

interface AutomodConfig {
  bannedWords: string[];
  antiLink: boolean;
  spamCap: boolean;
}

const DEFAULT_CONFIG: AutomodConfig = { bannedWords: [], antiLink: false, spamCap: true };

// Automod settings live on the MODERATION module's `config` JSON blob —
// apps/bot/src/events/messageCreate.ts reads this same row at message time.
router.get("/guilds/:guildId/moderation", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.moduleToggle.findUnique({
    where: { guildId_key: { guildId: req.params.guildId, key: "MODERATION" } },
  });
  res.json({ enabled: row?.enabled ?? false, config: (row?.config as unknown as AutomodConfig) ?? DEFAULT_CONFIG });
});

router.put("/guilds/:guildId/moderation", requireAuth, requireGuildPermission, async (req, res) => {
  const { bannedWords, antiLink, spamCap } = req.body as Partial<AutomodConfig>;

  const row = await prisma.moduleToggle.upsert({
    where: { guildId_key: { guildId: req.params.guildId, key: "MODERATION" } },
    create: { guildId: req.params.guildId, key: "MODERATION", enabled: false, config: { bannedWords, antiLink, spamCap } },
    update: { config: { bannedWords, antiLink, spamCap } },
  });

  res.json(row);
});

export default router;
