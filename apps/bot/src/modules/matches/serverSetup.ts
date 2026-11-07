import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type CategoryChannel,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
  type OverwriteResolvable,
  type Role,
  type TextChannel,
} from "discord.js";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { stringList } from "./render";
import { withLock } from "./lock";
import { syncMatchmakingPanel } from "./matchmaking";
import { syncBoard } from "./leaderboard";
import { invalidateModuleCache } from "../../lib/moduleGate";
import { syncPlayingNowPanel } from "../engagement/playingNow";

// /match setup member-role:@Member builds the whole Matchmaking area:
// a ⚔️ MATCHMAKING category everyone with the member role can see, its
// channels and a 🔊 Matchmaking Lobby, a 🎮 MATCH ROOMS category for match
// voice channels, the roles, an onboarding question, and the dashboard
// settings. Only the Matchmaking role can play (buttons and the Lobby);
// Spartacus only moves players who are in the Lobby. Running it again
// reuses everything it finds by name.

const ROLES = [
  { key: "player", name: "Matchmaking", color: 0x5865f2, mentionable: false, hoist: false },
  { key: "alerts", name: "Match Alerts", color: 0xf1c40f, mentionable: true, hoist: false },
  { key: "staff", name: "Match Staff", color: 0x3ba55d, mentionable: false, hoist: false },
  { key: "champion", name: "Champion", color: 0xffd700, mentionable: false, hoist: true },
] as const;
type RoleKey = (typeof ROLES)[number]["key"];
const CATEGORY = "⚔️ MATCHMAKING";
const ROOMS = "🎮 MATCH ROOMS";
const CHANNELS = [
  { key: "guide", name: "📖・how-to-play", type: ChannelType.GuildText, topic: "How Matchmaking works. Start here." },
  { key: "board", name: "⚔️・matchmaking", type: ChannelType.GuildText, topic: "Find matches, make a team, challenge others." },
  { key: "cups", name: "🏆・tournaments", type: ChannelType.GuildText, topic: "Tournament sign-ups and brackets." },
  { key: "now", name: "🎮・playing-now", type: ChannelType.GuildText, topic: "On right now? Tap I'm on now." },
  { key: "lead", name: "📊・leaderboard", type: ChannelType.GuildText, topic: "Top players and teams." },
  { key: "staffch", name: "🛡️・match-staff", type: ChannelType.GuildText, topic: "Disputes, no-shows and match alerts." },
  { key: "lobby", name: "Matchmaking Lobby", type: ChannelType.GuildVoice, topic: "" },
] as const;
type ChannelKey = (typeof CHANNELS)[number]["key"];

const lower = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const findRole = (guild: Guild, name: string) => guild.roles.cache.find((r) => !r.managed && lower(r.name) === lower(name));
const findChannel = (guild: Guild, name: string, type: ChannelType, parentId?: string | null) =>
  guild.channels.cache.find((c) => c.type === type && lower(c.name) === lower(name) && (parentId === undefined || ("parentId" in c && c.parentId === parentId)));

// Who can do what. Members can look; Matchmaking can play; staff run it.
function areaPerms(guild: Guild, member: Role, r: Record<RoleKey, Role>): OverwriteResolvable[] {
  const bot = guild.client.user.id;
  return [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads] },
    { id: r.player.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.SendMessagesInThreads], deny: [PermissionFlagsBits.SendMessages] },
    { id: r.staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MoveMembers] },
    { id: bot, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageRoles] },
  ];
}
function staffOnly(guild: Guild, member: Role, r: Record<RoleKey, Role>): OverwriteResolvable[] {
  return [...areaPerms(guild, member, r).filter((o) => o.id !== member.id && o.id !== r.player.id), { id: member.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: r.player.id, deny: [PermissionFlagsBits.ViewChannel] }];
}

