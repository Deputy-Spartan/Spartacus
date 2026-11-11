import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { LIVE_PLATFORMS, cleanHandle, type LivePlatform } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

// /mystream: a streamer ties their own channel to their Discord account, so the
// server posts their going-live alerts and gives them the Live role while they
// stream. Staff can still do the same from the dashboard.
const AUTO = LIVE_PLATFORMS.filter((p) => p.auto);

const command: CommandModule = {
  moduleKey: "STREAM_ALERTS",
  data: new SlashCommandBuilder()
    .setName("mystream")
    .setDescription("Connect your streaming channel to your Discord account")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("link")
        .setDescription("Get alerts and the Live role for your channel")
        .addStringOption((o) =>
          o.setName("platform").setDescription("Where you stream").setRequired(true).addChoices(...AUTO.map((p) => ({ name: `${p.emoji} ${p.name}`, value: p.id }))),
        )
        .addStringOption((o) => o.setName("channel").setDescription("Your channel name or link").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("unlink").setDescription("Stop alerts for the channels you linked"))
    .addSubcommand((s) => s.setName("list").setDescription("Show the channels linked to you")) as SlashCommandBuilder,

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) return;
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return;
    const sub = interaction.options.getSubcommand();
    const settings = await prisma.streamAlertSettings.findUnique({ where: { guildId: guild.id } });

    if (sub === "list") {
      const mine = await prisma.streamSubscription.findMany({ where: { guildId: guild.id, discordUserId: member.id } });
      await interaction.reply({ content: mine.length ? mine.map((s) => `• ${s.platform}: **${s.channelName}**${s.isLive ? " 🔴 live" : ""}`).join("\n") : "Nothing is linked to you yet. Use `/mystream link`.", ephemeral: true });
      return;
    }
    if (sub === "unlink") {
      const gone = await prisma.streamSubscription.deleteMany({ where: { guildId: guild.id, discordUserId: member.id } });
      if (settings?.liveRoleId && member.roles.cache.has(settings.liveRoleId)) await member.roles.remove(settings.liveRoleId).catch(() => null);
      await interaction.reply({ content: gone.count ? `🗑️ Unlinked ${gone.count} channel${gone.count === 1 ? "" : "s"}.` : "Nothing was linked to you.", ephemeral: true });
      return;
    }

    const staff = member.permissions.has(PermissionFlagsBits.ManageGuild);
    const allowed = staff || (settings?.selfServeRoleId ? member.roles.cache.has(settings.selfServeRoleId) : false);
    if (!allowed) {
      await interaction.reply({ content: "Only members with the streamer role can link a channel. Ask staff to add you.", ephemeral: true });
      return;
    }
    if (!settings?.defaultChannelId) {
      await interaction.reply({ content: "Staff haven't picked a channel for going-live alerts yet.", ephemeral: true });
      return;
    }
    const platform = interaction.options.getString("platform", true) as LivePlatform;
    const handle = cleanHandle(platform, interaction.options.getString("channel", true));
    if (!handle) {
      await interaction.reply({ content: "Type your channel name or link.", ephemeral: true });
      return;
    }
    const existing = await prisma.streamSubscription.findFirst({ where: { guildId: guild.id, platform, channelName: handle } });
    if (existing?.discordUserId && existing.discordUserId !== member.id) {
      await interaction.reply({ content: "That channel is already linked to someone else.", ephemeral: true });
      return;
    }
    const count = await prisma.streamSubscription.count({ where: { guildId: guild.id, discordUserId: member.id } });
    if (!existing && count >= 5 && !staff) {
      await interaction.reply({ content: "You can link up to 5 channels.", ephemeral: true });
      return;
    }
    if (existing) await prisma.streamSubscription.update({ where: { id: existing.id }, data: { discordUserId: member.id } });
    else
      await prisma.streamSubscription.create({
        data: { guildId: guild.id, platform, channelName: handle, announceChannelId: settings.defaultChannelId, discordUserId: member.id, displayName: member.displayName },
      });
    await interaction.reply({
      content: `🔴 Linked **${handle}** on ${platform}. When you go live, the server posts your alert${settings.liveRoleId ? " and gives you the Live role until you're done" : ""}.`,
      ephemeral: true,
    });
  },
};

export default command;
