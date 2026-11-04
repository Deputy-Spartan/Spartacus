import {
  ChannelType,
  GuildExplicitContentFilter,
  GuildSystemChannelFlags,
  GuildVerificationLevel,
  OverwriteType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type OverwriteResolvable,
  type Role,
} from "discord.js";
import {
  ARCHIVE_CATEGORY,
  BLUEPRINT_APPLICATIONS,
  BLUEPRINT_GAMES,
  BLUEPRINT_LEVEL_ROLES,
  BLUEPRINT_ROLES,
  BLUEPRINT_RULES,
  BLUEPRINT_TICKET_TYPES,
  blueprintCategories,
  blueprintGameChoices,
  blueprintOnboarding,
  blueprintPickers,
  blueprintSlug,
  type Access,
  type BlueprintCategory,
  type BlueprintChannel,
  type BlueprintGameId,
  type BlueprintRole,
  type ModuleKey,
} from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { invalidateModuleCache } from "../../lib/moduleGate";

export interface SetupOptions {
  games: BlueprintGameId[];
  archiveOthers: boolean;
}

type ChannelMatch = { spec: BlueprintChannel; category: BlueprintCategory; existing: GuildBasedChannel | null };
type CategoryMatch = { spec: BlueprintCategory; existing: CategoryChannel | null };

export interface SetupPlan {
  roles: Array<{ spec: BlueprintRole; existing: Role | null }>;
  categories: CategoryMatch[];
  channels: ChannelMatch[];
  archive: GuildBasedChannel[];
  hideCategories: CategoryChannel[];
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
  const roleSpecs = BLUEPRINT_ROLES.filter((r) => !r.game || opts.games.includes(r.game));
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

  const specs = blueprintCategories(opts.games);
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
  };

  const usedCats = new Set<string>();
  const categoryOf = (key: string, wanted: Set<string>) => {
    const configured = all.find((c) => c.id === inUse[key] && c.type === ChannelType.GuildCategory);
    return (configured ?? all.find((c) => c.type === ChannelType.GuildCategory && !usedCats.has(c.id) && wanted.has(blueprintSlug(c.name)))) as CategoryChannel | undefined;
  };
  for (const id of [inUse.duels, inUse.teammatches]) if (id) usedCats.add(id);
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
  const liveRoomParents = new Set(categories.filter((c) => c.spec.key === "duels" || c.spec.key === "teammatches").map((c) => c.existing?.id).filter(Boolean));
  const archiveCat = all.find((c) => c.type === ChannelType.GuildCategory && c.name === ARCHIVE_CATEGORY);
  const archive = opts.archiveOthers
    ? all.filter((c) => c.type !== ChannelType.GuildCategory && !usedChannels.has(c.id) && !tempIds.has(c.id) && !liveRoomParents.has(c.parentId ?? "") && c.parentId !== archiveCat?.id)
    : [];
  const hideCategories = opts.archiveOthers ? (all.filter((c) => c.type === ChannelType.GuildCategory && !usedCats.has(c.id) && c.id !== archiveCat?.id) as CategoryChannel[]) : [];
  return { roles, categories, channels, archive, hideCategories };
}

