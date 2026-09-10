import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

const MANAGE_GUILD = 0x20;
const ADMINISTRATOR = 0x8;

router.post("/guilds/:guildId/clone-modules", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const { sourceGuildId } = req.body as { sourceGuildId?: string };
  if (!sourceGuildId) return res.status(400).json({ error: "sourceGuildId is required" });

  // requireGuildPermission already confirmed the caller manages the target
  // (URL) guild. Separately confirm they also manage the source guild they're
  // pulling module toggles FROM — otherwise anyone could clone the module
  // configuration of a server they don't administer.
  const sourceGuild = req.session?.guilds.find((g) => g.id === sourceGuildId);
  if (!sourceGuild) return res.status(403).json({ error: "No access to the source server" });
  const perms = BigInt(sourceGuild.permissions);
  const allowed = (perms & BigInt(MANAGE_GUILD)) !== 0n || (perms & BigInt(ADMINISTRATOR)) !== 0n;
  if (!allowed) return res.status(403).json({ error: "Insufficient permissions on the source server" });

  const sourceToggles = await prisma.moduleToggle.findMany({ where: { guildId: sourceGuildId } });

  let copied = 0;
  for (const toggle of sourceToggles) {
    await prisma.moduleToggle.upsert({
      where: { guildId_key: { guildId: req.params.guildId, key: toggle.key } },
      create: { guildId: req.params.guildId, key: toggle.key, enabled: toggle.enabled },
      update: { enabled: toggle.enabled },
    });
    copied++;
  }

  res.json({ copied });
});

export default router;
