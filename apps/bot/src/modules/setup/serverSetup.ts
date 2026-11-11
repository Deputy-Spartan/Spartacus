import {
  ChannelType,
  GuildExplicitContentFilter,
  GuildSystemChannelFlags,
  GuildVerificationLevel,
  OverwriteType,
  PermissionFlagsBits,
  SnowflakeUtil,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type OverwriteResolvable,
  type Role,
  type TextChannel,
  type VoiceChannel,
} from "discord.js";
import {
  ARCHIVE_CATEGORY,
  BLUEPRINT_GAMES,
  BLUEPRINT_LEVEL_ROLES,
  BLUEPRINT_RULES,
  STREAMING_RULES,
  blueprintApplications,
  blueprintCategories,
  blueprintRoles,
  blueprintTicketTypes,
  blueprintGameChoices,
  blueprintOnboarding,
  blueprintPickers,
  blueprintSlug,
  type Access,
  type BlueprintCategory,
  type BlueprintChannel,
  type BlueprintGameId,
  type BlueprintLayout,
  type BlueprintRole,
  type ModuleKey,
} from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { invalidateModuleCache } from "../../lib/moduleGate";
import { postMatchGuide } from "../matches/serverSetup";

export type SetupPart = "roles" | "channels" | "settings" | "modules" | "onboarding";

// What a run can build, each switched on or off on the /server-setup screen.
export const SETUP_PARTS: Array<{ id: SetupPart; emoji: string; label: string; description: string }> = [
  { id: "roles", emoji: "🎭", label: "Roles", description: "Create, rename and sort the roles" },
  { id: "channels", emoji: "💬", label: "Channels", description: "Categories, channels and their permissions" },
  { id: "settings", emoji: "⚙️", label: "Server settings", description: "AFK channel, join messages, Community" },
  { id: "modules", emoji: "🧩", label: "Modules", description: "Welcome, rules, pickers, tickets, Matchmaking and more" },
  { id: "onboarding", emoji: "🧭", label: "Onboarding", description: "The questions new members answer" },
];

export interface SetupOptions {
  games: BlueprintGameId[];
  archiveOthers: boolean;
  layout?: BlueprintLayout; // leaving it out builds the gaming layout
  // With archiving on: unused old channels and roles are deleted instead of archived.
  deleteUnused?: boolean;
  // Fresh roles: delete every role that isn't in the new layout, even ones
  // people have. Layout roles that already exist are reused, so whoever has
  // them keeps them. Admin-power, bot, booster and Twitch roles always stay.
  freshRoles?: boolean;
  // Leaving these out builds everything.
  parts?: SetupPart[];
  categories?: string[];
}

export const partOn = (opts: SetupOptions, part: SetupPart) => !opts.parts || opts.parts.includes(part);
export const categoryOn = (opts: SetupOptions, key: string) => !opts.categories || opts.categories.includes(key);
// Old channels only move to the archive when every category is being built,
// so channels from a category that was skipped never get swept up.
export const archiveOn = (opts: SetupOptions) =>
  opts.archiveOthers && partOn(opts, "channels") && blueprintCategories(opts.games, opts.layout).every((c) => categoryOn(opts, c.key));
export const deleteOn = (opts: SetupOptions) => archiveOn(opts) && !!opts.deleteUnused;

type ChannelMatch = { spec: BlueprintChannel; category: BlueprintCategory; existing: GuildBasedChannel | null };
type CategoryMatch = { spec: BlueprintCategory; existing: CategoryChannel | null };

export interface SetupPlan {
  roles: Array<{ spec: BlueprintRole; existing: Role | null }>;
  categories: CategoryMatch[];
  channels: ChannelMatch[];
  archive: GuildBasedChannel[]; // old channels that move into the archive
  hideCategories: CategoryChannel[];
  // Only filled when deleting unused things is on.
  deleteChannels: GuildBasedChannel[];
  deleteCategories: CategoryChannel[];
  deleteRoles: Role[];
}

// "Unused" means nobody has posted in it for this long (or ever).
const UNUSED_DAYS = 30;
const lastActive = (c: GuildBasedChannel) => {
  const id = (c as { lastMessageId?: string | null }).lastMessageId;
  return id ? SnowflakeUtil.timestampFrom(id) : null;
};
function channelUnused(c: GuildBasedChannel, keep: Set<string>) {
  if (keep.has(c.id)) return false;
  if (isVoiceChannel(c) && (c as VoiceChannel).members?.size) return false;
  const last = lastActive(c);
  return last === null || Date.now() - last > UNUSED_DAYS * 86_400_000;
}

// Every role id any Spartacus setting points at, so those roles are never deleted.
async function rolesInUse(guildId: string): Promise<string> {
  const where = { where: { guildId } };
  const rows = await Promise.all([
    prisma.levelRole.findMany(where), prisma.reactionRole.findMany(where), prisma.joinRole.findMany(where), prisma.rolePanel.findMany(where),
    prisma.matchmakingConfig.findUnique(where), prisma.streamAlertSettings.findUnique(where), prisma.playingNowConfig.findUnique(where),
    prisma.rulesGateSettings.findUnique(where), prisma.verificationConfig.findUnique(where), prisma.ticketSettings.findUnique(where),
    prisma.ticketType.findMany(where), prisma.applicationType.findMany(where), prisma.eventSettings.findUnique(where), prisma.birthdayConfig.findUnique(where),
  ].map((q) => (q as Promise<unknown>).catch(() => null)));
  return JSON.stringify(rows);
}

const { ViewChannel, SendMessages, Connect, Speak, SendMessagesInThreads, AddReactions, ReadMessageHistory, EmbedLinks, ManageChannels, MoveMembers, ManageRoles } = PermissionFlagsBits;

const PERMS: Record<NonNullable<BlueprintRole["perms"]>, bigint[]> = {
  "admin-lite": [PermissionFlagsBits.ManageGuild, ManageChannels, ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.MentionEveryone, PermissionFlagsBits.ManageNicknames, MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.ManageEvents, PermissionFlagsBits.ManageThreads],
  moderator: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageNicknames, MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.ManageThreads],
  support: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers, MoveMembers],
  none: [],
};

