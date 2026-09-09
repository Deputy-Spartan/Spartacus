import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/ai-config", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.aiConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(
    config ?? {
      guildId: req.params.guildId,
      chatChannelId: null,
      chatSystemPrompt: null,
      moderationEnabled: false,
    }
  );
});

router.put("/guilds/:guildId/ai-config", requireAuth, requireGuildPermission, async (req, res) => {
  const { chatChannelId, chatSystemPrompt, moderationEnabled } = req.body as {
    chatChannelId?: string | null;
    chatSystemPrompt?: string | null;
    moderationEnabled?: boolean;
  };

  const data = { chatChannelId, chatSystemPrompt, moderationEnabled: Boolean(moderationEnabled) };
  const config = await prisma.aiConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...data },
    update: data,
  });
  res.json(config);
});

export default router;
