import { Router, type Response } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();
const base = "/guilds/:guildId/role-manager";

// The guild through the bot, plus who's acting, so their own top role counts.
async function context(req: AuthedRequest, res: Response) {
  const client = getBotClient();
  if (!client) {
    res.status(503).json({ error: "The bot isn't connected right now — try again in a moment." });
    return null;
  }
  const guild = await client.guilds.fetch(req.params.guildId).catch(() => null);
  if (!guild) {
    res.status(404).json({ error: "Spartacus isn't in this server." });
    return null;
  }
  const id = req.session?.id ?? req.user?.id ?? "";
  const member = await guild.members.fetch(id).catch(() => null);
  const actor = { id, name: req.session?.username ?? "Dashboard", isOwner: guild.ownerId === id, member };
  const bot = await import("@spartacus/bot");
  return { guild, actor, bot };
}

const memberJson = (m: { id: string; displayName: string; user: { username: string; bot: boolean; displayAvatarURL: () => string }; joinedTimestamp: number | null; roles: { cache: Map<string, unknown> } }, guildId: string) => ({
  id: m.id,
  displayName: m.displayName,
  username: m.user.username,
  avatar: m.user.displayAvatarURL(),
  bot: m.user.bot,
  joinedAt: m.joinedTimestamp ? new Date(m.joinedTimestamp).toISOString() : null,
  roleIds: [...m.roles.cache.keys()].filter((r) => r !== guildId),
});

router.get(base, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const cfg = await prisma.roleManagerConfig.findUnique({ where: { guildId: ctx.guild.id } });
  const roles = await ctx.guild.roles.fetch();
  const list = await Promise.all(
    [...roles.values()]
      .filter((r) => r.id !== ctx.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(async (r) => ({
        id: r.id,
        name: r.name,
        color: r.hexColor === "#000000" ? null : r.hexColor,
        managed: r.managed,
        powerful: ctx.bot.isPowerful(r),
        blocked: await ctx.bot.roleBlockReason(ctx.guild, r, ctx.actor, cfg?.hiddenRoleIds ?? []),
      })),
  );
  res.json({
    config: { staffRoleIds: cfg?.staffRoleIds ?? [], logChannelId: cfg?.logChannelId ?? null, hiddenRoleIds: cfg?.hiddenRoleIds ?? [] },
    roles: list,
    isOwner: ctx.actor.isOwner,
  });
});

router.put(base, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^\d+$/.test(x)).slice(0, 100) : []);
  const { staffRoleIds, logChannelId, hiddenRoleIds } = req.body ?? {};
  const data = {
    staffRoleIds: ids(staffRoleIds),
    hiddenRoleIds: ids(hiddenRoleIds),
    logChannelId: typeof logChannelId === "string" && /^\d+$/.test(logChannelId) ? logChannelId : null,
  };
  const cfg = await prisma.roleManagerConfig.upsert({ where: { guildId: req.params.guildId }, create: { guildId: req.params.guildId, ...data }, update: data });
  res.json(cfg);
});

router.get(`${base}/members`, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const q = String(req.query.q ?? "").trim().slice(0, 100);
  if (!q) return res.json([]);
  if (/^\d{15,25}$/.test(q)) {
    const m = await ctx.guild.members.fetch(q).catch(() => null);
    return res.json(m ? [memberJson(m, ctx.guild.id)] : []);
  }
  const found = await ctx.guild.members.search({ query: q, limit: 25 }).catch(() => null);
  res.json([...(found?.values() ?? [])].map((m) => memberJson(m, ctx.guild.id)));
});

router.get(`${base}/members/:userId`, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const m = await ctx.guild.members.fetch(req.params.userId).catch(() => null);
  if (!m) return res.status(404).json({ error: "That member isn't in the server." });
  const timed = await prisma.timedRole.findMany({ where: { guildId: ctx.guild.id, userId: m.id } });
  res.json({ ...memberJson(m, ctx.guild.id), timed: timed.map((t) => ({ roleId: t.roleId, expiresAt: t.expiresAt.toISOString() })) });
});