const isVoiceKind = (kind: BlueprintChannel["kind"]) => kind === "voice";
const isVoiceChannel = (c: GuildBasedChannel) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice;
const slugsOf = (name: string, aliases: string[] = []) => new Set([blueprintSlug(name), ...aliases.map(blueprintSlug)].filter(Boolean));

// ---- Planning: what's reused, what's new, what moves to the archive ----

export async function planSetup(guild: Guild, opts: SetupOptions): Promise<SetupPlan> {
  await guild.roles.fetch().catch(() => null);
  await guild.channels.fetch().catch(() => null);
  const roleSpecs = blueprintRoles(opts.games, opts.layout);
  const usedRoles = new Set<string>();
  const roles = roleSpecs.map((spec) => {
    const wanted = slugsOf(spec.name, spec.aliases);
    const existing =
      [...guild.roles.cache.values()]
        .filter((r) => !r.managed && r.id !== guild.id && !usedRoles.has(r.id) && wanted.has(blueprintSlug(r.name)))
        .sort((a, b) => b.position - a.position)[0] ?? null;
    if (existing) usedRoles.add(existing.id);
    return { spec, existing };
  });

  const specs = blueprintCategories(opts.games, opts.layout);
  const all = [...guild.channels.cache.values()].filter((c) => !c.isThread());
  const tempIds = new Set((await prisma.tempChannelInstance.findMany({ where: { guildId: guild.id } })).flatMap((t) => [t.channelId, t.textChannelId].filter(Boolean) as string[]));
  // Channels Spartacus already uses for a job keep that job, before any name matching.
  const [mm, welcome, rules, lobby] = await Promise.all([
    prisma.matchmakingConfig.findUnique({ where: { guildId: guild.id } }),
    prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } }),
    prisma.rulesGateSettings.findUnique({ where: { guildId: guild.id } }),
    prisma.tempChannelLobby.findFirst({ where: { guildId: guild.id } }),
  ]);
  const inUse: Record<string, string | null | undefined> = {
    "mm-board": mm?.channelId, "mm-threads": mm?.activityChannelId, "mm-leaderboard": mm?.boardChannelId, "mm-lobby": mm?.lobbyVoiceId,
    welcome: welcome?.channelId, rules: rules?.channelId, squad: lobby?.lobbyChannelId, duels: mm?.duelCategoryId, teammatches: mm?.teamCategoryId,
    rooms: mm?.teamCategoryId ?? mm?.duelCategoryId, "mm-tournaments": mm?.tournamentChannelId,
  };

  const usedCats = new Set<string>();
  const categoryOf = (key: string, wanted: Set<string>) => {
    const configured = all.find((c) => c.id === inUse[key] && c.type === ChannelType.GuildCategory);
    return (configured ?? all.find((c) => c.type === ChannelType.GuildCategory && !usedCats.has(c.id) && wanted.has(blueprintSlug(c.name)))) as CategoryChannel | undefined;
  };
  for (const id of opts.layout === "streaming" ? [] : [inUse.duels, inUse.teammatches]) if (id) usedCats.add(id);
  const categories: CategoryMatch[] = specs.map((spec) => {
    const existing = categoryOf(spec.key, slugsOf(spec.name, spec.aliases)) ?? null;
    if (existing) usedCats.add(existing.id);
    return { spec, existing };
  });

  const usedChannels = new Set<string>();
  const channels: ChannelMatch[] = [];
  const configured = new Map<string, GuildBasedChannel>();
  for (const cat of categories) {
    for (const spec of cat.spec.channels) {
      const c = all.find((x) => x.id === inUse[spec.key] && x.type !== ChannelType.GuildCategory && isVoiceChannel(x) === isVoiceKind(spec.kind));
      if (c && !usedChannels.has(c.id)) {
        configured.set(spec.key, c);
        usedChannels.add(c.id);
      }
    }
  }
  for (const cat of categories) {
    for (const spec of cat.spec.channels) {
      if (configured.has(spec.key)) {
        channels.push({ spec, category: cat.spec, existing: configured.get(spec.key)! });
        continue;
      }
      const wanted = slugsOf(spec.name, spec.aliases);
      const candidates = all.filter((c) => c.type !== ChannelType.GuildCategory && !usedChannels.has(c.id) && !tempIds.has(c.id) && isVoiceChannel(c) === isVoiceKind(spec.kind) && wanted.has(blueprintSlug(c.name)));
      // Prefer the exact new name, then a channel already in the matching category.
      const exact = candidates.find((c) => blueprintSlug(c.name) === blueprintSlug(spec.name));
      const sameCategory = candidates.find((c) => cat.existing && c.parentId === cat.existing.id);
      const existing = exact ?? sameCategory ?? candidates[0] ?? null;
      if (existing) usedChannels.add(existing.id);
      channels.push({ spec, category: cat.spec, existing });
    }
  }

  // Match rooms live in the 1v1 and Team Matches categories while a game runs.
  const liveRoomParents = new Set(categories.filter((c) => c.spec.key === "duels" || c.spec.key === "teammatches" || c.spec.key === "rooms").map((c) => c.existing?.id).filter(Boolean));
  const archiveCat = all.find((c) => c.type === ChannelType.GuildCategory && c.name === ARCHIVE_CATEGORY);
  const archive = opts.archiveOthers
    ? all.filter((c) => c.type !== ChannelType.GuildCategory && !usedChannels.has(c.id) && !tempIds.has(c.id) && !liveRoomParents.has(c.parentId ?? "") && c.parentId !== archiveCat?.id)
    : [];
  let hideCategories = opts.archiveOthers ? (all.filter((c) => c.type === ChannelType.GuildCategory && !usedCats.has(c.id) && c.id !== archiveCat?.id) as CategoryChannel[]) : [];

  // Deleting unused: old channels nobody posted in for 30+ days, old categories
  // that end up empty, and roles nobody has that Spartacus doesn't use.
  // Everything else still moves to the archive. Discord's own special
  // channels (rules, updates, AFK, system) are never deleted.
  let deleteChannels: GuildBasedChannel[] = [];
  let deleteCategories: CategoryChannel[] = [];
  let deleteRoles: Role[] = [];
  if (opts.archiveOthers && opts.deleteUnused) {
    const keep = new Set([guild.rulesChannelId, guild.publicUpdatesChannelId, guild.systemChannelId, guild.afkChannelId, guild.safetyAlertsChannelId, guild.widgetChannelId].filter(Boolean) as string[]);
    deleteChannels = archive.filter((c) => channelUnused(c, keep));
    const gone = new Set(archive.map((c) => c.id));
    // A category goes only if everything in it is leaving (moved or deleted).
    deleteCategories = hideCategories.filter((cat) => all.every((c) => c.parentId !== cat.id || gone.has(c.id)));
    const doomed = new Set(deleteCategories.map((c) => c.id));
    hideCategories = hideCategories.filter((c) => !doomed.has(c.id));

    await guild.members.fetch().catch(() => null);
    const used = await rolesInUse(guild.id);
    const top = guild.members.me?.roles.highest;
    deleteRoles = [...guild.roles.cache.values()].filter(
      (r) => r.id !== guild.id && !r.managed && !usedRoles.has(r.id) && r.members.size === 0 && !!top && top.comparePositionTo(r) > 0 && !used.includes(r.id)
    );
  }
  if (opts.freshRoles && partOn(opts, "roles")) {
    await guild.members.fetch().catch(() => null);
    const top = guild.members.me?.roles.highest;
    const powers = PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild;
    deleteRoles = [...guild.roles.cache.values()].filter(
      (r) => r.id !== guild.id && !r.managed && !usedRoles.has(r.id) && !!top && top.comparePositionTo(r) > 0 && (r.permissions.bitfield & powers) === 0n
    );
  }
  const deleting = new Set(deleteChannels.map((c) => c.id));
  return { roles, categories, channels, archive: archive.filter((c) => !deleting.has(c.id)), hideCategories, deleteChannels, deleteCategories, deleteRoles };
}

