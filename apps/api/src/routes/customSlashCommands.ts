import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { createGuildApplicationCommand, deleteGuildApplicationCommand } from "../lib/discordRest";

const router = Router();

const NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;
const ACTION_TYPES = new Set(["SEND_MESSAGE", "GIVE_ROLE", "REMOVE_ROLE", "ADD_CURRENCY", "POST_EMBED"]);

function sanitizeButtons(input: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(input)) return [];
  return input
    .filter((b): b is { label: string; url: string } => typeof b?.label === "string" && typeof b?.url === "string")
    .slice(0, 5)
    .map((b) => ({ label: b.label.slice(0, 80), url: b.url }));
}

// The Discord-side command shape depends entirely on the action — this is
// what makes running the resulting command mean the same thing every time
// (e.g. GIVE_ROLE always shows a "user" picker in Discord's UI).
function buildCommandOptions(actionType: string) {
  if (actionType === "GIVE_ROLE" || actionType === "REMOVE_ROLE") {
    return [{ type: 6, name: "user", description: "Member to target (defaults to you)", required: false }];
  }
  if (actionType === "ADD_CURRENCY") {
    return [{ type: 6, name: "user", description: "Member to give currency to", required: true }];
  }
  return [];
}

router.get("/guilds/:guildId/custom-slash-commands", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.customSlashCommand.findMany({ where: { guildId: req.params.guildId }, orderBy: { name: "asc" } });
  res.json(rows);
});

router.post("/guilds/:guildId/custom-slash-commands", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, description, actionType, ephemeralReply, messageText, roleId, currencyAmount, embedEnabled, embedTitle, embedDescription, embedColor, buttons } =
    req.body as {
      name: string;
      description: string;
      actionType: string;
      ephemeralReply?: boolean;
      messageText?: string;
      roleId?: string;
      currencyAmount?: number;
      embedEnabled?: boolean;
      embedTitle?: string;
      embedDescription?: string;
      embedColor?: string;
      buttons?: unknown;
    };

  if (!NAME_PATTERN.test(name)) {
    return res.status(400).json({ error: "Command name must be lowercase letters, numbers, - or _, 1-32 characters." });
  }
  if (!ACTION_TYPES.has(actionType)) {
    return res.status(400).json({ error: "Invalid action type." });
  }

  const result = await createGuildApplicationCommand(req.params.guildId, {
    name,
    description,
    options: buildCommandOptions(actionType),
  });
  if ("error" in result) {
    return res.status(502).json({ error: `Discord rejected this command: ${result.error}` });
  }

  const row = await prisma.customSlashCommand.create({
    data: {
      guildId: req.params.guildId,
      name,
      description,
      discordCommandId: result.id,
      actionType,
      ephemeralReply: ephemeralReply ?? true,
      messageText,
      roleId,
      currencyAmount,
      embedEnabled: Boolean(embedEnabled),
      embedTitle: embedTitle || null,
      embedDescription: embedDescription || null,
      embedColor: embedColor || null,
      buttons: sanitizeButtons(buttons),
    },
  });
  res.status(201).json(row);
});

router.delete("/guilds/:guildId/custom-slash-commands/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.customSlashCommand.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Command not found" });
  }

  if (existing.discordCommandId) {
    await deleteGuildApplicationCommand(req.params.guildId, existing.discordCommandId);
  }
  await prisma.customSlashCommand.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
