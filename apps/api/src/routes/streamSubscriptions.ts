import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get(
  "/guilds/:guildId/stream-subscriptions",
  requireAuth,
  requireGuildPermission,
  async (req, res) => {
    const subs = await prisma.streamSubscription.findMany({ where: { guildId: req.params.guildId } });
    res.json(subs);
  }
);

router.post(
  "/guilds/:guildId/stream-subscriptions",
  requireAuth,
  requireGuildPermission,
  async (req, res) => {
    const { platform, channelName, announceChannelId } = req.body as {
      platform: "twitch" | "youtube";
      channelName: string;
      announceChannelId: string;
    };

    const sub = await prisma.streamSubscription.create({
      data: { guildId: req.params.guildId, platform, channelName, announceChannelId },
    });

    res.status(201).json(sub);
  }
);

router.delete(
  "/guilds/:guildId/stream-subscriptions/:id",
  requireAuth,
  requireGuildPermission,
  async (req, res) => {
    await prisma.streamSubscription.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }
);

export default router;