// Counts what a run would change. With `opts`, only the parts and categories picked.
export function summarizePlan(plan: SetupPlan, opts?: SetupOptions) {
  const count = <T>(list: T[], pick: (x: T) => unknown) => ({ reuse: list.filter((x) => pick(x)).length, create: list.filter((x) => !pick(x)).length });
  const channels = !opts || partOn(opts, "channels");
  return {
    roles: count(!opts || partOn(opts, "roles") ? plan.roles : [], (r) => r.existing),
    categories: count(channels ? plan.categories.filter((c) => !opts || categoryOn(opts, c.spec.key)) : [], (c) => c.existing),
    channels: count(channels ? plan.channels.filter((c) => !opts || categoryOn(opts, c.category.key)) : [], (c) => c.existing),
    archive: !opts || archiveOn(opts) ? plan.archive.length : 0,
    hideCategories: !opts || archiveOn(opts) ? plan.hideCategories.length : 0,
    deleteChannels: !opts || deleteOn(opts) ? plan.deleteChannels.length : 0,
    deleteCategories: !opts || deleteOn(opts) ? plan.deleteCategories.length : 0,
    deleteRoles: !opts || deleteOn(opts) || opts.freshRoles ? plan.deleteRoles.length : 0,
  };
}

// ---- Building ----

type Ids = { roles: Map<string, string>; channels: Map<string, string>; categories: Map<string, string> };

function overwritesFor(guild: Guild, access: Access, voice: boolean, ids: Ids): OverwriteResolvable[] {
  const role = (key: string) => ids.roles.get(key);
  const talk = voice ? [ViewChannel, Connect, Speak] : [ViewChannel, SendMessages, SendMessagesInThreads, AddReactions, ReadMessageHistory, EmbedLinks];
  const read = voice ? [ViewChannel] : [ViewChannel, ReadMessageHistory, AddReactions, SendMessagesInThreads];
  const noTalk = voice ? [Connect] : [SendMessages];
  const out: OverwriteResolvable[] = [];
  const add = (id: string | undefined, allow: bigint[], deny: bigint[] = []) => {
    if (id) out.push({ id, type: OverwriteType.Role, allow, deny });
  };

  if (access.see === "everyone") add(guild.id, access.talk ? talk : read, access.talk ? [] : noTalk);
  else add(guild.id, [], [ViewChannel]);
  if (access.see === "member") add(role("member"), access.talk ? talk : read, access.talk ? [] : noTalk);
  if (access.see === "role") add(role(access.role), access.talk ? talk : read, access.talk ? [] : noTalk);
  if (access.see === "roles") for (const key of access.roles) add(role(key), access.talk ? talk : read, access.talk ? [] : noTalk);
  // Staff can always see and post, including in read-only and staff channels.
  for (const key of ["staff", "admin", "mod", "support"]) add(role(key), voice ? [ViewChannel, Connect, Speak, MoveMembers] : [...talk]);
  if (guild.members.me) out.push({ id: guild.members.me.id, type: OverwriteType.Member, allow: [ViewChannel, SendMessages, EmbedLinks, Connect, MoveMembers, ManageChannels, ReadMessageHistory] });
  return out;
}

