import { Router } from "express";
import { MAX_RANKS, cleanGameOverrides, cleanOverrides, rankListProblem } from "@spartacus/shared";
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
  const ranks = list(b.ranks, MAX_RANKS);
  const maps = list(b.maps, 100);
  const useRanks = Boolean(b.useRanks);
  const useMaps = Boolean(b.useMaps);
  const mapMethod = pick(b.mapMethod, ["VOTE", "RANDOM", "BANS"], "VOTE");
  const format = pick(b.format, ["SINGLE", "TOURNAMENT"], "SINGLE");
  const autoMove = Boolean(b.autoMove);
  const lobbyVoiceId = optionalId(b.lobbyVoiceId);

  if (!name) return { error: "Give this setup a name." };
  if (!game) return { error: "Enter the game this setup is for." };
  if (!panelChannelId || !resultsChannelId) return { error: "Pick a panel channel and a results channel." };
  if (panelChannelId === resultsChannelId) return { error: "The panel and results need different channels." };
  if (!whole(b.teamSize, 1, 10)) return { error: "Team size must be from 1 to 10." };
  const tournamentTeams = b.tournamentTeams as number;
  const picking = b.joinMode === "PICK" && (b.teamSize as number) > 1;
  if (format === "TOURNAMENT" && ![0, 2, 4, 8, 16, 32, 64].includes(tournamentTeams)) return { error: "Pick a team limit from the list." };
  if (format === "TOURNAMENT" && picking && (tournamentTeams === 0 || tournamentTeams > 16)) return { error: "When players choose a team, use 16 teams or fewer." };
  if (format === "TOURNAMENT" && tournamentTeams === 0 && b.startMode === "FULL") return { error: "With no team limit the lobby never fills. Pick Staff Start It or Set a Time." };
  if (useRanks && ranks.length < 2) return { error: "Add at least 2 ranks, or turn ranks off." };
  if (useRanks && rankListProblem(ranks)) return { error: rankListProblem(ranks) ?? "" };
  const startMode = pick(b.startMode, ["MANUAL", "SCHEDULED", "FULL"], "MANUAL");
  const startAt = typeof b.startAt === "string" && b.startAt ? new Date(b.startAt) : null;
  if (startMode === "SCHEDULED" && (!startAt || Number.isNaN(startAt.getTime()))) return { error: "Pick a start date and time." };
  if (useMaps) {
    if (maps.length < 1) return { error: "Add at least 1 option to the list, or turn maps off." };
    if (mapMethod !== "RANDOM" && (maps.length < 2 || !whole(b.mapChoices, 2, Math.min(20, maps.length)))) return { error: `Options to pick must be from 2 to ${Math.min(20, maps.length)}.` };
    if (mapMethod !== "RANDOM" && b.voteSeconds !== 0 && !whole(b.voteSeconds, 10, 300)) return { error: "Voting time must be 0 (no limit) or from 10 to 300 seconds." };
    if (!whole(b.skipRecent, 0, Math.max(0, maps.length - 1))) return { error: "Skip recent is too high for this list." };
  }
  const useTimers = Boolean(b.useTimers);
  if (useTimers && Boolean(b.checkIn) && !whole(b.checkInSeconds, 15, 600)) return { error: "Check-in time must be from 15 to 600 seconds." };
  const voiceCategoryId = optionalId(b.voiceCategoryId);
  if (autoMove && !lobbyVoiceId && !voiceCategoryId) return { error: "Pick a category for team voice channels, or turn them off." };
  const offOr = (v: unknown, min: number, max: number) => v === 0 || whole(v, min, max);
  if (useTimers) {
    if (!offOr(b.autoStartSeconds, 15, 600)) return { error: "Auto-start must be 0 (off) or from 15 to 600 seconds." };
    if (!offOr(b.reportMinutes, 5, 720)) return { error: "Score deadline must be 0 (off) or from 5 to 720 minutes." };
    if (!offOr(b.signupMinutes, 5, 10080)) return { error: "Sign-up time must be 0 (off) or from 5 to 10080 minutes." };
    if (!whole(b.autoReopenHours, 0, 720)) return { error: "Reopen time must be from 0 to 720 hours." };
  }
  if (![b.winCoins, b.lossCoins, b.championCoins].every((c) => whole(c, 0, 1_000_000))) return { error: "Coin rewards must be whole numbers of 0 or more." };

  return {
    data: {
      name,
      game,
      enabled: b.enabled === undefined ? true : Boolean(b.enabled),
      format,
      teamSize: b.teamSize as number,
      tournamentTeams: format === "TOURNAMENT" ? tournamentTeams : 4,
      flexTeams: format === "TOURNAMENT" && Boolean(b.flexTeams),
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
      voteSeconds: useMaps && mapMethod !== "RANDOM" ? (b.voteSeconds as number) : 0,
      skipRecent: useMaps ? (b.skipRecent as number) : 0,
      checkIn: Boolean(b.checkIn),
      checkInSeconds: useTimers && Boolean(b.checkIn) ? (b.checkInSeconds as number) : 120,
      autoMove,
      reportBy: pick(b.reportBy, ["BOTH", "CAPTAIN", "STAFF"], "BOTH"),
      lobbyVoiceId,
      voiceCategoryId,
      rewardsEnabled: Boolean(b.rewardsEnabled),
      joinMode: pick(b.joinMode, ["ASSIGN", "PICK"], "ASSIGN"),
      rosterView: pick(b.rosterView, ["PUBLIC", "HIDDEN"], "PUBLIC"),
      teamNames: list(b.teamNames, 16),
      startMode,
      startAt,
      useTimers,
      teamNaming: pick(b.teamNaming, ["SET", "CAPTAIN"], "SET"),
      autoStartSeconds: useTimers ? (b.autoStartSeconds as number) : 120,
      reportMinutes: useTimers ? (b.reportMinutes as number) : 90,
      noReportAction: pick(b.noReportAction, ["CANCEL", "ALERT"], "CANCEL"),
      signupMinutes: useTimers ? (b.signupMinutes as number) : 240,
      autoReopenHours: useTimers ? (b.autoReopenHours as number) : 24,
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

// Adding a game puts it on the Leaderboard and Matchmaking board in one step,
// and removing it takes it back off. Past results stay either way.
async function setGameListed(guildId: string, game: string, listed: boolean) {
  const config = await prisma.matchmakingConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  const change = (value: unknown) => {
    const current = (Array.isArray(value) ? value : []).filter((g) => g !== game);
    return listed ? [...current, game] : current;
  };
  await prisma.matchmakingConfig.update({ where: { guildId }, data: { boardGames: change(config.boardGames), games: change(config.games) } });
  const client = getBotClient();
  if (client) {
    const { syncBoard } = await import("@spartacus/bot");
    await syncBoard(client, guildId).catch(() => null);
  }
}

function readGame(b: Record<string, unknown>) {
  const game = text(b.game, 80);
  const ranks = list(b.ranks, MAX_RANKS);
  const maps = list(b.maps, 100);
  const useRanks = Boolean(b.useRanks);
  const useMaps = Boolean(b.useMaps);
  if (!game) return { error: "Enter the game's name." };
  if (game.toUpperCase() === "ALL") return { error: "That name is reserved. Pick another one." };
  if (!whole(b.teamSize, 1, 10)) return { error: "Team size must be from 1 to 10." };
  if (useRanks && ranks.length < 2) return { error: "Add at least 2 ranks, or turn ranks off." };
  if (useRanks && rankListProblem(ranks)) return { error: rankListProblem(ranks) ?? "" };
  if (useMaps && maps.length < 1) return { error: "Add at least 1 map, or turn maps off." };
  return { data: { game, teamSize: b.teamSize as number, useRanks, ranks, useMaps, maps, mapWord: text(b.mapWord, 30) || "Map", scoreName: text(b.scoreName, 30) || "Points" } };
}

// A new setup puts its game on the list, even one removed earlier. Editing an
// old setup only refreshes a preset that's still listed, so it can't bring
// back one that was removed on purpose.
async function syncPreset(guildId: string, data: SetupData, isNew: boolean) {
  await seedPresets(guildId);
  const existing = await prisma.matchPreset.findFirst({ where: { guildId, game: { equals: data.game as string, mode: "insensitive" } } });
  if (!existing) {
    await prisma.matchPreset.create({ data: { guildId, game: data.game as string, ...presetFields(data) } });
    await setGameListed(guildId, data.game as string, true);
  } else if (isNew || !existing.deleted) {
    await prisma.matchPreset.update({ where: { id: existing.id }, data: { ...presetFields(data), deleted: false } });
    if (existing.deleted) await setGameListed(guildId, existing.game, true);
  }
}

router.get("/guilds/:guildId/match-presets", requireAuth, requireGuildPermission, async (req, res) => {
  await seedPresets(req.params.guildId);
  res.json(await prisma.matchPreset.findMany({ where: { guildId: req.params.guildId, deleted: false }, orderBy: { createdAt: "asc" } }));
});

router.post("/guilds/:guildId/match-presets", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const { data, error } = readGame(req.body);
  if (!data) return res.status(400).json({ error });
  await seedPresets(guildId);
  const existing = await prisma.matchPreset.findFirst({ where: { guildId, game: { equals: data.game, mode: "insensitive" } } });
  if (existing && !existing.deleted) return res.status(400).json({ error: "That game is already on your list." });
  const row = existing ? await prisma.matchPreset.update({ where: { id: existing.id }, data: { ...data, deleted: false } }) : await prisma.matchPreset.create({ data: { ...data, guildId } });
  await setGameListed(guildId, row.game, true);
  res.status(201).json(row);
});

// The name stays fixed because results and teams are filed under it.
router.patch("/guilds/:guildId/match-presets/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const preset = await prisma.matchPreset.findUnique({ where: { id: req.params.id } });
  if (!preset || preset.guildId !== req.params.guildId) return res.status(404).json({ error: "Game not found" });
  const { data, error } = readGame({ ...req.body, game: preset.game });
  if (!data) return res.status(400).json({ error });
  res.json(await prisma.matchPreset.update({ where: { id: preset.id }, data }));
});

