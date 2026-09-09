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

router.get("/guilds/:guildId/saved-embeds", requireAuth, requireGuildPermission, async (req, res) => {
  const embeds = await prisma.savedEmbed.findMany({ where: { guildId: req.params.guildId }, orderBy: { name: "asc" } });
  res.json(embeds);
});

router.post("/guilds/:guildId/saved-embeds", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, content, embedEnabled, embedTitle, embedDescription, embedColor, buttons } = req.body;
  const data = {
    content,
    embedEnabled: Boolean(embedEnabled),
    embedTitle: embedTitle || null,
    embedDescription: embedDescription || null,
    embedColor: embedColor || null,
    buttons: sanitizeButtons(buttons),
  };
  const embed = await prisma.savedEmbed.upsert({
    where: { guildId_name: { guildId: req.params.guildId, name } },
    create: { guildId: req.params.guildId, name, ...data },
    update: data,
  });
  res.status(201).json(embed);
});

router.delete("/guilds/:guildId/saved-embeds/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.savedEmbed.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Saved embed not found" });
  }
  await prisma.savedEmbed.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