async function snapshot(guild: Guild) {
  const roles = [...guild.roles.cache.values()].map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, permissions: r.permissions.bitfield.toString(), position: r.position, mentionable: r.mentionable, managed: r.managed }));
  const channels = [...guild.channels.cache.values()]
    .filter((c) => !c.isThread())
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parent_id: c.parentId,
      position: "position" in c ? c.position : 0,
      topic: "topic" in c ? c.topic : null,
      permission_overwrites: "permissionOverwrites" in c ? [...c.permissionOverwrites.cache.values()].map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })) : [],
    }));
  await prisma.serverBackup.create({ data: { guildId: guild.id, name: `Before Server Setup · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, data: { roles, channels } as object } });
}

// Fills settings that are still empty; anything set on the dashboard stays.
async function fillSettings(model: string, guildId: string, values: Record<string, unknown>) {
  const delegate = (prisma as unknown as Record<string, { findUnique: Function; create: Function; update: Function }>)[model];
  const current = await delegate.findUnique({ where: { guildId } });
  if (!current) return delegate.create({ data: { guildId, ...values } });
  const blank = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
  const missing = Object.fromEntries(Object.entries(values).filter(([k]) => blank((current as Record<string, unknown>)[k])));
  return Object.keys(missing).length ? delegate.update({ where: { guildId }, data: missing }) : current;
}

// The streaming layout turns on nearly everything. Off: Verification and
// Rules Gate (it's an open door), Honeypot (needs a trap channel you place),
// Bump Reminder (only for Disboard), and AI Chat / AI Moderation (they make a
// paid AI call per message; switch them on in Modules if you want them).
const STREAMING_MODULES_ON: ModuleKey[] = [
  "WELCOME", "REACTION_ROLES", "ANNOUNCEMENTS", "EVENTS", "GIVEAWAYS", "STREAM_ALERTS", "LEVELING", "POLLS", "SUGGESTIONS", "LFG",
  "MATCHES", "PLAYING_NOW", "TEMP_CHANNELS", "TICKETS", "APPLICATIONS", "PLAYER_REPORTS", "MODERATION", "WARN_ESCALATION", "ANTI_RAID", "ANTI_NUKE",
  "PERM_WATCH", "STAT_CHANNELS", "STATUS_CHANNEL", "SERVER_BACKUP", "MOD_DIGEST", "STARBOARD", "COUNTING_GAME", "CONFESSIONS", "BIRTHDAYS", "ECONOMY",
  "TRIVIA", "CASINO", "WEEKLY_RECAP", "MEMBER_MILESTONES", "INVITE_TRACKING", "MODMAIL", "SUPPORT_INTAKE", "ROLE_PERSISTENCE", "QUARANTINE", "REMINDERS",
  "VOICE_ACTIVITY", "ACHIEVEMENTS", "RANK_CARDS", "PROFILE_CARDS", "PRESTIGE", "GROWTH_ANALYTICS", "SUGGESTION_ANALYTICS", "CUSTOM_COMMANDS", "SCHEDULED_MESSAGES", "EMBED_CREATOR",
  "STICKY_MESSAGES", "CHANNEL_LOCKS", "SLOW_MODE", "ROLE_MANAGER", "SERVER_TEMPLATES", "BAN_APPEALS",
];
const modulesOn = (opts: SetupOptions) => (opts.layout === "streaming" ? STREAMING_MODULES_ON : MODULES_ON);

const MODULES_ON: ModuleKey[] = [
  "WELCOME", "RULES_GATE", "REACTION_ROLES", "ANNOUNCEMENTS", "EVENTS", "GIVEAWAYS", "STREAM_ALERTS", "LEVELING", "POLLS", "SUGGESTIONS",
  "LFG", "MATCHES", "TEMP_CHANNELS", "TICKETS", "APPLICATIONS", "PLAYER_REPORTS", "MODERATION", "WARN_ESCALATION", "ANTI_RAID", "ANTI_NUKE",
  "PERM_WATCH", "STAT_CHANNELS", "STATUS_CHANNEL", "SERVER_BACKUP", "MOD_DIGEST",
];

export interface SetupResult {
  done: string[];
  notes: string[];
}

export async function runSetup(guild: Guild, opts: SetupOptions, progress: (line: string) => Promise<void>): Promise<SetupResult> {
  const done: string[] = [];
  const notes: string[] = [];
  const step = async (line: string) => {
    done.push(line);
    await progress(line).catch(() => null);
  };
  const ids: Ids = { roles: new Map(), channels: new Map(), categories: new Map() };
  const me = guild.members.me;
  const topPosition = me?.roles.highest.position ?? 0;
  const plan = await planSetup(guild, opts);

  await snapshot(guild).then(() => step("🗄️ Backup saved (Server Backup on the dashboard)"), (err) => {
    logError("bot", err, guild.id);
    notes.push("The backup couldn't be saved, so nothing was changed.");
    throw err;
  });

  if (partOn(opts, "roles")) {
    // Roles, created bottom-up so the first in the list ends up highest.
    let createdRoles = 0, renamedRoles = 0;
    for (const { spec, existing } of [...plan.roles].reverse()) {
      if (existing) {
        ids.roles.set(spec.key, existing.id);
        if (existing.name !== spec.name && existing.position < topPosition) {
          await existing.setName(spec.name, "Server Setup").then(() => renamedRoles++, () => notes.push(`Couldn't rename the ${existing.name} role.`));
        }
        continue;
      }
      const role = await guild.roles
        .create({ name: spec.name, color: spec.color || undefined, hoist: spec.hoist ?? false, permissions: PERMS[spec.perms ?? "none"], mentionable: spec.key.startsWith("ping:"), reason: "Server Setup" })
        .catch((err) => {
          logError("bot", err, guild.id);
          notes.push(`Couldn't create the ${spec.name} role.`);
          return null;
        });
      if (role) {
        ids.roles.set(spec.key, role.id);
        createdRoles++;
      }
    }
    await step(`🎭 Roles: ${createdRoles} new, ${renamedRoles} renamed, ${plan.roles.length - createdRoles - renamedRoles} already right`);

    // New roles land at the bottom in whatever order Discord gives them, so
    // put them in the blueprint's order: Admin highest, ping roles lowest,
    // all under Spartacus's own role. Roles above Spartacus can't be moved.
    const ordered = plan.roles
      .map(({ spec }) => guild.roles.cache.get(ids.roles.get(spec.key) ?? ""))
      .filter((r): r is Role => !!r && !!me && me.roles.highest.comparePositionTo(r) > 0);
    if (ordered.length > 1) {
      const sorted = await guild.roles
        .setPositions(ordered.map((role, i) => ({ role, position: ordered.length - i })))
        .then(() => true, (err) => {
          logError("bot", err, guild.id);
          return false;
        });
      if (!sorted) notes.push("Couldn't sort the roles. Move Spartacus's role to the top in Server Settings → Roles, then run this again.");
    }
    if (ordered.length < ids.roles.size) notes.push("Some roles are above Spartacus's role, so they keep their place. Move Spartacus's role to the top in Server Settings → Roles, then run this again to sort them.");
  } else {
    // Skipped: channels and onboarding still use the roles that are already there.
    for (const { spec, existing } of plan.roles) if (existing) ids.roles.set(spec.key, existing.id);
  }

  // Roles Discord manages itself, used for the supporters area: Server
  // Booster, and the Twitch subscriber role from Server Settings → Integrations.
  const booster = guild.roles.premiumSubscriberRole;
  if (booster) ids.roles.set("booster", booster.id);
  const twitch = guild.roles.cache.find((r) => r.managed && !!r.tags?.integrationId && /sub/i.test(r.name));
  if (twitch) ids.roles.set("twitchsub", twitch.id);

  // Categories in order, then their channels.
  const buildChannels = partOn(opts, "channels");
  let position = 0;
  for (const { spec, existing } of plan.categories) {
    if (!buildChannels || !categoryOn(opts, spec.key)) {
      if (existing) ids.categories.set(spec.key, existing.id);
      position++;
      continue;
    }
    const overwrites = overwritesFor(guild, spec.access, false, ids);
    const cat =
      existing ??
      ((await guild.channels.create({ name: spec.name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: "Server Setup" }).catch((err) => {
        logError("bot", err, guild.id);
        notes.push(`Couldn't create the ${spec.name} category.`);
        return null;
      })) as CategoryChannel | null);
    if (!cat) continue;
    ids.categories.set(spec.key, cat.id);
    if (existing) {
      await cat.edit({ ...(cat.name !== spec.name ? { name: spec.name } : {}), permissionOverwrites: overwrites, reason: "Server Setup" }).catch(() => notes.push(`Couldn't update the ${spec.name} category.`));
    }
    await cat.setPosition(position++).catch(() => null);
  }
  const chosenCategories = plan.categories.filter((c) => buildChannels && categoryOn(opts, c.spec.key));
  if (buildChannels) await step(`📁 Categories: ${chosenCategories.filter((c) => !c.existing).length} new, ${chosenCategories.filter((c) => c.existing).length} renamed and sorted`);

  const maxBitrate = guild.maximumBitrate ?? 96000;
  let createdChannels = 0, movedChannels = 0;
  const order = new Map<string, number>();
  for (const { spec, category, existing } of plan.channels) {
    if (!buildChannels || !categoryOn(opts, category.key)) {
      if (existing) ids.channels.set(spec.key, existing.id);
      continue;
    }
    const parent = ids.categories.get(category.key);
    const voice = isVoiceKind(spec.kind);
    const access = spec.key === "stat-members" ? ({ see: "everyone", talk: false } as Access) : spec.access ?? category.access;
    const overwrites = overwritesFor(guild, access, voice, ids);
    // Game channels sit in Games but only open with that game's role.
    const type = voice ? ChannelType.GuildVoice : spec.kind === "announcement" && guild.features.includes("COMMUNITY") ? ChannelType.GuildAnnouncement : ChannelType.GuildText;
    const extra = voice ? { bitrate: Math.min(128000, maxBitrate), userLimit: spec.userLimit } : { topic: spec.topic };
    let channel = existing;
    if (channel) {
      // Discord allows two renames per channel every 10 minutes, and the member count renames itself.
      const rename = channel.name !== spec.name && spec.key !== "stat-members" ? { name: spec.name } : {};
      await (channel as GuildBasedChannel & { edit: Function })
        .edit({ ...rename, parent: parent ?? null, permissionOverwrites: overwrites, ...extra, reason: "Server Setup" })
        .then(() => movedChannels++, (err: unknown) => {
          logError("bot", err, guild.id);
          notes.push(`Couldn't update #${existing!.name}.`);
        });
    } else {
      channel = (await guild.channels.create({ name: spec.name, type, parent: parent ?? undefined, permissionOverwrites: overwrites, ...extra, reason: "Server Setup" } as never).catch((err) => {
        logError("bot", err, guild.id);
        notes.push(`Couldn't create ${spec.name}.`);
        return null;
      })) as GuildBasedChannel | null;
      if (channel) createdChannels++;
    }
    if (!channel) continue;
    ids.channels.set(spec.key, channel.id);
    const n = order.get(category.key) ?? 0;
    order.set(category.key, n + 1);
    if ("setPosition" in channel) await (channel as { setPosition: (p: number) => Promise<unknown> }).setPosition(n).catch(() => null);
  }
  if (buildChannels) await step(`💬 Channels: ${createdChannels} new, ${movedChannels} renamed and moved`);

  // Unused old channels are deleted (when that's on); everything else goes
  // into a hidden archive.
  if (deleteOn(opts) && plan.deleteChannels.length) {
    let gone = 0;
    for (const c of plan.deleteChannels) await c.delete("Server Setup: unused").then(() => gone++, () => notes.push(`Couldn't delete #${c.name}, so it was left where it is.`));
    await step(`🧹 Deleted ${gone} unused channel${gone === 1 ? "" : "s"}`);
  }
  if ((deleteOn(opts) || opts.freshRoles) && plan.deleteRoles.length) {
    const deleted: string[] = [];
    for (const r of plan.deleteRoles) {
      await r.delete(opts.freshRoles ? "Server Setup: fresh roles" : "Server Setup: nobody has it").then(() => deleted.push(r.id), () => notes.push(`Couldn't delete the ${r.name} role.`));
    }
    // Spartacus settings that pointed at a deleted role are cleared, so nothing
    // keeps trying to give out a role that's gone.
    if (deleted.length) {
      const where = { guildId: guild.id, roleId: { in: deleted } };
      await Promise.all([prisma.levelRole.deleteMany({ where }), prisma.joinRole.deleteMany({ where }), prisma.reactionRole.deleteMany({ where })].map((q) => q.catch(() => null)));
    }
    await step(opts.freshRoles ? `🎭 Fresh roles: deleted ${deleted.length} old role${deleted.length === 1 ? "" : "s"} that aren't in the new layout` : `🧹 Deleted ${deleted.length} unused role${deleted.length === 1 ? "" : "s"}`);
  }
  if (archiveOn(opts) && (plan.archive.length || plan.hideCategories.length || plan.deleteCategories.length)) {
    const staffOnly = overwritesFor(guild, { see: "staff", talk: true }, false, ids);
    const archiveCat =
      (guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === ARCHIVE_CATEGORY) as CategoryChannel | undefined) ??
      ((await guild.channels.create({ name: ARCHIVE_CATEGORY, type: ChannelType.GuildCategory, permissionOverwrites: staffOnly, reason: "Server Setup" }).catch(() => null)) as CategoryChannel | null);
    let archived = 0;
    if (archiveCat) {
      await archiveCat.setPosition(guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size).catch(() => null);
      for (const c of plan.archive) {
        await (c as GuildBasedChannel & { edit: Function }).edit({ parent: archiveCat.id, lockPermissions: true, reason: "Server Setup archive" }).then(() => archived++, () => notes.push(`Couldn't archive #${c.name}.`));
      }
    }
    for (const cat of plan.hideCategories) await cat.edit({ permissionOverwrites: staffOnly, reason: "Server Setup archive" }).catch(() => null);
    // Old categories that are now empty are removed.
    let catsGone = 0;
    for (const cat of plan.deleteCategories) {
      const fresh = (await guild.channels.fetch(cat.id).catch(() => null)) as CategoryChannel | null;
      if (fresh && fresh.children.cache.size === 0) await fresh.delete("Server Setup: empty").then(() => catsGone++, () => null);
      else if (fresh) await fresh.edit({ permissionOverwrites: staffOnly, reason: "Server Setup archive" }).catch(() => null);
    }
    await step(`📦 Archived ${archived} old channel${archived === 1 ? "" : "s"} into ${ARCHIVE_CATEGORY} (hidden)${catsGone ? `, removed ${catsGone} empty old categor${catsGone === 1 ? "y" : "ies"}` : ""}`);
  }

  if (partOn(opts, "settings")) {
    await setupServerSettings(guild, opts, ids, notes);
    await step("⚙️ Server settings: AFK channel, join messages and Community");
  }
  if (partOn(opts, "modules")) {
    await setupModules(guild, opts, ids, notes);
    await step(`🧩 Modules set up and switched on: ${modulesOn(opts).length}`);
  }
  if (partOn(opts, "onboarding")) await setupOnboarding(guild, opts, ids, notes).then((line) => step(line));

  const mods = guild.roles.cache.filter((r) => !r.managed && r.permissions.has(PermissionFlagsBits.Administrator) && r.members.some((m) => !m.user.bot));
  if (mods.size) notes.push(`These roles give people Administrator: ${mods.map((r) => r.name).join(", ")}. Consider giving them only the permissions they need.`);
  return { done, notes };
}