router.delete("/guilds/:guildId/match-presets/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const preset = await prisma.matchPreset.findUnique({ where: { id: req.params.id } });
  if (!preset || preset.guildId !== req.params.guildId) return res.status(404).json({ error: "Preset not found" });
  await prisma.matchPreset.update({ where: { id: preset.id }, data: { deleted: true } });
  await setGameListed(req.params.guildId, preset.game, false);
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

  const row = await prisma.matchSetup.update({
    where: { id: existing.id },
    data: { ...data, ...(movedPanel ? { panelMessageId: null } : {}), ...(movedResults ? { bracketMessageId: null } : {}) },
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
  const client = getBotClient();
  if (client) {
    const { closeMatchRooms } = await import("@spartacus/bot");
    await closeMatchRooms(client, existing.id).catch(() => null);
  }
  if (existing.panelMessageId) await deleteChannelMessage(existing.panelChannelId, existing.panelMessageId).catch(() => null);
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

router.get("/guilds/:guildId/match-setups/:id/roster", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await findSetup(req.params.guildId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Match setup not found" });
  const live = await withBot(res);
  if (!live) return;
  res.json(await live.bot.matchRoster(live.client, existing.id));
});

// ---- Leaderboard and Matchmaking tabs ----

const CONFIG_FIELDS = ["boardChannelId", "boardGames", "boardStyle", "channelId", "activityChannelId", "lobbyVoiceId", "duelCategoryId", "teamCategoryId", "enabled", "createVoice", "requireLobby", "voiceSource", "voiceReturn", "voicePrivate", "voiceLimit", "voiceExtra", "voiceNumberPad", "duelVoiceName", "teamVoiceName", "texts", "gameTexts", "ranked", "games", "challengeMinutes", "queueMinutes", "reportHours", "staffRoleId"];

router.get("/guilds/:guildId/matchmaking", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const config = await prisma.matchmakingConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  const [rooms, teams, results] = await Promise.all([
    prisma.matchRoom.findMany({ where: { guildId, status: { in: ["LIVE", "CONFIRM"] } }, orderBy: { createdAt: "desc" } }),
    prisma.matchTeam.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.matchResult.findMany({ where: { guildId, setupId: null }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  res.json({ config, rooms, teams, results });
});

router.put("/guilds/:guildId/matchmaking", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const b = req.body as Record<string, unknown>;
  for (const key of ["challengeMinutes", "queueMinutes", "reportHours"]) if (b[key] !== undefined && !whole(b[key], 1, 1000)) return res.status(400).json({ error: "Time limits must be from 1 to 1000." });
  if (b.enabled && !b.channelId) return res.status(400).json({ error: "Pick a text channel for Matchmaking." });
  if (b.boardStyle !== undefined && !["COMBINED", "SEPARATE"].includes(b.boardStyle as string)) return res.status(400).json({ error: "Pick a leaderboard style." });
  if (b.voiceExtra !== undefined && !whole(b.voiceExtra, 0, 20)) return res.status(400).json({ error: "Extra spots must be from 0 to 20." });
  if (b.voiceNumberPad !== undefined && !whole(b.voiceNumberPad, 1, 4)) return res.status(400).json({ error: "Number digits must be from 1 to 4." });
  for (const key of ["duelVoiceName", "teamVoiceName"]) if (b[key] !== undefined && !text(b[key], 100)) return res.status(400).json({ error: "Voice channel names can't be empty." });
  if (b.requireLobby && !b.lobbyVoiceId) return res.status(400).json({ error: "Pick a Lobby before requiring it." });

  const existing = await prisma.matchmakingConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  const data = Object.fromEntries(CONFIG_FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, k === "gameTexts" ? cleanGameOverrides(b[k]) : k === "texts" ? cleanOverrides(b[k]) : k === "games" || k === "boardGames" ? list(b[k], 500) : b[k] === "" ? null : b[k]]));
  const movedBoard = b.boardChannelId !== undefined && (b.boardChannelId || null) !== existing.boardChannelId;
  const movedPanel = b.channelId !== undefined && (b.channelId || null) !== existing.channelId;
  const switchedOff = b.enabled === false && existing.enabled;
  if (movedBoard && existing.boardChannelId) {
    for (const id of Object.values((existing.boardMessages ?? {}) as Record<string, string>)) await deleteChannelMessage(existing.boardChannelId, id).catch(() => null);
  }
  if ((movedPanel || switchedOff) && existing.channelId && existing.messageId) await deleteChannelMessage(existing.channelId, existing.messageId).catch(() => null);

  const config = await prisma.matchmakingConfig.update({ where: { guildId }, data: { ...data, ...(movedBoard ? { boardMessages: {} } : {}), ...(movedPanel || switchedOff ? { messageId: null } : {}) } });
  const client = getBotClient();
  if (client) {
    const { syncBoard, syncMatchmakingPanel } = await import("@spartacus/bot");
    await syncBoard(client, guildId).catch(() => null);
    await syncMatchmakingPanel(client, guildId).catch(() => null);
    if ((b.texts !== undefined || b.gameTexts !== undefined) && JSON.stringify([config.texts, config.gameTexts]) !== JSON.stringify([existing.texts, existing.gameTexts])) {
      const { refreshMatchPanel } = await import("@spartacus/bot");
      const setups = await prisma.matchSetup.findMany({ where: { guildId, enabled: true }, select: { id: true } });
      for (const s of setups) await refreshMatchPanel(client, s.id).catch(() => null);
    }
  }
  res.json(config);
});

router.post("/guilds/:guildId/matchmaking/new-season", requireAuth, requireGuildPermission, async (req, res) => {
  const live = await withBot(res);
  if (!live) return;
  await live.bot.startBoardSeason(live.client, req.params.guildId);
  res.json({ ok: true });
});

router.post("/guilds/:guildId/match-rooms/:id/cancel", requireAuth, requireGuildPermission, async (req, res) => {
  const room = await prisma.matchRoom.findUnique({ where: { id: req.params.id } });
  if (!room || room.guildId !== req.params.guildId) return res.status(404).json({ error: "Match not found" });
  const live = await withBot(res);
  if (!live) return;
  await live.bot.cancelRoom(live.client, room.id);
  res.json({ ok: true });
});

router.delete("/guilds/:guildId/match-teams/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const team = await prisma.matchTeam.findUnique({ where: { id: req.params.id } });
  if (!team || team.guildId !== req.params.guildId) return res.status(404).json({ error: "Team not found" });
  await prisma.matchQueue.deleteMany({ where: { teamId: team.id } });
  await prisma.matchTeam.delete({ where: { id: team.id } });
  res.status(204).send();
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
