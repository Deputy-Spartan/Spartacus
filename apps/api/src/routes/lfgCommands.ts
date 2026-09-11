import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { createGuildApplicationCommand, deleteGuildApplicationCommand } from "../lib/discordRest";

const router = Router();

const TRIGGER_PATTERN = /^[a-z0-9_-]{1,32}$/;
const MODES = new Set(["plain", "embed"]);

interface LfgBody {
  trigger: string;
  description?: string;
  channelId: string;
  roleId?: string | null;
  includeSender?: boolean;
  enabled?: boolean;
  mode?: string;
  message?: string | null;
  embedTitle?: string | null;
  embedDescription?: string | null;
  embedColor?: string | null;
  embedExtra?: Prisma.InputJsonValue | null;
  errorMessage?: string;
  wrongChannelMessage?: string;
}

// Slash command definition is identical regardless of mode — the optional
// "message" option is what lets someone type /trigger message:"need 2 more"
// and have that text show up in the announcement the same way trailing text
// after "!trigger" does for the prefix version.
function commandOptions() {
  return [{ type: 3, name: "message", description: "Optional note shown in the announcement", required: false }];
}

router.get("/guilds/:guildId/lfg-commands", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.lfgCommand.findMany({ where: { guildId: req.params.guildId }, orderBy: { trigger: "asc" } });
  res.json(rows);
});

router.post("/guilds/:guildId/lfg-commands", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const body = req.body as LfgBody;
  const trigger = (body.trigger || "").trim().toLowerCase();
  const mode = MODES.has(body.mode || "") ? (body.mode as string) : "plain";

  if (!TRIGGER_PATTERN.test(trigger)) {
    return res.status(400).json({ error: "Trigger must be lowercase letters, numbers, - or _, 1-32 characters." });
  }
  if (!body.channelId) {
    return res.status(400).json({ error: "A channel is required." });
  }

  const [dupTrigger, dupChannel] = await Promise.all([
    prisma.lfgCommand.findUnique({ where: { guildId_trigger: { guildId, trigger } } }),
    prisma.lfgCommand.findUnique({ where: { guildId_channelId: { guildId, channelId: body.channelId } } }),
  ]);
  if (dupTrigger) return res.status(409).json({ error: `"!${trigger}" is already used by another LFG command.` });
  if (dupChannel) return res.status(409).json({ error: `That channel is already locked to "!${dupChannel.trigger}" — pick a different channel.` });

  const result = await createGuildApplicationCommand(guildId, {
    name: trigger,
    description: body.description?.trim() || "Post that you're looking for a group.",
    options: commandOptions(),
  });
  if ("error" in result) {
    return res.status(502).json({ error: `Discord rejected this command: ${result.error}` });
  }

  const row = await prisma.lfgCommand.create({
    data: {
      guildId,
      trigger,
      description: body.description?.trim() || "Post that you're looking for a group.",
      discordCommandId: result.id,
      channelId: body.channelId,
      roleId: body.roleId || null,
      includeSender: body.includeSender ?? true,
      enabled: body.enabled ?? true,
      mode,
      message: body.message ?? null,
      embedTitle: body.embedTitle ?? null,
      embedDescription: body.embedDescription ?? null,
      embedColor: body.embedColor ?? null,
      embedExtra: (body.embedExtra ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      errorMessage: body.errorMessage?.trim() || "You need to be in a voice channel to use this command.",
      wrongChannelMessage: body.wrongChannelMessage?.trim() || "This command can only be used in {channel}.",
    },
  });
  res.status(201).json(row);
});

router.put("/guilds/:guildId/lfg-commands/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId, id } = req.params;
  const existing = await prisma.lfgCommand.findUnique({ where: { id } });
  if (!existing || existing.guildId !== guildId) {
    return res.status(404).json({ error: "LFG command not found" });
  }

  const body = req.body as LfgBody;
  const trigger = body.trigger !== undefined ? body.trigger.trim().toLowerCase() : existing.trigger;
  const mode = body.mode !== undefined ? (MODES.has(body.mode) ? body.mode : existing.mode) : existing.mode;

  if (!TRIGGER_PATTERN.test(trigger)) {
    return res.status(400).json({ error: "Trigger must be lowercase letters, numbers, - or _, 1-32 characters." });
  }
  const channelId = body.channelId || existing.channelId;

  if (trigger !== existing.trigger) {
    const dupTrigger = await prisma.lfgCommand.findUnique({ where: { guildId_trigger: { guildId, trigger } } });
    if (dupTrigger) return res.status(409).json({ error: `"!${trigger}" is already used by another LFG command.` });
  }
  if (channelId !== existing.channelId) {
    const dupChannel = await prisma.lfgCommand.findUnique({ where: { guildId_channelId: { guildId, channelId } } });
    if (dupChannel) return res.status(409).json({ error: `That channel is already locked to "!${dupChannel.trigger}" — pick a different channel.` });
  }

  // Discord has no rename-in-place for a command's name via this endpoint
  // path we use elsewhere in the app — simplest correct option is delete
  // the old one and register a fresh one, same as if trigger were untouched
  // but re-registering keeps the description in sync too.
  let discordCommandId = existing.discordCommandId;
  if (trigger !== existing.trigger || (body.description !== undefined && body.description !== existing.description)) {
    if (existing.discordCommandId) await deleteGuildApplicationCommand(guildId, existing.discordCommandId);
    const result = await createGuildApplicationCommand(guildId, {
      name: trigger,
      description: body.description?.trim() || existing.description,
      options: commandOptions(),
    });
    if ("error" in result) {
      return res.status(502).json({ error: `Discord rejected this command: ${result.error}` });
    }
    discordCommandId = result.id;
  }

  const row = await prisma.lfgCommand.update({
    where: { id },
    data: {
      trigger,
      description: body.description?.trim() || existing.description,
      discordCommandId,
      channelId,
      roleId: body.roleId !== undefined ? body.roleId || null : undefined,
      includeSender: body.includeSender,
      enabled: body.enabled,
      mode,
      message: body.message !== undefined ? body.message : undefined,
      embedTitle: body.embedTitle !== undefined ? body.embedTitle : undefined,
      embedDescription: body.embedDescription !== undefined ? body.embedDescription : undefined,
      embedColor: body.embedColor !== undefined ? body.embedColor : undefined,
      embedExtra: body.embedExtra !== undefined ? ((body.embedExtra ?? Prisma.JsonNull) as Prisma.InputJsonValue) : undefined,
      errorMessage: body.errorMessage?.trim() || undefined,
      wrongChannelMessage: body.wrongChannelMessage?.trim() || undefined,
    },
  });
  res.json(row);
});

router.delete("/guilds/:guildId/lfg-commands/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.lfgCommand.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "LFG command not found" });
  }
  if (existing.discordCommandId) {
    await deleteGuildApplicationCommand(req.params.guildId, existing.discordCommandId);
  }
  await prisma.lfgCommand.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
