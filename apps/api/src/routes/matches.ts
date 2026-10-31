import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { deleteChannelMessage } from "../lib/discordRest";
import { getBotClient } from "../lib/botClient";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const whole = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const list = (v: unknown, maxItems: number) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string").map((x: string) => x.trim().slice(0, 80)).filter(Boolean))].slice(0, maxItems) : []);
const optionalId = (v: unknown) => (typeof v === "string" && v ? v : null);
const pick = (v: unknown, allowed: string[], fallback: string) => (typeof v === "string" && allowed.includes(v) ? v : fallback);

// Runs on every save so a bad value can't reach a live panel, whatever sent it.
function readSetup(b: Record<string, unknown>): { data?: Omit<Prisma.MatchSetupUncheckedCreateInput, "guildId">; error?: string } {
  const name = text(b.name, 80);
  const game = text(b.game, 80);
  const panelChannelId = optionalId(b.panelChannelId);
  const resultsChannelId = optionalId(b.resultsChannelId);
  const ranks = list(b.ranks, 25);
  const maps = list(b.maps, 100);
  const useRanks = Boolean(b.useRanks);
  const useMaps = Boolean(b.useMaps);
  const mapMethod = pick(b.mapMethod, ["VOTE", "RANDOM", "BANS"], "VOTE");
  const format = pick(b.format, ["SINGLE", "TOURNAMENT"], "SINGLE");
  const autoMove = Boolean(b.autoMove);
  const team1VoiceId = optionalId(b.team1VoiceId);
  const team2VoiceId = optionalId(b.team2VoiceId);

  if (!name) return { error: "Give this setup a name." };
  if (!game) return { error: "Enter the game this setup is for." };
  if (!panelChannelId || !resultsChannelId) return { error: "Pick a panel channel and a results channel." };
  if (panelChannelId === resultsChannelId) return { error: "The panel and results need different channels." };
  if (!whole(b.teamSize, 1, 10)) return { error: "Team size must be from 1 to 10." };
  if (format === "TOURNAMENT" && ![4, 8, 16].includes(b.tournamentTeams as number)) return { error: "Tournaments run with 4, 8 or 16 teams." };
  if (useRanks && ranks.length < 2) return { error: "Add at least 2 ranks, or turn ranks off." };
  if (useMaps) {
    if (maps.length < 1) return { error: "Add at least 1 option to the list, or turn maps off." };
    if (mapMethod !== "RANDOM" && (maps.length < 2 || !whole(b.mapChoices, 2, Math.min(20, maps.length)))) return { error: `Options to pick must be from 2 to ${Math.min(20, maps.length)}.` };
    if (mapMethod !== "RANDOM" && !whole(b.voteSeconds, 10, 300)) return { error: "Voting time must be from 10 to 300 seconds." };
    if (!whole(b.skipRecent, 0, Math.max(0, maps.length - 1))) return { error: "Skip recent is too high for this list." };
  }
  if (Boolean(b.checkIn) && !whole(b.checkInSeconds, 15, 600)) return { error: "Check-in time must be from 15 to 600 seconds." };
  if (autoMove && !!team1VoiceId !== !!team2VoiceId) return { error: "Pick a voice channel for both teams, or neither." };
  if (![b.winCoins, b.lossCoins, b.championCoins].every((c) => whole(c, 0, 1_000_000))) return { error: "Coin rewards must be whole numbers of 0 or more." };

  return {
    data: {
      name,
      game,
      enabled: b.enabled === undefined ? true : Boolean(b.enabled),
      format,
      teamSize: b.teamSize as number,
      tournamentTeams: format === "TOURNAMENT" ? (b.tournamentTeams as number) : 4,
      balance: pick(b.balance, ["BALANCED", "CAPTAINS", "RANDOM"], "BALANCED"),
      captainRule: pick(b.captainRule, ["TOP", "RANDOM"], "TOP"),
      team1Name: text(b.team1Name, 60) || "Team Blue",
      team2Name: text(b.team2Name, 60) || "Team Orange",
      useRanks,
      ranks,
      scoreName: text(b.scoreName, 30) || "Points",
      useMaps,
      mapWord: text(b.mapWord, 30) || "Map",
      maps,
      mapMethod,
      mapChoices: useMaps && mapMethod !== "RANDOM" ? (b.mapChoices as number) : 3,
      voteSeconds: useMaps && mapMethod !== "RANDOM" ? (b.voteSeconds as number) : 60,
      skipRecent: useMaps ? (b.skipRecent as number) : 0,
      checkIn: Boolean(b.checkIn),
      checkInSeconds: Boolean(b.checkIn) ? (b.checkInSeconds as number) : 120,
      autoMove,
      reportBy: pick(b.reportBy, ["BOTH", "CAPTAIN", "STAFF"], "BOTH"),
      lobbyVoiceId: optionalId(b.lobbyVoiceId),
      team1VoiceId,
      team2VoiceId,
      winCoins: b.winCoins as number,
      lossCoins: b.lossCoins as number,
      championCoins: b.championCoins as number,
      championRoleId: optionalId(b.championRoleId),
      pingRoleId: optionalId(b.pingRoleId),
      staffRoleId: optionalId(b.staffRoleId),
      panelChannelId,
      resultsChannelId,
    },
  };
}

