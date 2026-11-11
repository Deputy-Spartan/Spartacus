import { Client, EmbedBuilder, Guild, GuildMember, PermissionFlagsBits, Role } from "discord.js";
import cron from "node-cron";
import { prisma } from "../../lib/prisma";
import { logError } from "@spartacus/db";
import { isModuleEnabled } from "../../lib/moduleGate";

// Roles with any of these are only handed out by the server owner.
const POWERFUL = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone,
];

export interface Actor {
  id: string;
  name: string;
  isOwner: boolean; // server owner
  member?: GuildMember | null; // set for Discord commands, so their own top role counts
}

export type Source = "DASHBOARD" | "DISCORD" | "BULK" | "TIMER" | "UNDO";

async function config(guildId: string) {
  return prisma.roleManagerConfig.findUnique({ where: { guildId } });
}

export const isPowerful = (role: Role) => POWERFUL.some((p) => role.permissions.has(p));

// Why a role can't be changed here, or null when it can.
export async function roleBlockReason(guild: Guild, role: Role, actor: Pick<Actor, "isOwner" | "member">, hidden?: string[]): Promise<string | null> {
  if (role.id === guild.id) return "@everyone can't be given or taken.";
  if (role.managed) return `${role.name} is managed by Discord or a bot (like a Booster or bot role).`;
  const hiddenIds = hidden ?? (await config(guild.id))?.hiddenRoleIds ?? [];
  if (hiddenIds.includes(role.id)) return `${role.name} is hidden in Role Manager settings.`;
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return "Spartacus needs the Manage Roles permission.";
  if (me.roles.highest.comparePositionTo(role) <= 0) return `${role.name} is above Spartacus's role. Drag Spartacus above it in Server Settings → Roles.`;
  if (isPowerful(role) && !actor.isOwner) return `${role.name} has powerful permissions, so only the server owner can give or take it.`;
  if (actor.member && !actor.isOwner && actor.member.roles.highest.comparePositionTo(role) <= 0) return `${role.name} is at or above your own top role.`;
  return null;
}

async function postLog(guild: Guild, text: string, color: number) {
  const cfg = await config(guild.id);
  if (!cfg?.logChannelId) return;
  const ch = await guild.channels.fetch(cfg.logChannelId).catch(() => null);
  if (ch?.isTextBased()) await ch.send({ embeds: [new EmbedBuilder().setColor(color).setDescription(text).setTimestamp()], allowedMentions: { parse: [] } }).catch(() => null);
}

async function log(guild: Guild, member: GuildMember, role: Role, action: "GIVE" | "TAKE" | "EXPIRED", source: Source, by: { id: string; name: string } | null, detail?: string) {
  await prisma.roleChangeLog
    .create({
      data: { guildId: guild.id, userId: member.id, username: member.user.tag, roleId: role.id, roleName: role.name, action, source, detail: detail ?? null, byUserId: by?.id ?? null, byName: by?.name ?? null },
    })
    .catch(() => null);
}

