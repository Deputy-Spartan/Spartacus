import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandModule } from "../types";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";

// Reuses the same random-selection approach as apps/bot/src/jobs/giveawayEnder.ts
// (uniform random pick without replacement) so reroll behavior stays consistent
// with how the giveaway originally picked its winners. Exported so it can be
// exercised directly in tests without going through Discord.
export function pickWinners(entrantUserIds: string[], winnerCount: number): string[] {
  const winners: string[] = [];
  const pool = [...entrantUserIds];
  for (let i = 0; i < winnerCount && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  return winners;
}

const command: CommandModule = {
  moduleKey: "GIVEAWAYS",
  data: new SlashCommandBuilder()
    .setName("giveaway-reroll")
    .setDescription("Reroll the winner(s) of an ended giveaway")
    .addStringOption((o) => o.setName("message_id").setDescription("Message ID of the giveaway announcement").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageMessages) as SlashCommandBuilder,

  async execute(interaction) {
    const messageId = interaction.options.getString("message_id", true);

    // messageId is the identifier users/staff actually have on hand (it's
    // right there in the giveaway announcement they're looking at), whereas
    // the internal cuid `id` isn't surfaced anywhere in Discord.
    const giveaway = await prisma.giveaway.findFirst({
      where: { guildId: interaction.guildId as string, messageId },
      include: { entries: true },
    });

    if (!giveaway) {
      await interaction.reply({ content: "Couldn't find a giveaway with that message ID in this server.", ephemeral: true });
      return;
    }
    if (!giveaway.ended) {
      await interaction.reply({ content: "That giveaway hasn't ended yet — you can only reroll a finished giveaway.", ephemeral: true });
      return;
    }

    const entrants = giveaway.entries.map((e) => e.userId);
    const winners = pickWinners(entrants, giveaway.winnerCount);

    const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
    if (isSendableChannel(channel)) {
      const embed = new EmbedBuilder()
        .setColor(0xb14bff)
        .setTitle(`🔁 Reroll! ${giveaway.prize}`)
        .setDescription(
          winners.length > 0
            ? `New winner(s): ${winners.map((w) => `<@${w}>`).join(", ")}!`
            : "No valid entries — no winner could be selected."
        );
      await channel.send({ embeds: [embed] }).catch(() => null);
    }

    await interaction.reply({
      content:
        winners.length > 0
          ? `🔁 Rerolled **${giveaway.prize}** — new winner(s): ${winners.map((w) => `<@${w}>`).join(", ")}`
          : `🔁 Rerolled **${giveaway.prize}** — no valid entries to pick from.`,
      ephemeral: true,
    });
  },
};

export default command;