const STARTER_PRESETS = [
  { game: "Rainbow Six Siege", teamSize: 5, useRanks: true, ranks: ["Copper", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Champion"], useMaps: true, maps: ["Bank", "Border", "Chalet", "Clubhouse", "Consulate", "Kafe Dostoyevsky", "Oregon", "Skyscraper", "Villa"], mapWord: "Map", scoreName: "Rounds" },
  { game: "Valorant", teamSize: 5, useRanks: true, ranks: ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal", "Radiant"], useMaps: true, maps: ["Ascent", "Bind", "Haven", "Icebox", "Lotus", "Split", "Sunset"], mapWord: "Map", scoreName: "Rounds" },
  { game: "Rocket League", teamSize: 2, useRanks: true, ranks: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Champion", "Grand Champion", "Supersonic Legend"], useMaps: true, maps: ["Champions Field", "DFH Stadium", "Mannfield", "Neo Tokyo", "Utopia Coliseum"], mapWord: "Arena", scoreName: "Goals" },
];

type SetupData = NonNullable<ReturnType<typeof readSetup>["data"]>;

const presetFields = (d: SetupData) => ({ teamSize: d.teamSize as number, useRanks: d.useRanks, ranks: d.ranks as Prisma.InputJsonValue, useMaps: d.useMaps, maps: d.maps as Prisma.InputJsonValue, mapWord: d.mapWord, scoreName: d.scoreName });

// A server's first visit gets the starters plus any games it has already set up.
async function seedPresets(guildId: string) {
  if ((await prisma.matchPreset.count({ where: { guildId } })) > 0) return;
  const setups = await prisma.matchSetup.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } });
  const fromSetups = setups.map((s) => ({ game: s.game, teamSize: s.teamSize, useRanks: s.useRanks, ranks: s.ranks as Prisma.InputJsonValue, useMaps: s.useMaps, maps: s.maps as Prisma.InputJsonValue, mapWord: s.mapWord, scoreName: s.scoreName }));
  await prisma.matchPreset.createMany({ data: [...STARTER_PRESETS, ...fromSetups].map((p) => ({ ...p, guildId })), skipDuplicates: true });
}

// A new setup puts its game on the list, even one removed earlier. Editing an
// old setup only refreshes a preset that's still listed, so it can't bring
// back one that was removed on purpose.
async function syncPreset(guildId: string, data: SetupData, isNew: boolean) {
  await seedPresets(guildId);
  const existing = await prisma.matchPreset.findFirst({ where: { guildId, game: { equals: data.game as string, mode: "insensitive" } } });
  if (!existing) {
    await prisma.matchPreset.create({ data: { guildId, game: data.game as string, ...presetFields(data) } });
  } else if (isNew || !existing.deleted) {
    await prisma.matchPreset.update({ where: { id: existing.id }, data: { ...presetFields(data), deleted: false } });
  }
}

router.get("/guilds/:guildId/match-presets", requireAuth, requireGuildPermission, async (req, res) => {
  await seedPresets(req.params.guildId);
  res.json(await prisma.matchPreset.findMany({ where: { guildId: req.params.guildId, deleted: false }, orderBy: { createdAt: "asc" } }));
});

router.delete("/guilds/:guildId/match-presets/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const preset = await prisma.matchPreset.findUnique({ where: { id: req.params.id } });
  if (!preset || preset.guildId !== req.params.guildId) return res.status(404).json({ error: "Preset not found" });
  await prisma.matchPreset.update({ where: { id: preset.id }, data: { deleted: true } });
  res.status(204).send();
});

async function findSetup(guildId: string, id: string) {
  const setup = await prisma.matchSetup.findUnique({ where: { id } });
  return setup && setup.guildId === guildId ? setup : null;
}