export function formatDuration(minutes: number) {
  if (minutes % 10080 === 0) return `${minutes / 10080} week${minutes === 10080 ? "" : "s"}`;
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// "30m", "2h", "3d", "1w" (or plain minutes) to minutes. Up to 1 year.
export function parseDuration(input: string): number | null {
  const m = input.trim().toLowerCase().match(/^(\d+)\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "m")[0];
  const minutes = unit === "w" ? n * 10080 : unit === "d" ? n * 1440 : unit === "h" ? n * 60 : n;
  return minutes >= 1 && minutes <= 525_600 ? minutes : null;
}

export interface ChangeResult {
  ok: boolean;
  message: string;
}

// Gives or takes one role from one member. Shared by the dashboard and /role.
export async function changeRole(
  guild: Guild,
  userId: string,
  roleId: string,
  action: "GIVE" | "TAKE",
  actor: Actor,
  source: Source,
  minutes?: number | null,
): Promise<ChangeResult> {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return { ok: false, message: "That role doesn't exist anymore." };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { ok: false, message: "That member isn't in the server." };
  const blocked = await roleBlockReason(guild, role, actor);
  if (blocked) return { ok: false, message: blocked };

  const has = member.roles.cache.has(role.id);
  const by = { id: actor.id, name: actor.name };
  try {
    if (action === "GIVE") {
      if (!has) await member.roles.add(role, `Role Manager: given by ${actor.name}`);
      if (minutes) {
        const expiresAt = new Date(Date.now() + minutes * 60_000);
        await prisma.timedRole.upsert({
          where: { guildId_userId_roleId: { guildId: guild.id, userId, roleId } },
          create: { guildId: guild.id, userId, roleId, expiresAt, byUserId: actor.id },
          update: { expiresAt, byUserId: actor.id },
        });
      } else {
        // Given for good now, so drop any timer.
        await prisma.timedRole.deleteMany({ where: { guildId: guild.id, userId, roleId } });
      }
      if (has && !minutes) return { ok: true, message: `${member.displayName} already has ${role.name}.` };
      await log(guild, member, role, "GIVE", source, by, minutes ? `for ${formatDuration(minutes)}` : undefined);
      await postLog(guild, `🎭 <@${actor.id}> gave <@&${role.id}> to <@${member.id}>${minutes ? ` for **${formatDuration(minutes)}**` : ""}.`, 0x2ecc71);
      const ts = minutes ? Math.floor((Date.now() + minutes * 60_000) / 1000) : null;
      return { ok: true, message: `Gave ${role.name} to ${member.displayName}${ts ? `. It's taken off <t:${ts}:R>` : ""}.` };
    }
    await prisma.timedRole.deleteMany({ where: { guildId: guild.id, userId, roleId } });
    if (!has) return { ok: true, message: `${member.displayName} doesn't have ${role.name}.` };
    await member.roles.remove(role, `Role Manager: taken by ${actor.name}`);
    await log(guild, member, role, "TAKE", source, by);
    await postLog(guild, `🎭 <@${actor.id}> took <@&${role.id}> from <@${member.id}>.`, 0xe67e22);
    return { ok: true, message: `Took ${role.name} from ${member.displayName}.` };
  } catch (err) {
    logError("bot", err, guild.id);
    return { ok: false, message: "Discord wouldn't let Spartacus change that role. Check Spartacus's role is above it." };
  }
}

// ---- Bulk ----

export interface BulkFilter {
  who: "everyone" | "has" | "missing"; // everyone, or members who have / don't have filterRoleId
  filterRoleId?: string | null;
  joinedWithinDays?: number | null;
  includeBots?: boolean;
}

// Every member the bulk change would actually touch.
export async function bulkTargets(guild: Guild, roleId: string, action: "GIVE" | "TAKE", filter: BulkFilter): Promise<GuildMember[]> {
  const out: GuildMember[] = [];
  const since = filter.joinedWithinDays ? Date.now() - filter.joinedWithinDays * 86_400_000 : null;
  let after: string | undefined;
  for (let page = 0; page < 200; page++) {
    const batch = await guild.members.list({ limit: 1000, after, cache: false });
    for (const m of batch.values()) {
      if (m.user.bot && !filter.includeBots) continue;
      if (filter.who !== "everyone" && filter.filterRoleId) {
        const has = m.roles.cache.has(filter.filterRoleId);
        if (filter.who === "has" ? !has : has) continue;
      }
      if (since && (m.joinedTimestamp ?? 0) < since) continue;
      const hasRole = m.roles.cache.has(roleId);
      if (action === "GIVE" ? hasRole : !hasRole) continue;
      out.push(m);
    }
    if (batch.size < 1000) break;
    after = batch.lastKey();
  }
  return out;
}

const running = new Set<string>();

export async function startBulk(guild: Guild, roleId: string, action: "GIVE" | "TAKE", filter: BulkFilter, actor: Actor): Promise<{ ok: boolean; message?: string; jobId?: string }> {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return { ok: false, message: "That role doesn't exist anymore." };
  const blocked = await roleBlockReason(guild, role, actor);
  if (blocked) return { ok: false, message: blocked };
  if (await prisma.bulkRoleJob.findFirst({ where: { guildId: guild.id, status: { in: ["RUNNING", "UNDOING"] } } })) {
    return { ok: false, message: "A bulk change is already running in this server. Wait for it to finish." };
  }
  const targets = await bulkTargets(guild, roleId, action, filter);
  if (!targets.length) return { ok: false, message: "Nobody matches, so there's nothing to change." };
  const job = await prisma.bulkRoleJob.create({
    data: { guildId: guild.id, roleId, action, filter: filter as object, total: targets.length, changedIds: [], byUserId: actor.id, byName: actor.name },
  });
  void runBulk(guild, job.id, role, action, targets, actor, "BULK");
  return { ok: true, jobId: job.id };
}

async function runBulk(guild: Guild, jobId: string, role: Role, action: "GIVE" | "TAKE", targets: GuildMember[], actor: Actor, source: Source) {
  running.add(jobId);
  const changed: string[] = [];
  let failed = 0;
  const by = { id: actor.id, name: actor.name };
  for (let i = 0; i < targets.length; i++) {
    const m = targets[i];
    const ok = await (action === "GIVE" ? m.roles.add(role, `Role Manager bulk by ${actor.name}`) : m.roles.remove(role, `Role Manager bulk by ${actor.name}`)).then(
      () => true,
      () => false,
    );
    if (ok) {
      changed.push(m.id);
      await log(guild, m, role, action, source, by, source === "UNDO" ? "Undo of a bulk change" : "Bulk change");
    } else failed++;
    if (i % 10 === 9 || i === targets.length - 1) {
      await prisma.bulkRoleJob.update({ where: { id: jobId }, data: source === "UNDO" ? {} : { done: changed.length, failed } }).catch(() => null);
    }
  }
  if (source === "UNDO") {
    await prisma.bulkRoleJob.update({ where: { id: jobId }, data: { status: "UNDONE" } }).catch(() => null);
  } else {
    await prisma.bulkRoleJob.update({ where: { id: jobId }, data: { status: "DONE", done: changed.length, failed, changedIds: changed, finishedAt: new Date() } }).catch(() => null);
    const verb = action === "GIVE" ? "gave" : "took";
    await postLog(guild, `👥 <@${actor.id}> ${verb} <@&${role.id}> ${action === "GIVE" ? "to" : "from"} **${changed.length}** member${changed.length === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}.`, 0x5865f2);
  }
  running.delete(jobId);
}

// Reverses a finished bulk change, within 24 hours.
export async function undoBulk(guild: Guild, jobId: string, actor: Actor): Promise<{ ok: boolean; message: string }> {
  const job = await prisma.bulkRoleJob.findUnique({ where: { id: jobId } });
  if (!job || job.guildId !== guild.id) return { ok: false, message: "That bulk change wasn't found." };
  if (job.status !== "DONE") return { ok: false, message: "Only a finished bulk change can be undone." };
  if (Date.now() - (job.finishedAt ?? job.createdAt).getTime() > 86_400_000) return { ok: false, message: "Bulk changes can only be undone within 24 hours." };
  const role = await guild.roles.fetch(job.roleId).catch(() => null);
  if (!role) return { ok: false, message: "That role doesn't exist anymore." };
  const blocked = await roleBlockReason(guild, role, actor);
  if (blocked) return { ok: false, message: blocked };
  const members: GuildMember[] = [];
  for (const id of job.changedIds) {
    const m = await guild.members.fetch(id).catch(() => null);
    if (m) members.push(m);
  }
  await prisma.bulkRoleJob.update({ where: { id: job.id }, data: { status: "UNDOING" } });
  void runBulk(guild, job.id, role, job.action === "GIVE" ? "TAKE" : "GIVE", members, actor, "UNDO");
  return { ok: true, message: `Undoing it for ${members.length} member${members.length === 1 ? "" : "s"}.` };
}

// ---- Timed roles ----

export function startRoleManagerJobs(client: Client) {
  // Bulk changes cut off by a restart can't resume, so mark them stopped.
  void prisma.bulkRoleJob.updateMany({ where: { status: { in: ["RUNNING", "UNDOING"] } }, data: { status: "STOPPED", finishedAt: new Date() } }).catch(() => null);

  cron.schedule("* * * * *", async () => {
    const due = await prisma.timedRole.findMany({ where: { expiresAt: { lte: new Date() } }, take: 100 });
    for (const t of due) {
      await prisma.timedRole.delete({ where: { id: t.id } }).catch(() => null);
      if (!(await isModuleEnabled(t.guildId, "ROLE_MANAGER"))) continue;
      const guild = client.guilds.cache.get(t.guildId);
      if (!guild) continue;
      const [member, role] = await Promise.all([guild.members.fetch(t.userId).catch(() => null), guild.roles.fetch(t.roleId).catch(() => null)]);
      if (!member || !role || !member.roles.cache.has(role.id)) continue;
      const ok = await member.roles.remove(role, "Role Manager: timed role ended").then(() => true, () => false);
      if (ok) {
        await log(guild, member, role, "EXPIRED", "TIMER", null, "Timed role ended");
        await postLog(guild, `⏳ <@&${role.id}> ended for <@${member.id}>.`, 0x95a5a6);
      }
    }
  });
}
