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
      embedEnabled: false,
      embedTitle: null,
      buttons: [],
    }
  );
});

router.put("/guilds/:guildId/welcome", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, welcomeText, goodbyeText, embedColor, embedEnabled, embedTitle, buttons, embedExtra, savedEmbedId } = req.body as {
    channelId?: string;
    welcomeText?: string;
    goodbyeText?: string;
    embedColor?: string;
    embedEnabled?: boolean;
    embedTitle?: string;
    buttons?: unknown;
    embedExtra?: Prisma.InputJsonValue;
    savedEmbedId?: string | null;
  };

  const data = {
    channelId,
    welcomeText,
    goodbyeText,
    embedColor,
    embedEnabled: Boolean(embedEnabled),
    embedTitle: embedTitle || null,
    buttons: sanitizeButtons(buttons),
    embedExtra: embedExtra ?? Prisma.JsonNull,
    savedEmbedId: savedEmbedId || null,
  };

  const config = await prisma.welcomeConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...data },
    update: data,
  });

  res.json(config);
});

// ---- Greetings (random join-message pool with a wave button) ----

router.get("/guilds/:guildId/welcome-greetings", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.welcomeGreeting.findMany({ where: { guildId: req.params.guildId }, orderBy: { sortOrder: "asc" } });
  res.json(rows);
});

router.post("/guilds/:guildId/welcome-greetings", requireAuth, requireGuildPermission, async (req, res) => {
  const { text, buttonLabel } = req.body as { text?: string; buttonLabel?: string };
  const count = await prisma.welcomeGreeting.count({ where: { guildId: req.params.guildId } });
  const row = await prisma.welcomeGreeting.create({
    data: {
      guildId: req.params.guildId,
      text: text || "Welcome to {server}, {user}!",
      buttonLabel: buttonLabel || "👋 Wave to say hi!",
      sortOrder: count,
    },
  });
  res.status(201).json(row);
});

router.patch("/guilds/:guildId/welcome-greetings/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const fields = ["text", "buttonLabel", "enabled", "sortOrder"];
  const data: Record<string, unknown> = {};
  for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
  const row = await prisma.welcomeGreeting.update({ where: { id: req.params.id }, data });
  res.json(row);
});

router.delete("/guilds/:guildId/welcome-greetings/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.welcomeGreeting.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
