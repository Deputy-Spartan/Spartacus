import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { LIVE_PLATFORMS, cleanHandle, type LivePlatform } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { manualEndLive, manualGoLive } from "../../modules/community/goLive";
import type { CommandModule } from "../types";

// /golive: announce your stream by hand, for any platform (TikTok when the
// auto check can't see it, Facebook, Trovo, Rumble, X and the rest).
// /golive end: mark your stream as over.
const command: CommandModule = {
  moduleKey: "STREAM_ALERTS",
  data: new SlashCommandBuilder()
    .setName("golive")
    .setDescription("Announce that you're streaming")
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Post your going-live announcement")
        .addStringOption((o) =>
          o
            .setName("platform")
            .setDescription("Where you're streaming")
            .setRequired(true)
            .addChoices(...LIVE_PLATFORMS.map((p) => ({ name: `${p.emoji} ${p.id === "other" ? "Other (paste your link)" : p.name}`, value: p.id }))),
        )
        .addStringOption((o) => o.setName("link").setDescription("Your channel name or stream link").setRequired(true))
        .addStringOption((o) => o.setName("title").setDescription("What you're streaming (optional)"))
        .addStringOption((o) => o.setName("site").setDescription("For Other: the site's name, e.g. Facebook")),
    )
    .addSubcommand((s) => s.setName("end").setDescription("Mark your stream as over")) as SlashCommandBuilder,

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) return;
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return;
    const settings = await prisma.streamAlertSettings.findUnique({ where: { guildId: guild.id } });
    // Staff, streamers linked on the dashboard, or members with the streamer role.
    const linked = await prisma.streamSubscription.count({ where: { guildId: guild.id, discordUserId: member.id } });
    const allowed =
      member.permissions.has(PermissionFlagsBits.ManageGuild) || linked > 0 || (settings?.selfServeRoleId ? member.roles.cache.has(settings.selfServeRoleId) : false);
    if (!allowed) {
      await interaction.reply({ content: "Only streamers set up on the dashboard (or with the streamer role) can use this.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    if (interaction.options.getSubcommand() === "end") {
      const n = await manualEndLive(interaction.client, guild.id, member.id);
      await interaction.editReply(n ? "⚫ Marked your stream as ended." : "You don't have a stream marked as live.");
      return;
    }
    const platform = interaction.options.getString("platform", true) as LivePlatform;
    const raw = interaction.options.getString("link", true);
    if (platform === "other" && !/^https?:\/\//i.test(raw)) {
      await interaction.editReply("For Other, paste your full stream link, starting with https://");
      return;
    }
    const result = await manualGoLive(
      interaction.client,
      guild.id,
      member.id,
      member.displayName,
      platform,
      cleanHandle(platform, raw),
      interaction.options.getString("title"),
      interaction.options.getString("site"),
    );
    await interaction.editReply(result.ok ? "🔴 Your going-live announcement is up! Run `/golive end` when you're done." : `⚠️ ${result.error}`);
  },
};

export default command;
