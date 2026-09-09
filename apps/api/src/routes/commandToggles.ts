import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/command-toggles", requireAuth, requireGuildPermission, async (req, res) => {
  // Imported lazily so a bot-side startup error (e.g. missing intents)
  // can't take this route down with it — this only needs the command
  // registry, not a live gateway connection.
  const { commands } = await import("@spartacus/bot");
  const [toggles, customCommands] = await Promise.all([
    prisma.commandToggle.findMany({ where: { guildId: req.params.guildId } }),
    prisma.customSlashCommand.findMany({ where: { guildId: req.params.guildId } }),
  ]);
  const disabled = new Set(toggles.filter((t) => !t.enabled).map((t) => t.commandName));

  const builtIn = [...commands.values()].map((c) => ({
    name: c.data.name,
    description: c.data.description,
    moduleKey: c.moduleKey ?? null,
    enabled: !disabled.has(c.data.name),
  }));

  const custom = customCommands.map((c) => ({
    name: c.name,
    description: c.description,
    moduleKey: "CUSTOM",
    enabled: !disabled.has(c.name),
  }));

  res.json([...builtIn, ...custom].sort((a, b) => a.name.localeCompare(b.name)));
});

router.patch("/guilds/:guildId/command-toggles/:name", requireAuth, requireGuildPermission, async (req, res) => {
  const { enabled } = req.body as { enabled: boolean };

  const toggle = await prisma.commandToggle.upsert({
    where: { guildId_commandName: { guildId: req.params.guildId, commandName: req.params.name } },
    create: { guildId: req.params.guildId, commandName: req.params.name, enabled: Boolean(enabled) },
    update: { enabled: Boolean(enabled) },
  });
  res.json(toggle);
});

export default router;
