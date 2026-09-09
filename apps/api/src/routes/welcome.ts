import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

function sanitizeButtons(input: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(input)) return [];
  return input
    .filter((b): b is { label: string; url: string } => typeof b?.label === "string" && typeof b?.url === "string")
    .slice(0, 5)
    .map((b) => ({ label: b.label.slice(0, 80), url: b.url }));
}

router.get("/guilds/:guildId/welcome", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(
    config ?? {
      guildId: req.params.guildId,
      channelId: null,
      welcomeText: "Welcome to {server}, {user}!",
      goodbyeText: "{user} has left {server}.",
      embedColor: "#00E5FF",
      embedEnabled: true,
      embedTitle: null,
      buttons: [],
    }
  );
});

router.put("/guilds/:guildId/welcome", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, welcomeText, goodbyeText, embedColor, embedEnabled, embedTitle, buttons } = req.body as {
    channelId?: string;
    welcomeText?: string;
    goodbyeText?: string;
    embedColor?: string;
    embedEnabled?: boolean;
    embedTitle?: string;
    buttons?: unknown;
  };

  const data = {
    channelId,
    welcomeText,
    goodbyeText,
    embedColor,
    embedEnabled: Boolean(embedEnabled),
    embedTitle: embedTitle || null,
    buttons: sanitizeButtons(buttons),
  };

  const config = await prisma.welcomeConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...data },
    update: data,
  });

  res.json(config);
});

export default router;
