import { Router, type Response } from "express";
import { prisma } from "@spartacus/db";
import { cleanTournament } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";
import { memberNames } from "../lib/memberNames";

// Matchmaking → Tournaments. The bot runs everything that touches Discord;
// these routes save settings and pass staff actions through.
const router = Router();
const P = "/guilds/:guildId/tournaments";
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function view(guildId: string) {
  const [config, presets, tournaments] = await Promise.all([
    prisma.matchmakingConfig.findUnique({ where: { guildId } }),
    prisma.matchPreset.findMany({ where: { guildId, deleted: false }, select: { game: true, teamSize: true } }),
    prisma.matchTournament.findMany({ where: { guildId }, include: { entries: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" }, take: 60 }),
  ]);
  const games = strings(config?.games);
  const people = tournaments.flatMap((t) => [...strings(t.solo), ...t.entries.flatMap((e) => [e.captainId, ...strings(e.players)])]);
  const names = await memberNames(guildId, people);
  const live = await prisma.matchRoom.findMany({ where: { guildId, tournamentId: { not: null }, status: { in: ["LIVE", "CONFIRM"] } }, select: { id: true, threadId: true, status: true } });
  return {
    games: games.map((g) => ({ game: g, teamSize: Math.max(2, presets.find((p) => p.game === g)?.teamSize ?? 5) })),
    defaultChannelId: config?.tournamentChannelId ?? config?.activityChannelId ?? config?.channelId ?? null,
    championRoleId: config?.championRoleId ?? null,
    matchmakingReady: !!config,
    rooms: live,
    names,
    tournaments: tournaments.map((t) => ({
      ...t,
      startAt: t.startAt?.toISOString() ?? null,
      checkInEndsAt: t.checkInEndsAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      startedAt: t.startedAt?.toISOString() ?? null,
      endedAt: t.endedAt?.toISOString() ?? null,
      solo: strings(t.solo),
      soloReady: strings(t.soloReady),
      entries: t.entries.map((e) => ({ id: e.id, teamId: e.teamId, name: e.name, captainId: e.captainId, players: strings(e.players), seed: e.seed, checkedIn: e.checkedIn, out: e.out })),
    })),
  };
}

async function find(guildId: string, id: string) {
  const t = await prisma.matchTournament.findUnique({ where: { id } });
  return t && t.guildId === guildId ? t : null;
}

async function bot(res: Response) {
  const client = getBotClient();
  if (!client) {
    res.status(503).json({ error: "The bot is restarting. Try again in a minute." });
    return null;
  }
  return { client, ...(await import("@spartacus/bot")) };
}

router.get(P, requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await view(req.params.guildId));
});

router.post(P, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId } });
  if (!config) return res.status(400).json({ error: "Set up Matchmaking first (the Matchmaking tab)." });
  const data = cleanTournament(req.body ?? {}, strings(config.games));
  if (typeof data === "string") return res.status(400).json({ error: data });
  await prisma.matchTournament.create({ data: { guildId, ...data, startAt: data.startAt ? new Date(data.startAt) : null, rules: data.rules || null } });
  res.json(await view(guildId));
});

router.put(`${P}/:id`, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const t = await find(guildId, req.params.id);
  if (!t) return res.status(404).json({ error: "Tournament not found." });
  if (t.status !== "DRAFT" && t.status !== "OPEN") return res.status(400).json({ error: "It can't be edited once check-in or the bracket has started." });
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId } });
  const data = cleanTournament(req.body ?? {}, strings(config?.games));
  if (typeof data === "string") return res.status(400).json({ error: data });
  if (t.status === "OPEN") {
    if (data.game !== t.game) return res.status(400).json({ error: "The game can't change once registration is open." });
    const teams = await prisma.matchTournamentEntry.count({ where: { tournamentId: t.id, out: false } });
    if (data.maxTeams < teams) return res.status(400).json({ error: `${teams} teams are already registered, so the limit can't go below that.` });
  }
  const moved = t.status === "OPEN" && (data.channelId ?? null) !== (t.channelId ?? null);
  await prisma.matchTournament.update({ where: { id: t.id }, data: { ...data, startAt: data.startAt ? new Date(data.startAt) : null, rules: data.rules || null, ...(moved ? { messageId: null } : {}) } });
  if (t.status === "OPEN") {
    const b = await bot(res);
    if (!b) return;
    await b.refreshTournament(b.client, t.id);
  }
  res.json(await view(guildId));
});

