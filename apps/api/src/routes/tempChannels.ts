import { Router } from "express";
import { prisma, Prisma } from "@spartacus/db";
import { cleanTempGameChoices } from "@spartacus/shared";
import { deleteChannelMessage } from "../lib/discordRest";
import { getBotClient } from "../lib/botClient";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

const FIELDS = [
  "name", "lobbyChannelId", "categoryId", "nameFormat", "userLimit", "bitrate", "deleteAfterEmptySec", "pairTextChannel", "hideTextFromNonMembers",
  "gamePicker", "gameCategories", "gameChoices", "panelChannelId", "panelTitle", "panelText", "panelColor",
] as const;

// Only known fields, each cleaned up.
function lobbyData(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of FIELDS) {
    if (body[k] === undefined) continue;
    const v = body[k];
    if (k === "gameChoices") data[k] = cleanTempGameChoices(v) as unknown as Prisma.InputJsonValue;
    else if (k === "gamePicker" || k === "gameCategories" || k === "pairTextChannel" || k === "hideTextFromNonMembers") data[k] = v === true;
    else if (k === "categoryId" || k === "panelChannelId") data[k] = v || null;
    else if (k === "panelTitle") data[k] = String(v).slice(0, 256);
    else if (k === "panelText") data[k] = String(v).slice(0, 4000);
    else if (k === "panelColor") data[k] = Math.min(0xffffff, Math.max(0, Math.round(Number(v)) || 0));
    else data[k] = v;
  }
  return data;
}

// The dashboard saves as you type, so the panel is redrawn once typing stops.
const redraws = new Map<string, ReturnType<typeof setTimeout>>();
function redrawPanel(lobbyId: string) {
  clearTimeout(redraws.get(lobbyId));
  redraws.set(
    lobbyId,
    setTimeout(async () => {
      redraws.delete(lobbyId);
      const client = getBotClient();
      if (!client) return;
      const { syncTempPanel } = await import("@spartacus/bot");
      await syncTempPanel(client, lobbyId).catch(() => null);
    }, 1500),
  );
}

router.get("/guilds/:guildId/temp-channels/lobbies", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.tempChannelLobby.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

router.post("/guilds/:guildId/temp-channels/lobbies", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.tempChannelLobby.create({ data: { ...(lobbyData(req.body) as any), guildId: req.params.guildId } });
  if (row.panelChannelId) redrawPanel(row.id);
  res.status(201).json(row);
});

router.put("/guilds/:guildId/temp-channels/lobbies/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.tempChannelLobby.findFirst({ where: { id: req.params.id, guildId: req.params.guildId } });
  if (!existing) return res.status(404).json({ error: "Lobby not found" });
  const data = lobbyData(req.body);
  // A moved or removed panel takes its old message with it.
  const movedPanel = data.panelChannelId !== undefined && data.panelChannelId !== existing.panelChannelId;
  if (movedPanel && existing.panelChannelId && existing.panelMessageId) await deleteChannelMessage(existing.panelChannelId, existing.panelMessageId).catch(() => null);
  const row = await prisma.tempChannelLobby.update({ where: { id: existing.id }, data: { ...data, ...(movedPanel ? { panelMessageId: null } : {}) } });
  if (row.panelChannelId) redrawPanel(row.id);
  res.json(row);
});

router.delete("/guilds/:guildId/temp-channels/lobbies/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.tempChannelLobby.findFirst({ where: { id: req.params.id, guildId: req.params.guildId } });
  if (!existing) return res.status(204).send();
  if (existing.panelChannelId && existing.panelMessageId) await deleteChannelMessage(existing.panelChannelId, existing.panelMessageId).catch(() => null);
  await prisma.tempChannelLobby.delete({ where: { id: existing.id } });
  res.status(204).send();
});

export default router;
