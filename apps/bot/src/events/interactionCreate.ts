import { Events, Interaction } from "discord.js";
import { logError, prisma } from "@spartacus/db";
import { isModuleEnabled } from "../lib/moduleGate";
import { commands } from "../commands";

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction) {
  if (!interaction.guildId) return;

  if (interaction.isChatInputCommand()) {
    // Independent of everything below — a whole module can stay on while
    // this one specific command (built-in or custom) is switched off from
    // the Moderator → Commands tab.
    const toggle = await prisma.commandToggle.findUnique({
      where: { guildId_commandName: { guildId: interaction.guildId, commandName: interaction.commandName } },
    });
    if (toggle && !toggle.enabled) {
      await interaction.reply({
        content: "⚠️ This command is currently disabled for this server.",
        ephemeral: true,
      });
      return;
    }

    const command = commands.get(interaction.commandName);

    if (command) {
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
        logError("bot", err, interaction.guildId ?? undefined);
        const payload = { content: "Something went wrong running that command.", ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      }
      return;
    }

    // Not a built-in command — check the dashboard-created custom commands
    // for this guild before giving up.
    const custom = await prisma.customSlashCommand.findUnique({
      where: { guildId_name: { guildId: interaction.guildId, name: interaction.commandName } },
    });
    if (!custom) return;

    try {
      const { executeCustomCommand } = await import("../modules/community/customSlashCommands");
      await executeCustomCommand(interaction, custom);
    } catch (err) {
      console.error(`[custom-command:${interaction.commandName}] failed:`, err);
      logError("bot", err, interaction.guildId ?? undefined);
      const payload = { content: "Something went wrong running that command.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("ticketclose:")) {
    const ticketId = interaction.customId.split(":")[1];
    const { handleTicketCloseModal } = await import("../modules/tickets/tickets");
    await handleTicketCloseModal(interaction, ticketId);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "birthdaysetmodal") {
    const enabled = await isModuleEnabled(interaction.guildId, "BIRTHDAYS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Birthdays is disabled for this server.", ephemeral: true });
      return;
    }
    const { handleBirthdaySetModal } = await import("../modules/community/birthdayPanel");
    await handleBirthdaySetModal(interaction);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("applicationmodal:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "APPLICATIONS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Applications is disabled for this server.", ephemeral: true });
      return;
    }
    var applicationModalParts = interaction.customId.split(":");
    const { handleApplicationSubmit } = await import("../modules/community/applications");
    await handleApplicationSubmit(interaction, applicationModalParts[1], applicationModalParts[2], applicationModalParts[3]);
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("ticketpanel:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "TICKETS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Tickets is disabled for this server.", ephemeral: true });
      return;
    }
    const panelId = interaction.customId.split(":")[1];
    const { handleOpenTicket } = await import("../modules/tickets/tickets");
    await handleOpenTicket(interaction, panelId, interaction.values[0]);
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("applicationpanel:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "APPLICATIONS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Applications is disabled for this server.", ephemeral: true });
      return;
    }
    const panelId = interaction.customId.split(":")[1];
    const { handleApplyButton } = await import("../modules/community/applications");
    await handleApplyButton(interaction, panelId);
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("rolepanelselect:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "ROLE_PANELS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Role Panels is disabled for this server.", ephemeral: true });
      return;
    }
    const panelId = interaction.customId.split(":")[1];
    const { handleRolePanelSelect } = await import("../modules/community/rolePanels");
    await handleRolePanelSelect(interaction, panelId);
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
    var ticketPanelParts = interaction.customId.split(":");
    const { handleOpenTicket } = await import("../modules/tickets/tickets");
    await handleOpenTicket(interaction, ticketPanelParts[1], ticketPanelParts[2]);
    return;
  }

  if (interaction.customId.startsWith("ticket:")) {
    var ticketParts = interaction.customId.split(":");
    const { handleTicketControl } = await import("../modules/tickets/tickets");
    await handleTicketControl(interaction, ticketParts[1], ticketParts[2] as "claim" | "close");
    return;
  }

  if (interaction.customId.startsWith("rolepanel:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "ROLE_PANELS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Role Panels is disabled for this server.", ephemeral: true });
      return;
    }
    var rolePanelParts = interaction.customId.split(":");
    const { handleRolePanelButton } = await import("../modules/community/rolePanels");
    await handleRolePanelButton(interaction, rolePanelParts[1], rolePanelParts[2]);
    return;
  }

  if (interaction.customId === "birthdaypanel") {
    const enabled = await isModuleEnabled(interaction.guildId, "BIRTHDAYS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Birthdays is disabled for this server.", ephemeral: true });
      return;
    }
    const { handleBirthdayButton } = await import("../modules/community/birthdayPanel");
    await handleBirthdayButton(interaction);
    return;
  }

  if (interaction.customId.startsWith("applicationpanel:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "APPLICATIONS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Applications is disabled for this server.", ephemeral: true });
      return;
    }
    var applicationPanelParts = interaction.customId.split(":");
    const { handleApplyButton } = await import("../modules/community/applications");
    await handleApplyButton(interaction, applicationPanelParts[1], applicationPanelParts[2]);
    return;
  }

  if (interaction.customId.startsWith("applicationcontinue:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "APPLICATIONS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Applications is disabled for this server.", ephemeral: true });
      return;
    }
    var applicationContinueParts = interaction.customId.split(":");
    const { handleApplicationContinue } = await import("../modules/community/applications");
    await handleApplicationContinue(interaction, applicationContinueParts[1], applicationContinueParts[2], applicationContinueParts[3]);
    return;
  }

  if (interaction.customId.startsWith("application:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "APPLICATIONS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Applications is disabled for this server.", ephemeral: true });
      return;
    }
    var applicationParts = interaction.customId.split(":");
    const { handleApplicationReview } = await import("../modules/community/applications");
    await handleApplicationReview(interaction, applicationParts[1], applicationParts[2] as "accept" | "deny");
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
