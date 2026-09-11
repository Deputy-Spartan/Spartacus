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

router.get("/guilds/:guildId/commands", requireAuth, requireGuildPermission, async (req, res) => {
  const commands = await prisma.customCommand.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { trigger: "asc" },
  });
  res.json(commands);
});

router.post("/guilds/:guildId/commands", requireAuth, requireGuildPermission, async (req, res) => {
  const { trigger, response, embedEnabled, embedTitle, embedColor, buttons, embedExtra, savedEmbedId } = req.body as {
    trigger: string;
    response: string;
    embedEnabled?: boolean;
    embedTitle?: string;
    embedColor?: string;
    buttons?: unknown;
    embedExtra?: Prisma.InputJsonValue;
    savedEmbedId?: string | null;
  };

  const data = {
    response,
    embedEnabled: Boolean(embedEnabled),
    embedTitle: embedTitle || null,
    embedColor: embedColor || null,
    buttons: sanitizeButtons(buttons),
    embedExtra: embedExtra ?? Prisma.JsonNull,
    savedEmbedId: savedEmbedId || null,
  };

  const command = await prisma.customCommand.upsert({
    where: { guildId_trigger: { guildId: req.params.guildId, trigger } },
    create: { guildId: req.params.guildId, trigger, ...data },
    update: data,
  });
  res.status(201).json(command);
});

router.put("/guilds/:guildId/commands/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.customCommand.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Command not found" });
  }

  const { response, embedEnabled, embedTitle, embedColor, buttons, embedExtra, savedEmbedId } = req.body as {
    response: string;
    embedEnabled?: boolean;
    embedTitle?: string;
    embedColor?: string;
    buttons?: unknown;
    embedExtra?: Prisma.InputJsonValue;
    savedEmbedId?: string | null;
  };

  const command = await prisma.customCommand.update({
    where: { id: req.params.id },
    data: {
      response,
      embedEnabled: Boolean(embedEnabled),
      embedTitle: embedTitle || null,
      embedColor: embedColor || null,
      buttons: sanitizeButtons(buttons),
      embedExtra: embedExtra ?? Prisma.JsonNull,
      savedEmbedId: savedEmbedId || null,
    },
  });
  res.json(command);
});

router.delete("/guilds/:guildId/commands/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.customCommand.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
