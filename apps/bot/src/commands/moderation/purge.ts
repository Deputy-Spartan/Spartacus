import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";

const MAX_TOTAL = 1000;

const command: CommandModule = {
  moduleKey: "MODERATION",
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete recent messages in this channel")
    .addIntegerOption((o) =>
      o.setName("amount").setDescription("How many messages to delete (max 1000)").setRequired(true).setMinValue(1).setMaxValue(MAX_TOTAL)
    )
    .addUserOption((o) => o.setName("user").setDescription("Only delete messages from this member"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages) as SlashCommandBuilder,

  async execute(interaction) {
    const amount = interaction.options.getInteger("amount", true);
    const targetUser = interaction.options.getUser("user");

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased() || !("bulkDelete" in channel)) {
      await interaction.reply({ content: "This command only works in server text channels.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    let remaining = amount;
    let totalDeleted = 0;
    let lastId: string | undefined;

    // Discord only lets us fetch/bulk-delete 100 messages per call and won't
    // bulk-delete anything older than 14 days, so this pages backward through
    // history until it hits either the requested amount or the channel's start.
    while (remaining > 0) {
      const messages = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!messages || messages.size === 0) break;
      lastId = messages.last()?.id;

      const candidates = targetUser ? [...messages.filter((m) => m.author.id === targetUser.id).values()] : [...messages.values()];
      const batch = candidates.slice(0, remaining);

      if (batch.length === 1) {
        await batch[0].delete().catch(() => null);
        totalDeleted += 1;
        remaining -= 1;
      } else if (batch.length > 1) {
        const deleted = await channel.bulkDelete(batch, true).catch(() => null);
        totalDeleted += deleted?.size ?? 0;
        remaining -= batch.length;
      }

      if (messages.size < 100) break; // reached the start of the channel's history
    }

    await interaction.editReply(
      `🧹 Deleted **${totalDeleted}** message${totalDeleted === 1 ? "" : "s"}${targetUser ? ` from **${targetUser.tag}**` : ""}.` +
        (totalDeleted < amount ? " (ran out of messages, or hit Discord's 14-day bulk-delete limit)" : "")
    );
  },
};

export default command;