export function summarizePlan(plan: SetupPlan) {
  const count = <T>(list: T[], pick: (x: T) => unknown) => ({ reuse: list.filter((x) => pick(x)).length, create: list.filter((x) => !pick(x)).length });
  return {
    roles: count(plan.roles, (r) => r.existing),
    categories: count(plan.categories, (c) => c.existing),
    channels: count(plan.channels, (c) => c.existing),
    archive: plan.archive.length,
    hideCategories: plan.hideCategories.length,
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

  // Categories in order, then their channels.
  let position = 0;
  for (const { spec, existing } of plan.categories) {
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
  await step(`📁 Categories: ${plan.categories.filter((c) => !c.existing).length} new, ${plan.categories.filter((c) => c.existing).length} renamed and sorted`);

  const maxBitrate = guild.maximumBitrate ?? 96000;
  let createdChannels = 0, movedChannels = 0;
  const order = new Map<string, number>();
  for (const { spec, category, existing } of plan.channels) {
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
  await step(`💬 Channels: ${createdChannels} new, ${movedChannels} renamed and moved`);

  // Everything else goes into a hidden archive. Nothing is deleted.
  if (plan.archive.length || plan.hideCategories.length) {
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
    await step(`📦 Archived ${archived} old channel${archived === 1 ? "" : "s"} into ${ARCHIVE_CATEGORY} (hidden, nothing deleted)`);
  }

  await setupServerSettings(guild, ids, notes);
  await step("⚙️ Server settings: AFK channel, join messages and Community");
  await setupModules(guild, opts, ids, notes);
  await step(`🧩 Modules set up and switched on: ${MODULES_ON.length}`);
  await setupOnboarding(guild, opts, ids, notes).then((line) => step(line));

  const mods = guild.roles.cache.filter((r) => !r.managed && r.permissions.has(PermissionFlagsBits.Administrator) && r.members.some((m) => !m.user.bot));
  if (mods.size) notes.push(`These roles give people Administrator: ${mods.map((r) => r.name).join(", ")}. Consider giving them only the permissions they need.`);
  return { done, notes };
}

async function setupServerSettings(guild: Guild, ids: Ids, notes: string[]) {
  const afk = ids.channels.get("afk");
  await guild.edit({ afkChannel: afk ?? null, afkTimeout: 900, reason: "Server Setup" }).catch(() => notes.push("Couldn't set the AFK channel."));
  // Spartacus posts the welcome, so Discord's own join message is turned off.
  await guild.setSystemChannelFlags(guild.systemChannelFlags.add(GuildSystemChannelFlags.SuppressJoinNotifications)).catch(() => null);

  const rules = ids.channels.get("rules");
  const updates = ids.channels.get("staff-chat");
  if (!guild.features.includes("COMMUNITY") && rules && updates) {
    await guild
      .edit({
        features: [...guild.features, "COMMUNITY"],
        rulesChannel: rules,
        publicUpdatesChannel: updates,
        verificationLevel: Math.max(guild.verificationLevel, GuildVerificationLevel.Low),
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
  const staffRoles = ["staff", "support"].map(role).filter(Boolean) as string[];

  const tasks: Array<[string, () => Promise<unknown>]> = [
    ["Welcome", () => fillSettings("welcomeConfig", g, { channelId: ch("welcome"), leaveChannelId: ch("server-log"), pingAboveEmbed: false, embedEnabled: true, welcomeText: `Welcome to **{server}**, {user}! Read and accept <#${ch("rules")}>, then pick your games in <#${ch("roles")}>.`, goodbyeText: "{user} left {server}." })],
    ["Rules", async () => {
      const settings = await fillSettings("rulesGateSettings", g, { channelId: ch("rules"), roleId: role("member"), logChannelId: ch("server-log"), defaultEmbedTitle: "📜 Server Rules", defaultEmbedDescription: BLUEPRINT_RULES });
      return settings;
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
    ["Weekly Staff Report", () => fillSettings("modDigestSettings", g, { channelId: ch("staff-desk") })],
    ["Player Reports", () => fillSettings("playerReportSettings", g, { staffRoleId: role("staff") })],
    ["Tickets", async () => {
      await fillSettings("ticketSettings", g, { logChannelId: ch("staff-desk"), transcriptChannelId: ch("staff-desk"), supportRoleIds: staffRoles });
      const typeIds: string[] = [];
      for (const t of BLUEPRINT_TICKET_TYPES) {
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
      for (const a of BLUEPRINT_APPLICATIONS) {
        const found = await prisma.applicationType.findFirst({ where: { guildId: g, name: a.name } });
        const type =
          found ??
          (await prisma.applicationType.create({
            data: { guildId: g, name: a.name, emoji: a.emoji, description: a.description, reviewChannelId: ch("staff-desk"), staffRoleIds: staffRoles, questions: a.questions.map((label) => ({ label, style: "PARAGRAPH", required: true })) },
          }));
        typeIds.push(type.id);
      }
      const support = ch("support");
      if (support && !(await prisma.applicationPanel.findFirst({ where: { guildId: g, channelId: support } }))) {
        await prisma.applicationPanel.create({ data: { guildId: g, name: "Join the Team", channelId: support, typeIds, description: "Apply below. You'll get a DM when staff decide." } });
      }
    }],
    ["Role pickers", async () => {
      const rolesChannel = ch("roles");
      if (!rolesChannel) return;
      for (const picker of blueprintPickers(opts.games)) {
        if (await prisma.rolePanel.findFirst({ where: { guildId: g, name: picker.name } })) continue;
        const options = picker.options.map((o) => ({ roleIds: [role(o.role)].filter(Boolean), channelIds: [], label: o.label, emoji: o.emoji })).filter((o) => o.roleIds.length);
        if (options.length) await prisma.rolePanel.create({ data: { guildId: g, name: picker.name, channelId: rolesChannel, description: picker.description, layout: "DROPDOWN", options } });
      }
    }],
    ["Temp Channels", async () => {
      const lobby = ch("squad");
      if (!lobby) return;
      const gameChoices = blueprintGameChoices(opts.games);
      const existing = await prisma.tempChannelLobby.findFirst({ where: { guildId: g, lobbyChannelId: lobby } });
      if (!existing) {
        await prisma.tempChannelLobby.create({ data: { guildId: g, name: "Create a Squad", lobbyChannelId: lobby, categoryId: cat("voice"), nameFormat: "🔊 {user}'s Squad", userLimit: 5, bitrate: Math.min(128000, guild.maximumBitrate ?? 96000), gamePicker: true, gameChoices } });
      } else if (!Array.isArray(existing.gameChoices) || existing.gameChoices.length === 0) {
        await prisma.tempChannelLobby.update({ where: { id: existing.id }, data: { gamePicker: true, gameChoices } });
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
        duelCategoryId: cat("duels"),
        teamCategoryId: cat("teammatches"),
        staffRoleId: role("staff"),
        games,
      });
      await prisma.matchmakingConfig.update({ where: { guildId: g }, data: { enabled: true } });
    }],
    ["Module switches", async () => {
      for (const key of MODULES_ON) await prisma.moduleToggle.upsert({ where: { guildId_key: { guildId: g, key } }, create: { guildId: g, key, enabled: true }, update: { enabled: true } });
    }],
  ];
  await prisma.guild.upsert({ where: { id: g }, create: { id: g, name: guild.name }, update: {} }).catch(() => null);
  for (const [label, run] of tasks) {
    await run().catch((err) => {
      logError("bot", err, g);
      notes.push(`${label} couldn't be fully set up. Check it on the dashboard.`);
    });
  }
  for (const key of MODULES_ON) invalidateModuleCache(g, key);
  notes.push("LFG needs its command made on the dashboard (LFG page), since it picks a trigger word for your server.");
}

// Discord's own join questions. Default channels must be ones anyone can see.
async function setupOnboarding(guild: Guild, opts: SetupOptions, ids: Ids, notes: string[]): Promise<string> {
  const prompts = blueprintOnboarding(opts.games).map((q, i) => ({
    id: String(BigInt(Date.now()) * 1000n + BigInt(i * 100)),
    type: 0,
    title: q.title,
    single_select: q.singleSelect,
    required: false,
    in_onboarding: true,
    options: q.options
      .map((o, j) => ({ id: String(BigInt(Date.now()) * 1000n + BigInt(i * 100 + j + 1)), title: o.label, emoji_name: o.emoji, role_ids: [ids.roles.get(o.role)].filter(Boolean), channel_ids: [] }))
      .filter((o) => o.role_ids.length),
  }));
  const defaults = ["welcome", "rules", "roles"].map((k) => ids.channels.get(k)).filter(Boolean);
  const body = { prompts, default_channel_ids: defaults, enabled: true, mode: 0 };
  const path = `/guilds/${guild.id}/onboarding` as `/${string}`;
  const ok = await guild.client.rest.put(path, { body }).then(() => true, () => false);
  if (ok) return "🧭 Onboarding questions set and switched on";
  // Discord only switches onboarding on with enough open channels; the
  // questions are still saved so they show once it can be turned on.
  const saved = await guild.client.rest.put(path, { body: { ...body, enabled: false } }).then(() => true, () => false);
  notes.push(
    saved
      ? "Onboarding questions are saved but Discord wouldn't switch them on, since it wants more channels that new members can see before accepting the rules. #🎭・roles does the same job, and you can switch onboarding on in Server Settings → Onboarding."
      : "Discord refused the onboarding questions. Make sure Community is on, then run /server-setup again. #🎭・roles works either way.",
  );
  return saved ? "🧭 Onboarding questions saved (not switched on yet)" : "🧭 Onboarding skipped";
}
