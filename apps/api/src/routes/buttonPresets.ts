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

router.get("/guilds/:guildId/button-presets", requireAuth, requireGuildPermission, async (req, res) => {
  const presets = await prisma.buttonPreset.findMany({ where: { guildId: req.params.guildId }, orderBy: { name: "asc" } });
  res.json(presets);
});

router.post("/guilds/:guildId/button-presets", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, buttons } = req.body as { name: string; buttons: unknown };
  const preset = await prisma.buttonPreset.upsert({
    where: { guildId_name: { guildId: req.params.guildId, name } },
    create: { guildId: req.params.guildId, name, buttons: sanitizeButtons(buttons) },
    update: { buttons: sanitizeButtons(buttons) },
  });
  res.status(201).json(preset);
});

router.delete("/guilds/:guildId/button-presets/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.buttonPreset.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Preset not found" });
  }
  await prisma.buttonPreset.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
