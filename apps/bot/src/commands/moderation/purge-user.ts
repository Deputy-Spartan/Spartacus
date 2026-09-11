import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const command: CommandModule = {
  moduleKey: "MODERATION",
  data: new SlashCommandBuilder()
    .setName("purge-user")
    .setDescription("Delete a user's recent messages across every channel in the server")
    .addUserOption((o) => o.setName("user").setDescription("User whose messages to delete").setRequired(true))
    .addIntegerOption((o) =>
      o
        .setName("channel_limit")
        .setDescription("Max messages to scan per channel (default 200)")
        .setMinValue(1)
        .setMaxValue(500)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages) as SlashCommandBuilder,

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const scanLimit = interaction.options.getInteger("channel_limit") ?? 200;
    const guild = interaction.guild;

    if (!guild) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const me = await guild.members.fetchMe().catch(() => null);
    const channels = guild.channels.cache.filter((channel) => {
      if (!channel.isTextBased() || channel.isVoiceBased()) return false;
      if (!me) return false;
      const perms = channel.permissionsFor(me);
      if (!perms) return false;
      return perms.has(PermissionFlagsBits.ViewChannel) && perms.has(PermissionFlagsBits.ManageMessages);
    });

    let deletedCount = 0;
    let channelsWithDeletions = 0;
    let channelsWithSkippedOld = 0;

    for (const [, channel] of channels) {
      if (!("messages" in channel) || !("bulkDelete" in channel)) continue;

      let lastId: string | undefined;
      let scanned = 0;
      let deletedInChannel = 0;
      let skippedOldInChannel = false;

      while (scanned < scanLimit) {
        const fetchLimit = Math.min(100, scanLimit - scanned);
        const messages = await channel.messages.fetch({ limit: fetchLimit, before: lastId }).catch(() => null);
        if (!messages || messages.size === 0) break;

        lastId = messages.last()?.id;
        scanned += messages.size;

        const targetMessages = [...messages.filter((m) => m.author.id === user.id).values()];
        if (targetMessages.length === 0) {
          if (messages.size < fetchLimit) break;
          continue;
        }

        const now = Date.now();
        const recent = targetMessages.filter((m) => now - m.createdTimestamp < FOURTEEN_DAYS_MS);
        const old = targetMessages.filter((m) => now - m.createdTimestamp >= FOURTEEN_DAYS_MS);

        if (old.length > 0) skippedOldInChannel = true;

        if (recent.length === 1) {
          await recent[0].delete().catch(() => null);
          deletedInChannel += 1;
        } else if (recent.length > 1) {
          const deleted = await channel.bulkDelete(recent, true).catch(() => null);
          deletedInChannel += deleted?.size ?? 0;
        }

        if (messages.size < fetchLimit) break;
      }

      if (deletedInChannel > 0) {
        deletedCount += deletedInChannel;
        channelsWithDeletions += 1;
      }
      if (skippedOldInChannel) channelsWithSkippedOld += 1;
    }

    const parts = [
      `🧹 Deleted **${deletedCount}** message(s) from **${user.tag}** across **${channelsWithDeletions}** channel(s).`,
    ];
    if (channelsWithSkippedOld > 0) {
      parts.push(
        `Skipped older-than-14-day messages in ${channelsWithSkippedOld} channel(s) — those must be deleted individually and were left alone for speed.`
      );
    }

    await interaction.editReply(parts.join(" "));
  },
};

export default command;
