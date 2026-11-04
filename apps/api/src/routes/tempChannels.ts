import { Router } from "express";
import { prisma, Prisma } from "@spartacus/db";
import { cleanTempGameChoices } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

router.get("/guilds/:guildId/temp-channels/lobbies", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.tempChannelLobby.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/temp-channels/lobbies", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, lobbyChannelId, categoryId, nameFormat, userLimit, bitrate, deleteAfterEmptySec, pairTextChannel, hideTextFromNonMembers, gameChoices } =
    req.body;
  const row = await prisma.tempChannelLobby.create({
    data: {
      guildId: req.params.guildId,
      name,
      lobbyChannelId,
      categoryId,
      nameFormat,
      userLimit,
      bitrate,
      deleteAfterEmptySec,
      pairTextChannel,
      hideTextFromNonMembers,
      gameChoices: cleanTempGameChoices(gameChoices) as unknown as Prisma.InputJsonValue,
    },
  });
  res.status(201).json(row);
});

router.put("/guilds/:guildId/temp-channels/lobbies/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const data = { ...req.body };
  if ("gameChoices" in data) data.gameChoices = cleanTempGameChoices(data.gameChoices);
  const row = await prisma.tempChannelLobby.update({ where: { id: req.params.id }, data });
  res.json(row);
});

router.delete("/guilds/:guildId/temp-channels/lobbies/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.tempChannelLobby.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
