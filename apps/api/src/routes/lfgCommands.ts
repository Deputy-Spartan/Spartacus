import { Router } from "express";
import { Prisma, prisma, type LfgCategory } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { createGuildApplicationCommand, deleteGuildApplicationCommand, type AppCommandOption } from "../lib/discordRest";

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
  savedEmbedId?: string | null;
  errorMessage?: string;
  wrongChannelMessage?: string;
}

interface CategoryBody {
  name: string;
  channelId: string;
  roleId?: string | null;
  message?: string | null;
  sortOrder?: number;
}

// Slash command definition depends on the command's own categories — when
// there are any, picking one is required (Discord requires required options
// before optional ones, so "category" always comes first). Choice values are
// category ids rather than names so renaming a category later doesn't break
// anything already posted or cached client-side.
function commandOptions(categories: Pick<LfgCategory, "id" | "name">[]): AppCommandOption[] {
  const opts: AppCommandOption[] = [];
  if (categories.length) {
    opts.push({
      type: 3,
      name: "category",
      description: "Which playlist or queue this is for",
      required: true,
      choices: categories.slice(0, 25).map((c) => ({ name: c.name.slice(0, 100), value: c.id })),
    });
  }
  opts.push({ type: 3, name: "message", description: "Optional note shown in the announcement", required: false });
  return opts;
}

// Re-registers the /trigger command with Discord using its current
// categories as choices, and stores the new command id. Called any time a
// category is added, edited, removed or reordered, since the choice list is
// baked into the command definition at registration time.
async function reregisterCommand(guildId: string, cmd: { id: string; trigger: string; description: string; discordCommandId: string | null }) {
  const categories = await prisma.lfgCategory.findMany({ where: { lfgCommandId: cmd.id }, orderBy: { sortOrder: "asc" } });
  if (cmd.discordCommandId) await deleteGuildApplicationCommand(guildId, cmd.discordCommandId);
  const result = await createGuildApplicationCommand(guildId, {
    name: cmd.trigger,
    description: cmd.description,
    options: commandOptions(categories),
  });
  if ("error" in result) return { error: result.error };
  await prisma.lfgCommand.update({ where: { id: cmd.id }, data: { discordCommandId: result.id } });
  return { categories };
}

router.get("/guilds/:guildId/lfg-commands", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.lfgCommand.findMany({
    where: { guildId: req.params.guildId },
    include: { categories: { orderBy: { sortOrder: "asc" } } },
    orderBy: { trigger: "asc" },
  });
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
    options: commandOptions([]),
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
      savedEmbedId: body.savedEmbedId ?? null,
      errorMessage: body.errorMessage?.trim() || "You need to be in a voice channel to use this command.",
      wrongChannelMessage: body.wrongChannelMessage?.trim() || "This command can only be used in {channel}.",
    },
    include: { categories: true },
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
    const categories = await prisma.lfgCategory.findMany({ where: { lfgCommandId: id }, orderBy: { sortOrder: "asc" } });
    if (existing.discordCommandId) await deleteGuildApplicationCommand(guildId, existing.discordCommandId);
    const result = await createGuildApplicationCommand(guildId, {
      name: trigger,
      description: body.description?.trim() || existing.description,
      options: commandOptions(categories),
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
      savedEmbedId: body.savedEmbedId !== undefined ? body.savedEmbedId : undefined,
      errorMessage: body.errorMessage?.trim() || undefined,
      wrongChannelMessage: body.wrongChannelMessage?.trim() || undefined,
    },
    include: { categories: { orderBy: { sortOrder: "asc" } } },
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
  await prisma.lfgCommand.delete({ where: { id: req.params.id } }); // cascades to its categories
  res.status(204).send();
});

// ---- Categories (playlists/queues within one LFG command) ----

router.post("/guilds/:guildId/lfg-commands/:id/categories", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId, id } = req.params;
  const cmd = await prisma.lfgCommand.findUnique({ where: { id } });
  if (!cmd || cmd.guildId !== guildId) return res.status(404).json({ error: "LFG command not found" });

  const body = req.body as CategoryBody;
  const name = (body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Enter a name for this category." });
  if (!body.channelId) return res.status(400).json({ error: "Pick a channel for this category." });

  const dup = await prisma.lfgCategory.findUnique({ where: { lfgCommandId_name: { lfgCommandId: id, name } } });
  if (dup) return res.status(409).json({ error: `A category named "${name}" already exists on this command.` });

  const count = await prisma.lfgCategory.count({ where: { lfgCommandId: id } });
  if (count >= 25) return res.status(400).json({ error: "A command can have at most 25 categories (Discord's own limit on choices)." });

  await prisma.lfgCategory.create({
    data: { lfgCommandId: id, guildId, name, channelId: body.channelId, roleId: body.roleId || null, message: body.message || null, sortOrder: count },
  });

  const sync = await reregisterCommand(guildId, cmd);
  if ("error" in sync) return res.status(502).json({ error: `Discord rejected this command: ${sync.error}` });
  res.status(201).json(sync.categories);
});

router.put("/guilds/:guildId/lfg-commands/:id/categories/:categoryId", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId, id, categoryId } = req.params;
  const cmd = await prisma.lfgCommand.findUnique({ where: { id } });
  if (!cmd || cmd.guildId !== guildId) return res.status(404).json({ error: "LFG command not found" });
  const existing = await prisma.lfgCategory.findUnique({ where: { id: categoryId } });
  if (!existing || existing.lfgCommandId !== id) return res.status(404).json({ error: "Category not found" });

  const body = req.body as Partial<CategoryBody>;
  const name = body.name !== undefined ? body.name.trim() : existing.name;
  if (!name) return res.status(400).json({ error: "Enter a name for this category." });

  if (name !== existing.name) {
    const dup = await prisma.lfgCategory.findUnique({ where: { lfgCommandId_name: { lfgCommandId: id, name } } });
    if (dup) return res.status(409).json({ error: `A category named "${name}" already exists on this command.` });
  }

  await prisma.lfgCategory.update({
    where: { id: categoryId },
    data: {
      name,
      channelId: body.channelId || existing.channelId,
      roleId: body.roleId !== undefined ? body.roleId || null : undefined,
      message: body.message !== undefined ? body.message || null : undefined,
    },
  });

  // Renaming changes the choice label shown in Discord, so always resync.
  const sync = await reregisterCommand(guildId, cmd);
  if ("error" in sync) return res.status(502).json({ error: `Discord rejected this command: ${sync.error}` });
  res.json(sync.categories);
});

router.delete("/guilds/:guildId/lfg-commands/:id/categories/:categoryId", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId, id, categoryId } = req.params;
  const cmd = await prisma.lfgCommand.findUnique({ where: { id } });
  if (!cmd || cmd.guildId !== guildId) return res.status(404).json({ error: "LFG command not found" });
  const existing = await prisma.lfgCategory.findUnique({ where: { id: categoryId } });
  if (!existing || existing.lfgCommandId !== id) return res.status(404).json({ error: "Category not found" });

  await prisma.lfgCategory.delete({ where: { id: categoryId } });
  const sync = await reregisterCommand(guildId, cmd);
  if ("error" in sync) return res.status(502).json({ error: `Discord rejected this command: ${sync.error}` });
  res.status(200).json(sync.categories);
});

export default router;
