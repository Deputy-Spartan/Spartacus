import { Events, Interaction } from "discord.js";
import { isModuleEnabled } from "../lib/moduleGate";
import { commands } from "../commands";

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction) {
  if (!interaction.guildId) return;

  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;

    if (command.moduleKey) {
      const enabled = await isModuleEnabled(interaction.guildId, command.moduleKey);
      if (!enabled) {
        await interaction.reply({
          content:
            "⚠️ This feature is currently disabled for this server. An admin can enable it from the Spartacus dashboard.",
          ephemeral: true,
        });
        return;
      }
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[command:${interaction.commandName}] failed:`, err);
      const payload = { content: "Something went wrong running that command.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
    return;
  }

  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith("event:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "EVENTS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Event Coordination is disabled for this server.", ephemeral: true });
      return;
    }
    const { handleEventSignupInteraction } = await import("../modules/eventCoordination/handleSignup");
    await handleEventSignupInteraction(interaction);
    return;
  }

  if (interaction.customId.startsWith("ticketpanel:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "TICKETS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Tickets is disabled for this server.", ephemeral: true });
      return;
    }
    var panelId = interaction.customId.split(":")[1];
    const { handleOpenTicket } = await import("../modules/tickets/tickets");
    await handleOpenTicket(interaction, panelId);
    return;
  }

  if (interaction.customId.startsWith("ticket:")) {
    var ticketParts = interaction.customId.split(":");
    const { handleTicketControl } = await import("../modules/tickets/tickets");
    await handleTicketControl(interaction, ticketParts[1], ticketParts[2] as "claim" | "close");
    return;
  }

  if (interaction.customId.startsWith("giveaway:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "GIVEAWAYS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Giveaways is disabled for this server.", ephemeral: true });
      return;
    }
    var giveawayId = interaction.customId.split(":")[1];
    const { prisma } = await import("../lib/prisma");
    await prisma.giveawayEntry
      .create({ data: { giveawayId, userId: interaction.user.id } })
      .then(() => interaction.reply({ content: "🎉 You're entered!", ephemeral: true }))
      .catch(() => interaction.reply({ content: "You're already entered in this giveaway.", ephemeral: true }));
    return;
  }

  if (interaction.customId.startsWith("poll:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "POLLS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Polls is disabled for this server.", ephemeral: true });
      return;
    }
    var pollParts = interaction.customId.split(":");
    const { handlePollVote } = await import("../commands/engagement/poll");
    await handlePollVote(interaction, pollParts[1], Number(pollParts[2]));
    return;
  }

  if (interaction.customId.startsWith("trivia:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "TRIVIA");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Trivia is disabled for this server.", ephemeral: true });
      return;
    }
    var triviaParts = interaction.customId.split(":");
    const { handleTriviaAnswer } = await import("../commands/games/trivia");
    await handleTriviaAnswer(interaction, Number(triviaParts[1]), Number(triviaParts[2]), Number(triviaParts[3]));
  }
}
