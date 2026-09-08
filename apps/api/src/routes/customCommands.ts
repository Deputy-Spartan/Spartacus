import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get(
  "/guilds/:guildId/commands",
  requireAuth,
  requireGuildPermission,
  async (req, res) => {
    const commands = await prisma.customCommand.findMany({
      where: { guildId: req.params.guildId },
      orderBy: { trigger: "asc" },
    });
    res.json(commands);
  }
);

router.post(
  "/guilds/:guildId/commands",
  requireAuth,
  requireGuildPermission,
  async (req, res) => {
    const { trigger, response } = req.body as { trigger: string; response: string };
    const command = await prisma.customCommand.upsert({
      where: { guildId_trigger: { guildId: req.params.guildId, trigger } },
      create: { guildId: req.params.guildId, trigger, response },
      update: { response },
    });
    res.status(201).json(command);
  }
);

router.delete(
  "/guilds/:guildId/commands/:id",
  requireAuth,
  requireGuildPermission,
  async (req, res) => {
    await prisma.customCommand.delete({ where: { id: req.params.id } });
    res.status(204).send();
  }
);

export default router;
