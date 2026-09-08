import { Router } from "express";
import { prisma } from "@spartacus/db";
import { MODULE_KEYS } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// GET /guilds/:guildId/modules — full toggle state for the Modules grid
router.get("/guilds/:guildId/modules", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const rows = await prisma.moduleToggle.findMany({ where: { guildId } });

  const state = Object.fromEntries(
    MODULE_KEYS.map((key) => {
      const row = rows.find((r) => r.key === key);
      return [key, { enabled: row?.enabled ?? false, config: row?.config ?? null }];
    })
  );

  res.json(state);
});

// PATCH /guilds/:guildId/modules/:key — { enabled: boolean, config?: object }
router.patch(
  "/guilds/:guildId/modules/:key",
  requireAuth,
  requireGuildPermission,
  async (req, res) => {
    const { guildId, key } = req.params;
    const { enabled, config } = req.body as { enabled: boolean; config?: object };

    if (!MODULE_KEYS.includes(key as any)) {
      return res.status(400).json({ error: "Unknown module key" });
    }

    const updated = await prisma.moduleToggle.upsert({
      where: { guildId_key: { guildId, key: key as any } },
      create: { guildId, key: key as any, enabled, config: config ?? undefined },
      update: { enabled, ...(config !== undefined ? { config } : {}) },
    });

    res.json(updated);
  }
);

export default router;