// The guide, as short messages. Channel mentions point at the new channels.
function guide(ch: Record<ChannelKey, GuildBasedChannel>, r: Record<RoleKey, Role>) {
  const c = (k: ChannelKey) => `<#${ch[k].id}>`;
  return [
    `# 🎮 How Matchmaking works here\nEverything happens with **buttons**, no commands to learn. Everything you tap answers **only you**.\n\n**Step 1:** get the <@&${r.player.id}> role with the button below (or in **Channels & Roles**). Without it you can look around, but not play.\n**Step 2:** hop in 🔊 ${c("lobby")}. When a match starts, Spartacus moves everyone in the match **from the Lobby only** into their team's voice channel.`,
    `## ⚡ Play right now\n**🎮 ${c("now")}:** tap **I'm on now**, pick the mode and how many you need. Others tap **Join**.\n**⚡ Pickup Match** in ${c("board")}: be in the Lobby, tap **Start Pickup Match**, check the teams, then **Start Match**.`,
    `## 👥 Teams\n**Make a team** (captains): ${c("board")} → **Create a Team**, type a name, pick your teammates, **Save Players**.\n**No team?** Tap **Looking for a Team** and captains can add you.\n**Play:** the captain taps **Teams: Find a Match** (next team that queues) or **Teams: Challenge a Team**.\nA private match thread opens. After the game a captain (👑) taps who won and types the score; the other captain taps **Confirm**. Results go to ${c("lead")}.`,
    `## 🏆 Tournaments\nIn ${c("cups")}: captains tap **Register my team** (the roster comes along), or tap **Solo sign-up** to be put on a team. Captains **Check in** before it starts. Every round plays at once, and winners move on by themselves. Champions get coins and the <@&${r.champion.id}> role for a week.\n\n🔔 Want a ping when games start or a tournament opens? Take <@&${r.alerts.id}> below.`,
  ];
}

// Posts the same guide into a how-to-play channel that another setup built
// (/server-setup's streaming layout), using that setup's channel and role ids.
// Skipped if the channel already has messages.
export async function postMatchGuide(
  channel: GuildBasedChannel,
  channelIds: Record<"lobby" | "now" | "board" | "lead" | "cups", string>,
  roleIds: Record<"player" | "champion" | "alerts", string>
) {
  if (!isSendableChannel(channel)) return;
  const existing = await (channel as TextChannel).messages.fetch({ limit: 1 }).catch(() => null);
  if (existing?.size) return;
  const ch = Object.fromEntries(Object.entries(channelIds).map(([k, id]) => [k, { id }])) as unknown as Record<ChannelKey, GuildBasedChannel>;
  const roles = Object.fromEntries(Object.entries(roleIds).map(([k, id]) => [k, { id }])) as unknown as Record<RoleKey, Role>;
  const parts = guide(ch, roles);
  for (const [i, text] of parts.entries()) {
    await (channel as TextChannel)
      .send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription(text)], components: i === 0 || i === parts.length - 1 ? [roleButtons()] : [], allowedMentions: { parse: [] } })
      .catch((err) => logError("bot", err, channel.guild.id));
  }
}

export const roleButtons = () =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("mm:role:play").setLabel("Let me play").setEmoji("🎮").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("mm:role:alerts").setLabel("Ping me when games start").setEmoji("🔔").setStyle(ButtonStyle.Secondary)
  );

async function ensureRoles(guild: Guild, notes: string[], made: string[]) {
  const roles = {} as Record<RoleKey, Role>;
  for (const def of ROLES) {
    let role = findRole(guild, def.name);
    if (!role) {
      role = await guild.roles.create({ name: def.name, color: def.color, mentionable: def.mentionable, hoist: def.hoist, permissions: [], reason: "/match setup" }).catch((err) => {
        logError("bot", err, guild.id);
        return undefined;
      });
      if (role) made.push(`role ${def.name}`);
    } else if (def.mentionable && !role.mentionable) await role.edit({ mentionable: true }).catch(() => notes.push(`Turn on “Allow anyone to @mention” for ${role!.name}.`));
    if (!role) throw new Error(`I couldn't create the ${def.name} role. Check that I have Manage Roles.`);
    roles[def.key] = role;
  }
  return roles;
}

