import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/logging", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.loggingConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(
    config ?? {
      guildId: req.params.guildId,
      logChannelId: null,
      logEdits: true,
      logDeletes: true,
      logJoinsLeaves: true,
      logVoice: false,
    }
  );
});

router.put("/guilds/:guildId/logging", requireAuth, requireGuildPermission, async (req, res) => {
  const { logChannelId, logEdits, logDeletes, logJoinsLeaves, logVoice } = req.body;
  const config = await prisma.loggingConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, logChannelId, logEdits, logDeletes, logJoinsLeaves, logVoice },
    update: { logChannelId, logEdits, logDeletes, logJoinsLeaves, logVoice },
  });
  res.json(config);
});

export default router;
