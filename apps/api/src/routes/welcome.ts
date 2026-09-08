import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/welcome", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(
    config ?? {
      guildId: req.params.guildId,
      channelId: null,
      welcomeText: "Welcome to {server}, {user}!",
      goodbyeText: "{user} has left {server}.",
      embedColor: "#00E5FF",
    }
  );
});

router.put("/guilds/:guildId/welcome", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, welcomeText, goodbyeText, embedColor } = req.body as {
    channelId?: string;
    welcomeText?: string;
    goodbyeText?: string;
    embedColor?: string;
  };

  const config = await prisma.welcomeConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId, welcomeText, goodbyeText, embedColor },
    update: { channelId, welcomeText, goodbyeText, embedColor },
  });

  res.json(config);
});

export default router;
