import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type CategoryChannel,
  type ChatInputCommandInteraction,
  type Guild,
  type Role,
} from "discord.js";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { withLock } from "./lock";

const ROLES = [
  { name: "Matchmaking", mentionable: false },
  { name: "Match Alerts", mentionable: true },
  { name: "Match Staff", mentionable: false },
  { name: "Champion", mentionable: false },
];

const findRole = (guild: Guild, name: string) => guild.roles.cache.find((r) => !r.managed && r.name.toLowerCase() === name.toLowerCase());
const channelNames = (category: CategoryChannel) => [...category.children.cache.values()].map((c) => c.name);

// Reuses roles that already exist, so running this twice is safe. Roles are
// created with no server permissions, and new ones land below the bot's role.
async function ensureRoles(guild: Guild) {
  const roles: Record<string, Role> = {};
  const problems: string[] = [];
  for (const { name, mentionable } of ROLES) {
    const role = findRole(guild, name) ?? (await guild.roles.create({ name, mentionable, permissions: [] }).catch((err) => void logError("bot", err, guild.id)));
    if (!role) {
      problems.push(`I couldn't create ${name}. Check that I have Manage Roles.`);
      continue;
    }
    if (mentionable && !role.mentionable) await role.edit({ mentionable }).catch(() => problems.push(`Turn on "Allow anyone to @mention" for ${role.name}.`));
    roles[name] = role;
  }
  return { roles, problems };
}

// The bot goes first so hiding the category can never lock it out.
async function lockCategory(guild: Guild, category: CategoryChannel, roles: Record<string, Role>) {
  const access = { ViewChannel: true, ReadMessageHistory: true, Connect: true, Speak: true };
  await category.permissionOverwrites.edit(guild.client.user.id, { ...access, SendMessages: true, EmbedLinks: true, ManageChannels: true, MoveMembers: true });
  await category.permissionOverwrites.edit(roles["Matchmaking"], { ...access, SendMessages: false });
  await category.permissionOverwrites.edit(roles["Match Staff"], { ...access, SendMessages: true });
  await category.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
}

async function syncChannels(category: CategoryChannel) {
  const failed: string[] = [];
  for (const channel of category.children.cache.values()) await channel.lockPermissions().catch(() => failed.push(channel.name));
  return failed;
}

// Only fills empty boxes, so roles already picked in the dashboard stay.
async function fillDashboard(guildId: string, roles: Record<string, Role>) {
  const staff = roles["Match Staff"]?.id;
  const alerts = roles["Match Alerts"]?.id;
  const champion = roles["Champion"]?.id;
  const config = await prisma.matchmakingConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  if (staff && !config.staffRoleId) await prisma.matchmakingConfig.update({ where: { guildId }, data: { staffRoleId: staff } });
  if (staff) await prisma.matchSetup.updateMany({ where: { guildId, staffRoleId: null }, data: { staffRoleId: staff } });
  if (alerts) await prisma.matchSetup.updateMany({ where: { guildId, pingRoleId: null }, data: { pingRoleId: alerts } });
  if (champion) await prisma.matchSetup.updateMany({ where: { guildId, championRoleId: null }, data: { championRoleId: champion } });
}

export async function applyServerSetup(guild: Guild, category: CategoryChannel): Promise<string> {
  await guild.roles.fetch();
  const { roles, problems } = await ensureRoles(guild);
  if (!roles["Matchmaking"] || !roles["Match Staff"]) return `Nothing was locked.\n${problems.join("\n")}`;

  const locked = await lockCategory(guild, category, roles).then(
    () => true,
    (err) => {
      logError("bot", err, guild.id);
      return false;
    }
  );
  if (!locked) return `The roles are ready, but I couldn't change ${category.name}, so its channels weren't synced. Check that I have Manage Roles and Manage Channels.`;

  const failed = await syncChannels(category);
  if (failed.length) problems.push(`I couldn't sync: ${failed.join(", ")}.`);
  await fillDashboard(guild.id, roles);

  const me = await guild.members.fetchMe();
  const above = Object.values(roles).filter((r) => r.position >= me.roles.highest.position);
  if (above.length) problems.push(`Drag my role above ${above.map((r) => r.name).join(", ")}, or I can't give ${above.length === 1 ? "it" : "them"} out.`);

  return [`✅ ${category.name} is locked to Matchmaking and Match Staff, and its channels are synced.`, ...problems].join("\n");
}

export async function startServerSetup(interaction: ChatInputCommandInteraction) {
  const { guild } = interaction;
  if (!guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "Only server admins can run this.", ephemeral: true });
    return;
  }
  const picked = interaction.options.getChannel("category", true, [ChannelType.GuildCategory]);
  const category = (await guild.channels.fetch(picked.id)) as CategoryChannel;
  await guild.roles.fetch();
  const exists = ROLES.filter((r) => findRole(guild, r.name)).map((r) => r.name);
  const create = ROLES.filter((r) => !findRole(guild, r.name)).map((r) => r.name);
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`matchsetup:apply:${category.id}`).setLabel("Confirm Setup").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("matchsetup:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );
  await interaction.reply({
    ephemeral: true,
    components: [buttons],
    content: [
      `**This will change your server:**`,
      create.length ? `• Create roles: ${create.join(", ")}` : "",
      exists.length ? `• Reuse roles: ${exists.join(", ")}` : "",
      `• Hide **${category.name}** from everyone except Matchmaking and Match Staff`,
      `• Replace these channels' own permissions with the category's: ${channelNames(category).join(", ") || "none"}`,
      `• Fill any empty Staff, Ping and Champion roles in your Matchmaking setups`,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000),
  });
}

export async function handleServerSetup(interaction: ButtonInteraction) {
  const [, action, categoryId] = interaction.customId.split(":");
  if (action === "cancel") return void (await interaction.update({ content: "Canceled. Nothing was changed.", components: [] }));
  const { guild } = interaction;
  if (!guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return void (await interaction.reply({ content: "Only server admins can run this.", ephemeral: true }));
  await interaction.update({ content: "Setting up your server…", components: [] });
  const category = await guild.channels.fetch(categoryId).catch(() => null);
  const content =
    category?.type === ChannelType.GuildCategory
      ? await withLock(`setup:${guild.id}`, () => applyServerSetup(guild, category)).catch((err) => {
          logError("bot", err, guild.id);
          return "Something went wrong with that. Staff can see the details on the Errors page.";
        })
      : "That category no longer exists.";
  await interaction.editReply({ content: content.slice(0, 2000) });
}