async function setupServerSettings(guild: Guild, opts: SetupOptions, ids: Ids, notes: string[]) {
  const afk = ids.channels.get("afk");
  await guild.edit({ afkChannel: afk ?? null, afkTimeout: 900, reason: "Server Setup" }).catch(() => notes.push("Couldn't set the AFK channel."));
  // Spartacus posts the welcome, so Discord's own join message is turned off.
  await guild.setSystemChannelFlags(guild.systemChannelFlags.add(GuildSystemChannelFlags.SuppressJoinNotifications)).catch(() => null);

  if (opts.layout === "streaming" && guild.verificationLevel < GuildVerificationLevel.Medium) {
    await guild.setVerificationLevel(GuildVerificationLevel.Medium, "Server Setup").catch(() => notes.push("Couldn't raise the verification level to Medium."));
  }
  const rules = ids.channels.get("rules");
  const updates = ids.channels.get("staff-chat");
  if (!guild.features.includes("COMMUNITY") && rules && updates) {
    await guild
      .edit({
        features: [...guild.features, "COMMUNITY"],
        rulesChannel: rules,
        publicUpdatesChannel: updates,
        // An open streaming server gets Medium (account 5+ minutes old, verified email).
        verificationLevel: Math.max(guild.verificationLevel, opts.layout === "streaming" ? GuildVerificationLevel.Medium : GuildVerificationLevel.Low),
        explicitContentFilter: GuildExplicitContentFilter.AllMembers,
        reason: "Server Setup",
      } as never)
      .catch(() => notes.push("Couldn't turn on Community. Turn it on in Server Settings → Enable Community, then run /server-setup again for onboarding."));
  }
}