router.post(`${base}/members/:userId/roles`, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const { roleId, action, minutes } = req.body ?? {};
  if (typeof roleId !== "string" || (action !== "GIVE" && action !== "TAKE")) return res.status(400).json({ error: "Pick a role and give or take." });
  const mins = Number.isFinite(Number(minutes)) && Number(minutes) > 0 ? Math.min(525_600, Math.round(Number(minutes))) : null;
  const result = await ctx.bot.changeRole(ctx.guild, req.params.userId, roleId, action, ctx.actor, "DASHBOARD", action === "GIVE" ? mins : null);
  if (!result.ok) return res.status(400).json({ error: result.message });
  res.json(result);
});

function readFilter(body: Record<string, unknown>) {
  const f = (body.filter ?? {}) as Record<string, unknown>;
  return {
    who: f.who === "has" || f.who === "missing" ? f.who : "everyone",
    filterRoleId: typeof f.filterRoleId === "string" ? f.filterRoleId : null,
    joinedWithinDays: Number(f.joinedWithinDays) > 0 ? Math.min(3650, Math.round(Number(f.joinedWithinDays))) : null,
    includeBots: f.includeBots === true,
  } as const;
}

router.post(`${base}/bulk/preview`, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const { roleId, action } = req.body ?? {};
  if (typeof roleId !== "string" || (action !== "GIVE" && action !== "TAKE")) return res.status(400).json({ error: "Pick a role and give or take." });
  const role = await ctx.guild.roles.fetch(roleId).catch(() => null);
  if (!role) return res.status(400).json({ error: "That role doesn't exist anymore." });
  const blocked = await ctx.bot.roleBlockReason(ctx.guild, role, ctx.actor);
  const targets = await ctx.bot.bulkTargets(ctx.guild, roleId, action, readFilter(req.body));
  res.json({ count: targets.length, sample: targets.slice(0, 50).map((m) => m.displayName), blocked });
});

router.post(`${base}/bulk`, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const { roleId, action } = req.body ?? {};
  if (typeof roleId !== "string" || (action !== "GIVE" && action !== "TAKE")) return res.status(400).json({ error: "Pick a role and give or take." });
  const result = await ctx.bot.startBulk(ctx.guild, roleId, action, readFilter(req.body), ctx.actor);
  if (!result.ok) return res.status(400).json({ error: result.message });
  res.json(result);
});

router.get(`${base}/bulk`, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const jobs = await prisma.bulkRoleJob.findMany({ where: { guildId: req.params.guildId }, orderBy: { createdAt: "desc" }, take: 10 });
  res.json(jobs.map(({ changedIds, ...j }) => ({ ...j, changedCount: changedIds.length })));
});

router.post(`${base}/bulk/:jobId/undo`, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const result = await ctx.bot.undoBulk(ctx.guild, req.params.jobId, ctx.actor);
  if (!result.ok) return res.status(400).json({ error: result.message });
  res.json(result);
});

router.get(`${base}/timed`, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const rows = await prisma.timedRole.findMany({ where: { guildId: ctx.guild.id }, orderBy: { expiresAt: "asc" }, take: 200 });
  const names = new Map<string, string>();
  for (const r of rows) {
    if (names.has(r.userId)) continue;
    const m = await ctx.guild.members.fetch(r.userId).catch(() => null);
    names.set(r.userId, m?.displayName ?? r.userId);
  }
  res.json(rows.map((r) => ({ id: r.id, userId: r.userId, displayName: names.get(r.userId), roleId: r.roleId, expiresAt: r.expiresAt.toISOString() })));
});

// Ends a timed role now, taking the role.
router.delete(`${base}/timed/:id`, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const t = await prisma.timedRole.findUnique({ where: { id: req.params.id } });
  if (!t || t.guildId !== ctx.guild.id) return res.status(404).json({ error: "Not found." });
  const result = await ctx.bot.changeRole(ctx.guild, t.userId, t.roleId, "TAKE", ctx.actor, "DASHBOARD");
  if (!result.ok) return res.status(400).json({ error: result.message });
  res.json(result);
});

router.get(`${base}/history`, requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const rows = await prisma.roleChangeLog.findMany({ where: { guildId: req.params.guildId }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json(rows);
});

export default router;