router.get("/guilds/:guildId/match-setups", requireAuth, requireGuildPermission, async (req, res) => {
  const setups = await prisma.matchSetup.findMany({ where: { guildId: req.params.guildId }, orderBy: { createdAt: "asc" } });
  const sessions = await prisma.matchSession.findMany({ where: { guildId: req.params.guildId, closedAt: null } });
  res.json(setups.map((s) => {
    const live = sessions.find((x) => x.setupId === s.id);
    return { ...s, livePhase: live?.phase ?? null, liveNumber: live?.number ?? null };
  }));
});

router.post("/guilds/:guildId/match-setups", requireAuth, requireGuildPermission, async (req, res) => {
  const { data, error } = readSetup(req.body);
  if (!data) return res.status(400).json({ error });
  const row = await prisma.matchSetup.create({ data: { ...data, guildId: req.params.guildId } });
  await syncPreset(req.params.guildId, data, true);
  res.status(201).json(row);
});

router.patch("/guilds/:guildId/match-setups/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await findSetup(req.params.guildId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Match setup not found" });
  const { data, error } = readSetup(req.body);
  if (!data) return res.status(400).json({ error });

  // A moved channel starts over with fresh messages there, and clearing the
  // ids lets the bot's timer post them within a few seconds.
  const movedPanel = data.panelChannelId !== existing.panelChannelId;
  const movedResults = data.resultsChannelId !== existing.resultsChannelId;
  if (movedPanel && existing.panelMessageId) await deleteChannelMessage(existing.panelChannelId, existing.panelMessageId).catch(() => null);
  if (movedResults && existing.leaderboardMessageId) await deleteChannelMessage(existing.resultsChannelId, existing.leaderboardMessageId).catch(() => null);

  const row = await prisma.matchSetup.update({
    where: { id: existing.id },
    data: { ...data, ...(movedPanel ? { panelMessageId: null } : {}), ...(movedResults ? { leaderboardMessageId: null, bracketMessageId: null } : {}) },
  });

  await syncPreset(req.params.guildId, data, false);

  const client = getBotClient();
  if (client && !movedPanel) {
    const { refreshMatchPanel } = await import("@spartacus/bot");
    await refreshMatchPanel(client, row.id).catch(() => null);
  }
  res.json(row);
});

router.delete("/guilds/:guildId/match-setups/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await findSetup(req.params.guildId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Match setup not found" });
  if (existing.panelMessageId) await deleteChannelMessage(existing.panelChannelId, existing.panelMessageId).catch(() => null);
  if (existing.leaderboardMessageId) await deleteChannelMessage(existing.resultsChannelId, existing.leaderboardMessageId).catch(() => null);
  await prisma.matchSetup.delete({ where: { id: existing.id } });
  res.status(204).send();
});

router.get("/guilds/:guildId/match-setups/:id/results", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await findSetup(req.params.guildId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Match setup not found" });
  res.json(await prisma.matchResult.findMany({ where: { setupId: existing.id }, orderBy: { createdAt: "desc" }, take: 50 }));
});

async function withBot(res: import("express").Response) {
  const client = getBotClient();
  if (!client) {
    res.status(503).json({ error: "The bot isn't connected right now. Try again in a moment." });
    return null;
  }
  return { client, bot: await import("@spartacus/bot") };
}

router.post("/guilds/:guildId/match-setups/:id/cancel", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await findSetup(req.params.guildId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Match setup not found" });
  const live = await withBot(res);
  if (!live) return;
  await live.bot.cancelMatch(live.client, existing.id);
  res.json({ ok: true });
});

router.post("/guilds/:guildId/match-setups/:id/new-season", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await findSetup(req.params.guildId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Match setup not found" });
  const live = await withBot(res);
  if (!live) return;
  await live.bot.startMatchSeason(live.client, existing.id);
  res.json({ ok: true });
});

router.post("/guilds/:guildId/match-results/:id/void", requireAuth, requireGuildPermission, async (req, res) => {
  const result = await prisma.matchResult.findUnique({ where: { id: req.params.id } });
  if (!result || result.guildId !== req.params.guildId) return res.status(404).json({ error: "Result not found" });
  if (result.voided) return res.status(400).json({ error: "This result was already voided." });
  const live = await withBot(res);
  if (!live) return;
  await live.bot.voidMatchResult(live.client, result.id);
  res.json({ ok: true });
});

export default router;