async function setupModules(guild: Guild, opts: SetupOptions, ids: Ids, notes: string[]) {
  const g = guild.id;
  const ch = (key: string) => ids.channels.get(key) ?? null;
  const role = (key: string) => ids.roles.get(key) ?? null;
  const cat = (key: string) => ids.categories.get(key) ?? null;
  const streaming = opts.layout === "streaming";
  const staffRoles = (streaming ? ["mod", "admin"] : ["staff", "support"]).map(role).filter(Boolean) as string[];

  const tasks: Array<[string, () => Promise<unknown>]> = [
    ["Welcome", () =>
      fillSettings("welcomeConfig", g, {
        channelId: ch("welcome"),
        leaveChannelId: ch("server-log"),
        pingAboveEmbed: false,
        embedEnabled: true,
        welcomeText: streaming
          ? `Welcome to **{server}**, {user}! Say hi in <#${ch("general")}>, check <#${ch("events")}> for the next stream, and pick your pings in <#${ch("roles")}>.`
          : `Welcome to **{server}**, {user}! Read and accept <#${ch("rules")}>, then pick your games in <#${ch("roles")}>.`,
        goodbyeText: "{user} left {server}.",
      })],
    ["Rules", async () => {
      if (!streaming) return fillSettings("rulesGateSettings", g, { channelId: ch("rules"), roleId: role("member"), logChannelId: ch("server-log"), defaultEmbedTitle: "📜 Server Rules", defaultEmbedDescription: BLUEPRINT_RULES });
      // Open door: just post the rules in the rules channel if it's empty.
      const rulesCh = ch("rules") ? await guild.channels.fetch(ch("rules")!).catch(() => null) : null;
      if (!rulesCh || !rulesCh.isTextBased()) return;
      const last = await (rulesCh as TextChannel).messages.fetch({ limit: 1 }).catch(() => null);
      if (!last?.size) await (rulesCh as TextChannel).send({ embeds: [{ color: 0xe67e22, title: "📜 Rules", description: STREAMING_RULES }] });
    }],
    ["Logging", () => fillSettings("loggingConfig", g, { logChannelId: ch("mod-log") })],
    ["Anti-Raid", () => fillSettings("antiRaidConfig", g, { alertChannelId: ch("server-log") })],
    ["Anti-Nuke", () => fillSettings("antiNukeConfig", g, { alertChannelId: ch("server-log") })],
    ["Perm Watch", () => fillSettings("permWatchConfig", g, { alertChannelId: ch("server-log") })],
    ["Events", () => fillSettings("eventSettings", g, { defaultChannelId: ch("events"), mentionRoleId: role("ping:events") })],
    ["Leveling", async () => {
      await fillSettings("levelingSettings", g, { channelId: ch("botcmds") });
      for (const { level, role: key } of BLUEPRINT_LEVEL_ROLES) {
        const roleId = role(key);
        if (roleId && !(await prisma.levelRole.findFirst({ where: { guildId: g, level } }))) await prisma.levelRole.create({ data: { guildId: g, level, roleId } });
      }
    }],
    ["Warn Escalation", () => fillSettings("warnEscalationSettings", g, {})],
    ["Weekly Staff Report", () => fillSettings("modDigestSettings", g, { channelId: ch(streaming ? "staff-chat" : "staff-desk") })],
    ["Player Reports", () => fillSettings("playerReportSettings", g, { staffRoleId: role(streaming ? "mod" : "staff") })],
    ["Tickets", async () => {
      await fillSettings("ticketSettings", g, { logChannelId: ch(streaming ? "transcripts" : "staff-desk"), transcriptChannelId: ch(streaming ? "transcripts" : "staff-desk"), supportRoleIds: staffRoles });
      const typeIds: string[] = [];
      for (const t of blueprintTicketTypes(opts.layout)) {
        const found = await prisma.ticketType.findFirst({ where: { guildId: g, name: t.name } });
        const type = found ?? (await prisma.ticketType.create({ data: { guildId: g, name: t.name, emoji: t.emoji, description: t.description, categoryId: cat("support"), staffRoleIds: staffRoles } }));
        typeIds.push(type.id);
      }
      const support = ch("support");
      if (support && !(await prisma.ticketPanel.findFirst({ where: { guildId: g, channelId: support } }))) {
        await prisma.ticketPanel.create({ data: { guildId: g, name: "Support", channelId: support, typeIds, description: "Open a private ticket and staff will reply there.", categoryId: cat("support"), supportRoleId: role("support") } });
      }
    }],
    ["Applications", async () => {
      await fillSettings("applicationSettings", g, { logChannelId: ch("staff-desk"), supportRoleIds: staffRoles });
      const typeIds: string[] = [];
      for (const a of blueprintApplications(opts.layout)) {
        const found = await prisma.applicationType.findFirst({ where: { guildId: g, name: a.name } });
        const type =
          found ??
          (await prisma.applicationType.create({
            data: { guildId: g, name: a.name, emoji: a.emoji, description: a.description, reviewChannelId: ch("staff-desk"), staffRoleIds: staffRoles, questions: a.questions.map((label) => ({ label, style: "PARAGRAPH", required: true })) },
          }));
        typeIds.push(type.id);
      }
      const applyCh = ch(streaming ? "apply" : "support");
      if (applyCh && !(await prisma.applicationPanel.findFirst({ where: { guildId: g, channelId: applyCh } }))) {
        await prisma.applicationPanel.create({ data: { guildId: g, name: streaming ? "Apply" : "Join the Team", channelId: applyCh, typeIds, description: "Apply below. You'll get a DM when staff decide." } });
      }
    }],
    ["Role pickers", async () => {
      const rolesChannel = ch("roles");
      if (!rolesChannel) return;
      for (const picker of blueprintPickers(opts.games, opts.layout)) {
        if (await prisma.rolePanel.findFirst({ where: { guildId: g, name: picker.name } })) continue;
        const options = picker.options.map((o) => ({ roleIds: [o.role ? role(o.role) : null].filter(Boolean), channelIds: [], label: o.label, emoji: o.emoji })).filter((o) => o.roleIds.length);
        if (options.length) await prisma.rolePanel.create({ data: { guildId: g, name: picker.name, channelId: rolesChannel, description: picker.description, layout: "DROPDOWN", options } });
      }
    }],
    ["Temp Channels", async () => {
      const lobby = ch("squad");
      if (!lobby) return;
      const gameChoices = blueprintGameChoices(opts.games);
      const existing = await prisma.tempChannelLobby.findFirst({ where: { guildId: g, lobbyChannelId: lobby } });
      if (streaming) {
        if (!existing) await prisma.tempChannelLobby.create({ data: { guildId: g, name: "Create a VC", lobbyChannelId: lobby, categoryId: cat("voice"), nameFormat: "🔊 {user}'s VC", userLimit: 0, bitrate: Math.min(128000, guild.maximumBitrate ?? 96000) } });
        return;
      }
      if (!existing) {
        await prisma.tempChannelLobby.create({ data: { guildId: g, name: "Create a Squad", lobbyChannelId: lobby, categoryId: cat("voice"), nameFormat: "🔊 {user}'s Squad", userLimit: 5, bitrate: Math.min(128000, guild.maximumBitrate ?? 96000), gamePicker: true, gameCategories: true, gameChoices } });
      } else if (!Array.isArray(existing.gameChoices) || existing.gameChoices.length === 0) {
        await prisma.tempChannelLobby.update({ where: { id: existing.id }, data: { gamePicker: true, gameCategories: true, gameChoices } });
      }
    }],
    ["Stats", async () => {
      const stat = ch("stat-members");
      if (stat && !(await prisma.statChannel.findUnique({ where: { channelId: stat } }))) await prisma.statChannel.create({ data: { guildId: g, channelId: stat, statType: "MEMBER_COUNT", format: "👥 Members: {count}" } });
    }],
    ["Status", async () => {
      const status = ch("bot-status");
      if (status && !(await prisma.statusChannel.findUnique({ where: { channelId: status } }))) await prisma.statusChannel.create({ data: { guildId: g, channelId: status } });
    }],
    ["Matchmaking", async () => {
      const games = BLUEPRINT_GAMES.filter((x) => opts.games.includes(x.id) && x.id !== "other").map((x) => x.name);
      await fillSettings("matchmakingConfig", g, {
        channelId: ch("mm-board"),
        activityChannelId: ch("mm-threads"),
        boardChannelId: ch("mm-leaderboard"),
        lobbyVoiceId: ch("mm-lobby"),
        duelCategoryId: cat(streaming ? "rooms" : "duels"),
        teamCategoryId: cat(streaming ? "rooms" : "teammatches"),
        staffRoleId: role(streaming ? "mod" : "staff"),
        games,
        ...(streaming
          ? { tournamentChannelId: ch("mm-tournaments"), playerRoleId: role("mm"), alertsRoleId: role("ping:match"), championRoleId: role("champion"), setupCategoryId: cat("mm"), voiceSource: "LOBBY", panelParts: ["PICKUP", "TEAM", "TOOLS"] }
          : {}),
      });
      await prisma.matchmakingConfig.update({ where: { guildId: g }, data: { enabled: true } });
      if (streaming) {
        // The how-to-play guide, the same one /match setup posts.
        const how = ch("mm-how") ? await guild.channels.fetch(ch("mm-how")!).catch(() => null) : null;
        const need = [ch("mm-lobby"), ch("mm-now"), ch("mm-board"), ch("mm-leaderboard"), ch("mm-tournaments"), role("mm"), role("champion"), role("ping:match")];
        if (how && need.every(Boolean)) {
          await postMatchGuide(how, { lobby: ch("mm-lobby")!, now: ch("mm-now")!, board: ch("mm-board")!, lead: ch("mm-leaderboard")!, cups: ch("mm-tournaments")! }, { player: role("mm")!, champion: role("champion")!, alerts: role("ping:match")! });
        }
      }
    }],
    ...(streaming
      ? ([
          ["Going Live", () => fillSettings("streamAlertSettings", g, { defaultChannelId: ch("live"), pingRoleId: role("ping:streams"), liveRoleId: role("live"), selfServeRoleId: role("creator") })],
          ["Starboard", () => fillSettings("starboardConfig", g, { channelId: ch("hof"), threshold: 5 })],
          ["Counting", () => fillSettings("countingGameConfig", g, { channelId: ch("counting") })],
          ["Anonymous", () => fillSettings("confessionSettings", g, { channelId: ch("confess") })],
          ["Birthdays", () => fillSettings("birthdayConfig", g, { channelId: ch("general") })],
          ["Playing Now", () => fillSettings("playingNowConfig", g, { channelId: ch("mm-now"), notifyRoleId: role("ping:match") })],
          ["Weekly Recap", () => fillSettings("weeklyRecapSettings", g, { channelId: ch("announcements") })],
          ["Member Milestones", () => fillSettings("milestoneSettings", g, { channelId: ch("announcements") })],
          ["Appeals", () => fillSettings("appealSettings", g, { appealChannelId: ch("staff-chat") })],
          ["AI Chat channel", () => fillSettings("aiConfig", g, { chatChannelId: ch("botcmds") })],
        ] as Array<[string, () => Promise<unknown>]>)
      : []),
    ["Module switches", async () => {
      for (const key of modulesOn(opts)) await prisma.moduleToggle.upsert({ where: { guildId_key: { guildId: g, key } }, create: { guildId: g, key, enabled: true }, update: { enabled: true } });
    }],
  ];
  await prisma.guild.upsert({ where: { id: g }, create: { id: g, name: guild.name }, update: {} }).catch(() => null);
  for (const [label, run] of tasks) {
    await run().catch((err) => {
      logError("bot", err, g);
      notes.push(`${label} couldn't be fully set up. Check it on the dashboard.`);
    });
  }
  for (const key of modulesOn(opts)) invalidateModuleCache(g, key);
  notes.push("LFG needs its command made on the dashboard (LFG page), since it picks a trigger word for your server.");
}