async function ensureCategory(guild: Guild, name: string, perms: OverwriteResolvable[], made: string[]): Promise<CategoryChannel> {
  const found = findChannel(guild, name, ChannelType.GuildCategory) as CategoryChannel | undefined;
  if (found) {
    await found.permissionOverwrites.set(perms, "/match setup");
    return found;
  }
  const c = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: perms, reason: "/match setup" });
  made.push(`category ${name}`);
  return c;
}

// Builds or updates everything. Returns the reply text.
export async function applyServerSetup(guild: Guild, memberRoleId: string): Promise<EmbedBuilder> {
  await guild.roles.fetch();
  await guild.channels.fetch();
  const memberRole = guild.roles.cache.get(memberRoleId);
  if (!memberRole) return problem("That member role doesn't exist anymore. Run /match setup again and pick it.");
  const notes: string[] = [];
  const made: string[] = [];
  const roles = await ensureRoles(guild, notes, made);

  const area = await ensureCategory(guild, CATEGORY, areaPerms(guild, memberRole, roles), made);
  const ch = {} as Record<ChannelKey, GuildBasedChannel>;
  const fresh = new Set<ChannelKey>();
  for (const def of CHANNELS) {
    let c = findChannel(guild, def.name, def.type, area.id) ?? findChannel(guild, def.name, def.type);
    if (!c) {
      c = await guild.channels.create({ name: def.name, type: def.type, parent: area.id, topic: def.topic || undefined, reason: "/match setup" });
      made.push(def.type === ChannelType.GuildVoice ? `🔊 ${def.name}` : `#${def.name}`);
      fresh.add(def.key);
    } else if ("setParent" in c && c.parentId !== area.id) await c.setParent(area.id, { lockPermissions: false }).catch(() => notes.push(`I couldn't move ${c!.name} into ${CATEGORY}.`));
    if ("permissionOverwrites" in c) await c.permissionOverwrites.set(def.key === "staffch" ? staffOnly(guild, memberRole, roles) : areaPerms(guild, memberRole, roles), "/match setup").catch(() => notes.push(`I couldn't set permissions on ${c!.name}.`));
    ch[def.key] = c;
  }
  const rooms = await ensureCategory(guild, ROOMS, areaPerms(guild, memberRole, roles), made);

  // The dashboard settings.
  await prisma.matchmakingConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id }, update: {} });
  await prisma.matchmakingConfig.update({
    where: { guildId: guild.id },
    data: {
      enabled: true,
      channelId: ch.board.id,
      boardChannelId: ch.lead.id,
      tournamentChannelId: ch.cups.id,
      lobbyVoiceId: ch.lobby.id,
      voiceSource: "LOBBY",
      requireLobby: false,
      createVoice: true,
      teamCategoryId: rooms.id,
      duelCategoryId: rooms.id,
      setupCategoryId: area.id,
      staffRoleId: roles.staff.id,
      championRoleId: roles.champion.id,
      playerRoleId: roles.player.id,
      alertsRoleId: roles.alerts.id,
      panelParts: ["PICKUP", "TEAM", "TOOLS"],
    },
  });
  // Matchmaking and Playing Now both have to be on, or their panels never post.
  for (const key of ["MATCHES", "PLAYING_NOW"] as const) {
    await prisma.moduleToggle.upsert({ where: { guildId_key: { guildId: guild.id, key } }, create: { guildId: guild.id, key, enabled: true }, update: { enabled: true } });
    invalidateModuleCache(guild.id, key);
  }
  // Playing Now always moves into the new #playing-now. Its old panel (in
  // whatever channel it used before) is deleted so there's only one.
  const pn = await prisma.playingNowConfig.findUnique({ where: { guildId: guild.id } });
  if (pn?.channelId && pn.channelId !== ch.now.id && pn.panelMessageId) {
    const oldCh = await guild.channels.fetch(pn.channelId).catch(() => null);
    if (oldCh && isSendableChannel(oldCh)) await oldCh.messages.delete(pn.panelMessageId).catch(() => null);
  }
  const movePn = pn?.channelId !== ch.now.id;
  await prisma.playingNowConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, channelId: ch.now.id, notifyRoleId: roles.alerts.id },
    update: { channelId: ch.now.id, notifyRoleId: pn?.notifyRoleId ?? roles.alerts.id, ...(movePn ? { panelMessageId: null } : {}) },
  });
  const pnProblem = await syncPlayingNowPanel(guild.client, guild.id).catch((err) => {
    logError("bot", err, guild.id);
    return "I couldn't post the Playing Now panel.";
  });
  if (pnProblem) notes.push(`Playing Now: ${pnProblem}`);
  await syncMatchmakingPanel(guild.client, guild.id).catch((err) => logError("bot", err, guild.id));
  await syncBoard(guild.client, guild.id).catch(() => null);

  // The guide, only into a new (or empty) how-to-play channel.
  const guideCh = ch.guide as TextChannel;
  const existing = isSendableChannel(guideCh) ? await guideCh.messages.fetch({ limit: 1 }).catch(() => null) : null;
  if (isSendableChannel(guideCh) && (fresh.has("guide") || !existing?.size)) {
    const parts = guide(ch, roles);
    for (const [i, text] of parts.entries()) {
      await guideCh
        .send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription(text)], components: i === 0 || i === parts.length - 1 ? [roleButtons()] : [], allowedMentions: { parse: [] } })
        .catch((err) => logError("bot", err, guild.id));
    }
  }

  // The onboarding question (Community servers only). Kept with the others.
  let onboarding = "";
  if (guild.features.includes("COMMUNITY")) {
    try {
      const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: guild.id }, select: { games: true } });
      const games = stringList(config?.games);
      const title = games.length === 1 ? `Want to play competitive ${games[0]}?` : "Want to play competitive matches?";
      const ob = await guild.fetchOnboarding();
      const prompts = [...ob.prompts.values()].map((p) => ({
        id: p.id,
        title: p.title,
        singleSelect: p.singleSelect,
        required: p.required,
        inOnboarding: p.inOnboarding,
        type: p.type,
        options: [...p.options.values()].map((o) => ({ id: o.id, title: o.title, description: o.description, emoji: o.emoji?.id ?? o.emoji?.name ?? undefined, roles: [...o.roles.keys()], channels: [...o.channels.keys()] })),
      }));
      const has = prompts.find((p) => p.options.some((o) => o.roles.includes(roles.player.id)));
      if (has) onboarding = `Already there: “${has.title}”`;
      else {
        prompts.push({
          title,
          singleSelect: false,
          required: false,
          inOnboarding: true,
          type: 0,
          options: [
            { title: "Yes, let me play matchmaking", description: "Use the board, join the Lobby, enter tournaments", emoji: "🎮", roles: [roles.player.id], channels: [ch.guide.id] },
            { title: "Ping me when games start", description: "Lobbies filling up and tournaments opening", emoji: "🔔", roles: [roles.alerts.id], channels: [] },
            { title: "Just watching", description: "See the leaderboard and tournaments", emoji: "👀", roles: [], channels: [ch.lead.id] },
          ],
        } as never);
        await guild.editOnboarding({ prompts: prompts as never, defaultChannels: [...ob.defaultChannels.keys()], enabled: ob.enabled, mode: ob.mode });
        onboarding = `Added: “${title}”`;
      }
    } catch (err) {
      logError("bot", err, guild.id);
      onboarding = `⚠️ I couldn't add it (I need Manage Server, and my role above the new roles). Members can use the buttons in <#${ch.guide.id}> instead.`;
    }
  } else onboarding = `Skipped: your server isn't a Community server. Members get the role from the buttons in <#${ch.guide.id}>.`;

  const me = await guild.members.fetchMe();
  const above = Object.values(roles).filter((r) => r.position >= me.roles.highest.position);
  if (above.length) notes.push(`Drag my role above ${above.map((r) => r.name).join(", ")}, or I can't give ${above.length === 1 ? "it" : "them"} out.`);
  const config = await prisma.matchmakingConfig.findUnique({ where: { guildId: guild.id }, select: { games: true } });
  if (!stringList(config?.games).length) notes.push("Add your game on the dashboard (Matchmaking → Games) so people can queue.");

  const isNew = (name: string) => made.includes(name);
  const embed = new EmbedBuilder()
    .setColor(notes.length ? 0xf1c40f : 0x3ba55d)
    .setTitle("✅ Matchmaking is ready")
    .setDescription(
      [
        `👀 Everyone with <@&${memberRole.id}> can **see** it.`,
        `🎮 Only <@&${roles.player.id}> can **play**.`,
        `🔊 Players are only moved from <#${ch.lobby.id}>.`,
        made.length ? "" : "\n♻️ Everything already existed, so I updated it.",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .addFields(
      { name: "🎭 Roles", value: ROLES.map((r) => `<@&${roles[r.key].id}>${isNew(`role ${r.name}`) ? " · new" : ""}`).join("\n"), inline: true },
      { name: `📁 ${CATEGORY}`, value: CHANNELS.map((c) => `<#${ch[c.key].id}>${c.key === "staffch" ? " · staff only" : ""}`).join("\n"), inline: true },
      { name: `${ROOMS}`, value: "Voice channels for each match show up here." },
      { name: "📝 Onboarding question", value: onboarding.slice(0, 1024) }
    );
  if (notes.length) embed.addFields({ name: "⚠️ Still to do", value: notes.map((n) => `• ${n}`).join("\n").slice(0, 1024) });
  return embed;
}

const problem = (text: string) => new EmbedBuilder().setColor(0xda373c).setTitle("⚠️ Matchmaking setup didn't finish").setDescription(text);

export async function startServerSetup(interaction: ChatInputCommandInteraction) {
  const { guild } = interaction;
  if (!guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "Only server admins can run this.", ephemeral: true });
    return;
  }
  const member = interaction.options.getRole("member-role", true);
  if (member.id === guild.id) {
    await interaction.reply({ content: "Pick your member role (the one regular members have), not @everyone.", ephemeral: true });
    return;
  }
  await guild.roles.fetch();
  const reuse = ROLES.filter((r) => findRole(guild, r.name)).map((r) => r.name);
  const create = ROLES.filter((r) => !findRole(guild, r.name)).map((r) => r.name);
  await interaction.reply({
    ephemeral: true,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`matchsetup:apply:${member.id}`).setLabel("Confirm Setup").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("matchsetup:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
      ),
    ],
    allowedMentions: { parse: [] },
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("⚔️ Set up Matchmaking?")
        .setDescription(`👀 Everyone with <@&${member.id}> can **see** it.\n🎮 Only the **Matchmaking** role can **play**.`)
        .addFields(
          { name: "🎭 Roles", value: [...create.map((n) => `${n} · new`), ...reuse.map((n) => `${n} · already have`)].join("\n"), inline: true },
          { name: `📁 ${CATEGORY}`, value: CHANNELS.map((c) => `${c.type === ChannelType.GuildVoice ? "🔊 " : ""}${c.name.replace("・", " ")}${c.key === "staffch" ? " · staff only" : ""}`).join("\n"), inline: true },
          { name: `${ROOMS}`, value: "Voice channels for each match" },
          { name: "✅ Also", value: "• Onboarding question (Community servers)\n• Dashboard settings filled in" }
        )
        .setFooter({ text: "Safe to run again: it reuses what it finds and resets these channels' permissions." }),
    ],
  });
}

export async function handleServerSetup(interaction: ButtonInteraction) {
  const [, action, roleId] = interaction.customId.split(":");
  if (action === "cancel") return void (await interaction.update({ content: "Canceled. Nothing was changed.", embeds: [], components: [] }));
  const { guild } = interaction;
  if (!guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return void (await interaction.reply({ content: "Only server admins can run this.", ephemeral: true }));
  await interaction.update({ content: "⏳ Setting up Matchmaking… (this takes a few seconds)", embeds: [], components: [] });
  const embed = await withLock(`setup:${guild.id}`, () => applyServerSetup(guild, roleId)).catch((err: Error) => {
    logError("bot", err, guild.id);
    return problem(`${err.message ?? "Something went wrong."}\nCheck that I have Manage Roles, Manage Channels and Manage Server.`);
  });
  await interaction.editReply({ content: "", embeds: [embed], allowedMentions: { parse: [] } });
}