// Same settings, as a new draft (next week if it had a start time).
router.post(`${P}/:id/duplicate`, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const t = await find(guildId, req.params.id);
  if (!t) return res.status(404).json({ error: "Tournament not found." });
  let startAt = t.startAt;
  while (startAt && startAt.getTime() < Date.now()) startAt = new Date(startAt.getTime() + 7 * 86_400_000);
  await prisma.matchTournament.create({
    data: {
      guildId,
      name: t.name,
      game: t.game,
      maxTeams: t.maxTeams,
      bestOf: t.bestOf,
      seeding: t.seeding,
      checkIn: t.checkIn,
      checkInMinutes: t.checkInMinutes,
      soloSignups: t.soloSignups,
      startAt,
      channelId: t.channelId,
      pingRoleId: t.pingRoleId,
      rules: t.rules,
      winCoins: t.winCoins,
      championCoins: t.championCoins,
      runnerUpCoins: t.runnerUpCoins,
      championRoleId: t.championRoleId,
    },
  });
  res.json(await view(guildId));
});

type Action = "open" | "checkin" | "start" | "cancel";
for (const action of ["open", "checkin", "start", "cancel"] as Action[]) {
  router.post(`${P}/:id/${action}`, requireAuth, requireGuildPermission, async (req, res) => {
    const guildId = req.params.guildId;
    const t = await find(guildId, req.params.id);
    if (!t) return res.status(404).json({ error: "Tournament not found." });
    const b = await bot(res);
    if (!b) return;
    const run = { open: b.openTournament, checkin: b.tournamentCheckIn, start: b.startTournamentNow, cancel: b.cancelTournament }[action];
    const problem = await run(b.client, t.id);
    if (problem) return res.status(400).json({ error: problem });
    res.json(await view(guildId));
  });
}

router.post(`${P}/:id/tie`, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const t = await find(guildId, req.params.id);
  if (!t) return res.status(404).json({ error: "Tournament not found." });
  const { round, index, side } = (req.body ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(round) || !Number.isInteger(index) || (side !== "a" && side !== "b")) return res.status(400).json({ error: "Pick a match and a winner." });
  const b = await bot(res);
  if (!b) return;
  const problem = await b.setTieWinner(b.client, t.id, round as number, index as number, side);
  if (problem) return res.status(400).json({ error: problem });
  res.json(await view(guildId));
});

router.post(`${P}/:id/entries/:entryId/remove`, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const t = await find(guildId, req.params.id);
  if (!t) return res.status(404).json({ error: "Tournament not found." });
  const b = await bot(res);
  if (!b) return;
  const problem = await b.removeTournamentEntry(b.client, t.id, req.params.entryId);
  if (problem) return res.status(400).json({ error: problem });
  res.json(await view(guildId));
});

router.delete(`${P}/:id`, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const t = await find(guildId, req.params.id);
  if (!t) return res.status(404).json({ error: "Tournament not found." });
  // A draft has nothing in Discord. Anything else also loses its post (and
  // live match rooms), and leaves the Hall of Fame.
  if (t.status === "DRAFT") await prisma.matchTournament.delete({ where: { id: t.id } });
  else {
    const b = await bot(res);
    if (!b) return;
    await b.deleteTournament(b.client, t.id);
  }
  res.json(await view(guildId));
});

export default router;