// Discord's own join questions. Default channels must be ones anyone can see.
async function setupOnboarding(guild: Guild, opts: SetupOptions, ids: Ids, notes: string[]): Promise<string> {
  // Discord wants real snowflakes for new question and answer IDs.
  const newId = () => SnowflakeUtil.generate().toString();
  // Discord only lets onboarding hand out roles below Spartacus's own role.
  const top = guild.members.me?.roles.highest;
  const blocked = new Set<string>();
  const usable = (roleId: string | undefined) => {
    const r = roleId ? guild.roles.cache.get(roleId) : undefined;
    if (!r) return false;
    if (top && top.comparePositionTo(r) <= 0) {
      blocked.add(r.name);
      return false;
    }
    return true;
  };
  const prompts = blueprintOnboarding(opts.games, opts.layout).map((q) => ({
    id: newId(),
    type: 0,
    title: q.title,
    single_select: q.singleSelect,
    required: false,
    in_onboarding: true,
    options: q.options
      .map((o) => ({ id: newId(), title: o.label, emoji_name: o.emoji, role_ids: [o.role ? ids.roles.get(o.role) : undefined].filter(usable), channel_ids: [o.channel ? ids.channels.get(o.channel) : undefined].filter(Boolean) }))
      .filter((o) => o.role_ids.length || o.channel_ids.length),
  })).filter((p) => p.options.length);
  const moveNote = `Spartacus's role has to be above these roles for onboarding to give them out: ${[...blocked].slice(0, 15).join(", ")}. Drag Spartacus to the top in Server Settings → Roles, then run /server-setup again with Onboarding.`;
  if (!prompts.length) {
    notes.push(blocked.size ? moveNote : "Onboarding was skipped because none of its roles exist yet. Build Roles first, then run /server-setup again with Onboarding.");
    return blocked.size ? "🧭 Onboarding skipped (Spartacus's role is too low)" : "🧭 Onboarding skipped (no roles yet)";
  }
  if (blocked.size) notes.push(moveNote);
  // The streaming layout is open, so new people start with the main channels.
  const defaultKeys = opts.layout === "streaming" ? ["rules", "welcome", "announcements", "events", "live", "general", "memes", "media", "clips", "lfg"] : ["welcome", "rules", "roles"];
  const defaults = defaultKeys.map((k) => ids.channels.get(k)).filter(Boolean);
  const body = { prompts, default_channel_ids: defaults, enabled: true, mode: 0 };
  const path = `/guilds/${guild.id}/onboarding` as `/${string}`;
  let reason = "";
  const put = (data: object) =>
    guild.client.rest.put(path, { body: data }).then(
      () => true,
      (err: unknown) => {
        reason = err instanceof Error ? err.message : String(err);
        logError("bot", err, guild.id);
        return false;
      },
    );
  if (await put(body)) return "🧭 Onboarding questions set and switched on";
  const firstReason = reason;
  // Discord only switches onboarding on with enough open channels; the
  // questions are still saved so they show once it can be turned on.
  const saved = await put({ ...body, enabled: false });
  notes.push(
    saved
      ? "Onboarding questions are saved but Discord wouldn't switch them on, since it wants more channels that new members can see before accepting the rules. #🎭・roles does the same job, and you can switch onboarding on in Server Settings → Onboarding."
      : `Discord refused the onboarding questions: "${(reason || firstReason).slice(0, 300)}". Make sure Community is on and Spartacus has Manage Server and Manage Roles, then run /server-setup again. #🎭・roles works either way.`,
  );
  return saved ? "🧭 Onboarding questions saved (not switched on yet)" : "🧭 Onboarding skipped";
}
