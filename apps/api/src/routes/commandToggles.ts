import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();
const SNOWFLAKE = /^\d{15,25}$/;

// Every command the bot has (built-in and the server's own), with its on/off,
// its role lock, its section and its sub-commands. Used by the All commands tab.
router.get("/guilds/:guildId/command-toggles", requireAuth, requireGuildPermission, async (req, res) => {
  // Imported lazily so a bot-side startup error (e.g. missing intents)
  // can't take this route down with it — this only needs the command
  // registry, not a live gateway connection.
  const { commands, sectionOfCommand } = await import("@spartacus/bot");
  const [toggles, customCommands] = await Promise.all([
    prisma.commandToggle.findMany({ where: { guildId: req.params.guildId } }),
    prisma.customSlashCommand.findMany({ where: { guildId: req.params.guildId } }),
  ]);
  const byName = new Map(toggles.map((t) => [t.commandName, t]));

  const builtIn = [...commands.values()].map((c) => {
    const json = c.data.toJSON();
    const subs = ((json.options ?? []) as Array<{ type: number; name: string; options?: Array<{ type: number; name: string }> }>).flatMap((o) =>
      o.type === 1 ? [o.name] : o.type === 2 ? (o.options ?? []).filter((x) => x.type === 1).map((x) => `${o.name} ${x.name}`) : []
    );
    return {
      name: json.name,
      description: json.description,
      moduleKey: c.moduleKey ?? null,
      section: sectionOfCommand(json.name),
      subs,
      staff: json.default_member_permissions != null,
      enabled: byName.get(json.name)?.enabled !== false,
      minRoleId: byName.get(json.name)?.minRoleId ?? null,
    };
  });

  const custom = customCommands.map((c) => ({
    name: c.name,
    description: c.description,
    moduleKey: "CUSTOM",
    section: { emoji: "⭐", name: "This server's commands" },
    subs: [] as string[],
    staff: c.access === "MODS" || c.access === "ADMINS",
    enabled: byName.get(c.name)?.enabled !== false,
    minRoleId: byName.get(c.name)?.minRoleId ?? null,
  }));

  res.json([...builtIn, ...custom].sort((a, b) => a.name.localeCompare(b.name)));
});

// Change a command's on/off and/or its role lock (minRoleId: null = anyone).
router.patch("/guilds/:guildId/command-toggles/:name", requireAuth, requireGuildPermission, async (req, res) => {
  const b = (req.body ?? {}) as { enabled?: unknown; minRoleId?: unknown };
  const data: { enabled?: boolean; minRoleId?: string | null } = {};
  if (typeof b.enabled === "boolean") data.enabled = b.enabled;
  if ("minRoleId" in b) data.minRoleId = typeof b.minRoleId === "string" && SNOWFLAKE.test(b.minRoleId) ? b.minRoleId : null;
  const toggle = await prisma.commandToggle.upsert({
    where: { guildId_commandName: { guildId: req.params.guildId, commandName: req.params.name } },
    create: { guildId: req.params.guildId, commandName: req.params.name, enabled: data.enabled ?? true, minRoleId: data.minRoleId ?? null },
    update: data,
  });
  res.json(toggle);
});

export default router;
