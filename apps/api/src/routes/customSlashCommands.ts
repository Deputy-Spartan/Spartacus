import { Router } from "express";
import { prisma, Prisma, type CustomSlashCommand } from "@spartacus/db";
import { MODULE_KEYS, cleanCommand, discordCommandBody, type CommandDraft } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { createGuildApplicationCommand, deleteGuildApplicationCommand } from "../lib/discordRest";
import { memberNames } from "../lib/memberNames";

// Custom Commands → Slash commands (the Command Builder). Each command is
// registered with Discord for this server only; the bot runs its steps.
const router = Router();
const P = "/guilds/:guildId/custom-slash-commands";
const MAX_COMMANDS = 100; // Discord's limit per server

// The JSON parts, typed the way the database wants them.
const toData = (c: CommandDraft) => ({ ...c, inputs: c.inputs as unknown as Prisma.InputJsonValue, steps: c.steps as unknown as Prisma.InputJsonValue, roleIds: c.roleIds, channelIds: c.channelIds });

const view = (c: CustomSlashCommand) => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() });

// Built-in Spartacus command names can't be reused.
async function builtInNames(): Promise<Set<string>> {
  try {
    const { commands } = await import("@spartacus/bot");
    return new Set([...commands.keys()]);
  } catch {
    return new Set();
  }
}

async function register(guildId: string, c: CommandDraft): Promise<{ id: string } | { error: string }> {
  return createGuildApplicationCommand(guildId, discordCommandBody(c) as never);
}

router.get(P, requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.customSlashCommand.findMany({ where: { guildId: req.params.guildId }, orderBy: { name: "asc" } });
  res.json(rows.map(view));
});

router.post(P, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const c = cleanCommand(req.body ?? {}, MODULE_KEYS);
  if (typeof c === "string") return res.status(400).json({ error: c });
  if ((await builtInNames()).has(c.name)) return res.status(400).json({ error: `/${c.name} is already a Spartacus command. Pick another name.` });
  if (await prisma.customSlashCommand.findUnique({ where: { guildId_name: { guildId, name: c.name } } })) return res.status(400).json({ error: `You already have /${c.name}.` });
  if ((await prisma.customSlashCommand.count({ where: { guildId } })) >= MAX_COMMANDS) return res.status(400).json({ error: `Discord allows ${MAX_COMMANDS} custom commands per server.` });
  let discordCommandId: string | null = null;
  if (c.enabled) {
    const r = await register(guildId, c);
    if ("error" in r) return res.status(502).json({ error: `Discord didn't accept this command: ${r.error.slice(0, 300)}` });
    discordCommandId = r.id;
  }
  const row = await prisma.customSlashCommand.create({ data: { guildId, ...toData(c), discordCommandId } });
  res.status(201).json(view(row));
});

router.put(`${P}/:id`, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const existing = await prisma.customSlashCommand.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== guildId) return res.status(404).json({ error: "Command not found." });
  const c = cleanCommand(req.body ?? {}, MODULE_KEYS);
  if (typeof c === "string") return res.status(400).json({ error: c });
  if (c.name !== existing.name) {
    if ((await builtInNames()).has(c.name)) return res.status(400).json({ error: `/${c.name} is already a Spartacus command. Pick another name.` });
    if (await prisma.customSlashCommand.findUnique({ where: { guildId_name: { guildId, name: c.name } } })) return res.status(400).json({ error: `You already have /${c.name}.` });
  }
  let discordCommandId = existing.discordCommandId;
  if (c.enabled) {
    // Re-registering by name updates it in place; a new name is a new command.
    const r = await register(guildId, c);
    if ("error" in r) return res.status(502).json({ error: `Discord didn't accept this command: ${r.error.slice(0, 300)}` });
    if (existing.discordCommandId && existing.discordCommandId !== r.id) await deleteGuildApplicationCommand(guildId, existing.discordCommandId);
    discordCommandId = r.id;
  } else if (existing.discordCommandId) {
    await deleteGuildApplicationCommand(guildId, existing.discordCommandId);
    discordCommandId = null;
  }
  const row = await prisma.customSlashCommand.update({ where: { id: existing.id }, data: { ...toData(c), discordCommandId } });
  res.json(view(row));
});

router.delete(`${P}/:id`, requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.customSlashCommand.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) return res.status(404).json({ error: "Command not found." });
  if (existing.discordCommandId) await deleteGuildApplicationCommand(req.params.guildId, existing.discordCommandId);
  await prisma.customSlashCommand.delete({ where: { id: existing.id } });
  res.status(204).send();
});

// The Command Log.
router.get("/guilds/:guildId/custom-command-runs", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const commandId = typeof req.query.commandId === "string" && req.query.commandId ? req.query.commandId : undefined;
  const rows = await prisma.customCommandRun.findMany({ where: { guildId, ...(commandId ? { commandId } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
  const names = await memberNames(guildId, rows.map((r) => r.userId));
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), userName: names[r.userId] ?? r.userId })));
});

export default router;
