import { Events, Interaction } from "discord.js";
import { logError, prisma } from "@spartacus/db";
import { isModuleEnabled } from "../lib/moduleGate";
import { commands } from "../commands";

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction) {
  // These two happen in a DM (the appeal button/modal live on a DM the bot
  // sent), so they must be handled before the guild-only gate below.
  if (interaction.isButton() && interaction.customId.startsWith("appeal:start:")) {
    const caseId = interaction.customId.split(":")[2];
    const { handleAppealStart } = await import("../modules/moderation/appeals");
    await handleAppealStart(interaction, caseId);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("appealmodal:")) {
    const caseId = interaction.customId.split(":")[1];
    const { handleAppealModalSubmit } = await import("../modules/moderation/appeals");
    await handleAppealModalSubmit(interaction, caseId);
    return;
  }

  if (interaction.isButton() && interaction.customId === "verify:click") {
    const { handleVerifyButton } = await import("../modules/security/verification");
    await handleVerifyButton(interaction);
    return;
  }

  if (interaction.isButton() && interaction.customId === "playerreport:open") {
    if (!interaction.guildId || !(await isModuleEnabled(interaction.guildId, "PLAYER_REPORTS"))) {
      await interaction.reply({ content: "⚠️ Player Reports is disabled for this server.", ephemeral: true });
      return;
    }
    const { handlePlayerReportPanelButton } = await import("../modules/moderation/playerReports");
    await handlePlayerReportPanelButton(interaction);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "playerreportmodal") {
    if (!interaction.guildId || !(await isModuleEnabled(interaction.guildId, "PLAYER_REPORTS"))) {
      await interaction.reply({ content: "⚠️ Player Reports is disabled for this server.", ephemeral: true });
      return;
    }
    const { handlePlayerReportModalSubmit } = await import("../modules/moderation/playerReports");
    await handlePlayerReportModalSubmit(interaction);
    return;
  }

  if (interaction.isButton() && (interaction.customId.startsWith("report:claim:") || interaction.customId.startsWith("report:close:"))) {
    const [, action, reportId] = interaction.customId.split(":");
    const { handleReportClaim, handleReportClose } = await import("../modules/moderation/playerReports");
    if (action === "claim") await handleReportClaim(interaction, reportId);
    else await handleReportClose(interaction, reportId);
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("access:approve:")) {
    const requestId = interaction.customId.split(":")[2];
    const { handleAccessApprove } = await import("../modules/owner/accessRequests");
    await handleAccessApprove(interaction, requestId);
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("access:deny:")) {
    const requestId = interaction.customId.split(":")[2];
    const { handleAccessDeny } = await import("../modules/owner/accessRequests");
    await handleAccessDeny(interaction, requestId);
    return;
  }

  // Support DM Intake's flow-picker and question-answer buttons live in a
  // DM (no guildId), so they're handled here, before the guild-only gate.
  if (interaction.isButton() && interaction.customId.startsWith("suppintake:flow:")) {
    const flowId = interaction.customId.split(":")[2];
    const { handleFlowSelect } = await import("../modules/support/supportIntake");
    await handleFlowSelect(interaction, flowId);
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("suppintake:choice:")) {
    const parts = interaction.customId.split(":");
    const { handleChoiceAnswer } = await import("../modules/support/supportIntake");
    await handleChoiceAnswer(interaction, parts[2], parts[3]);
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("suppintake:server:")) {
    const guildId = interaction.customId.split(":")[2];
    const { handleServerSelect } = await import("../modules/support/supportIntake");
    await handleServerSelect(interaction, guildId);
    return;
  }

  // Embed Creator's plain buttons and every select-menu type ship with no
  // action behind them yet (same real limitation Discohook itself has) —
  // this answers with a clear message instead of Discord's own bare
  // "This interaction failed".
  if ((interaction.isButton() || interaction.isAnySelectMenu()) && interaction.customId.startsWith("ecnoop:")) {
    await interaction.reply({ content: "This component isn't connected to an action yet.", ephemeral: true });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("ecaction:")) {
    const actionId = interaction.customId.split(":")[1];
    const { handleEmbedButtonAction } = await import("../modules/community/embedActions");
    await handleEmbedButtonAction(interaction, actionId);
    return;
  }

  if (interaction.isAnySelectMenu() && interaction.customId.startsWith("ecaction:")) {
    const actionId = interaction.customId.split(":")[1];
    const { handleEmbedSelectAction } = await import("../modules/community/embedActions");
    await handleEmbedSelectAction(interaction, actionId);
    return;
  }

  if (!interaction.guildId) return;

  if (interaction.isChatInputCommand()) {
    // A Channel Lock restricted to specific slash commands refuses anything
    // else here — interactions can't be "deleted" the way a plain message
    // can, so this is the equivalent gate for them. Only applies once an
    // admin has actually listed commands; a bare slashCommandsOnly lock
    // (empty list) still allows every command, unchanged from before.
    const lock = (await isModuleEnabled(interaction.guildId, "CHANNEL_LOCKS"))
      ? await prisma.channelLock.findUnique({ where: { channelId: interaction.channelId } })
      : null;
    if (lock?.slashCommandsOnly) {
      // Defensively strip a leading slash here too, in case a lock saved
      // before the dashboard started normalizing this still has one stored.
      const allowedCommands = Array.isArray(lock.allowedCommands)
        ? (lock.allowedCommands as string[]).map((c) => c.replace(/^\//, "").toLowerCase())
        : [];
      if (allowedCommands.length > 0 && !allowedCommands.includes(interaction.commandName)) {
        await interaction.reply({
          content: `⚠️ Only these commands are allowed in this channel: ${allowedCommands.map((c) => `\`/${c}\``).join(", ")}`,
          ephemeral: true,
        });
        return;
      }
    }

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
    if (custom) {
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

    // Still not found — check the dashboard-created LFG commands, which are
    // also registered as real per-guild slash commands (same mechanism as
    // custom commands above) but live in their own table.
    const lfg = await prisma.lfgCommand.findUnique({
      where: { guildId_trigger: { guildId: interaction.guildId, trigger: interaction.commandName } },
      include: { categories: true },
    });
    if (!lfg) return;

    const lfgModuleEnabled = await isModuleEnabled(interaction.guildId, "LFG");
    if (!lfgModuleEnabled) {
      await interaction.reply({
        content: "⚠️ This feature is currently disabled for this server. An admin can enable it from the Spartacus dashboard.",
        ephemeral: true,
      });
      return;
    }

    try {
      const { handleLfgInteraction } = await import("../modules/community/lfg");
      await handleLfgInteraction(interaction, lfg);
    } catch (err) {
      console.error(`[lfg:${interaction.commandName}] failed:`, err);
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

  if (interaction.isModalSubmit() && interaction.customId.startsWith("pollwritein:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "POLLS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Polls is disabled for this server.", ephemeral: true });
      return;
    }
    const pollId = interaction.customId.split(":")[1];
    const { handleWriteInModalSubmit } = await import("../modules/engagement/pollVotes");
    await handleWriteInModalSubmit(interaction, pollId);
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
    const enabled = await isModuleEnabled(interaction.guildId, "REACTION_ROLES");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Reaction Roles is disabled for this server.", ephemeral: true });
      return;
    }
    const panelId = interaction.customId.split(":")[1];
    const { handleRolePanelSelect } = await import("../modules/community/rolePanels");
    await handleRolePanelSelect(interaction, panelId);
    return;
  }

  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith("appeal:approve:") || interaction.customId.startsWith("appeal:deny:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "BAN_APPEALS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Ban/Mute Appeals is disabled for this server.", ephemeral: true });
      return;
    }
    const appealParts = interaction.customId.split(":");
    const { handleAppealResolve } = await import("../modules/moderation/appeals");
    await handleAppealResolve(interaction, appealParts[2], appealParts[1] as "approve" | "deny");
    return;
  }

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

  if (interaction.customId.startsWith("setuptestserver:confirm:")) {
    const token = interaction.customId.split(":")[2];
    const { handleSetupTestServerConfirm } = await import("../commands/utility/setupTestServer");
    await handleSetupTestServerConfirm(interaction, token);
    return;
  }

  if (interaction.customId.startsWith("setuptestserver:deleteonly:")) {
    const token = interaction.customId.split(":")[2];
    const { handleSetupTestServerDeleteOnly } = await import("../commands/utility/setupTestServer");
    await handleSetupTestServerDeleteOnly(interaction, token);
    return;
  }

  if (interaction.customId.startsWith("setuptestserver:skip:")) {
    const token = interaction.customId.split(":")[2];
    const { handleSetupTestServerSkip } = await import("../commands/utility/setupTestServer");
    await handleSetupTestServerSkip(interaction, token);
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

  if (interaction.customId.startsWith("poll:writein:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "POLLS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Polls is disabled for this server.", ephemeral: true });
      return;
    }
    const pollId = interaction.customId.split(":")[2];
    const { handleWriteInButton } = await import("../modules/engagement/pollVotes");
    await handleWriteInButton(interaction, pollId);
    return;
  }

  if (interaction.customId.startsWith("poll:lockin:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "POLLS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Polls is disabled for this server.", ephemeral: true });
      return;
    }
    const pollId = interaction.customId.split(":")[2];
    const { handleLockInButton } = await import("../modules/engagement/pollVotes");
    await handleLockInButton(interaction, pollId);
    return;
  }

  if (interaction.customId.startsWith("ticket:")) {
    var ticketParts = interaction.customId.split(":");
    const { handleTicketControl } = await import("../modules/tickets/tickets");
    await handleTicketControl(interaction, ticketParts[1], ticketParts[2] as "claim" | "close");
    return;
  }

  if (interaction.customId.startsWith("suppintake:ticket:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "SUPPORT_INTAKE");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Support DM Intake is disabled for this server.", ephemeral: true });
      return;
    }
    var suppTicketParts = interaction.customId.split(":");
    const { handleTicketControl: handleSuppTicketControl } = await import("../modules/support/supportIntake");
    await handleSuppTicketControl(interaction, suppTicketParts[2], suppTicketParts[3] as "claim" | "close");
    return;
  }

  if (interaction.customId.startsWith("rolepanel:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "REACTION_ROLES");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Reaction Roles is disabled for this server.", ephemeral: true });
      return;
    }
    var rolePanelParts = interaction.customId.split(":");
    const { handleRolePanelButton } = await import("../modules/community/rolePanels");
    await handleRolePanelButton(interaction, rolePanelParts[1], rolePanelParts[2]);
    return;
  }

  if (interaction.customId.startsWith("welcomewave:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "WELCOME");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Welcome & Goodbye is disabled for this server.", ephemeral: true });
      return;
    }
    const waveParts = interaction.customId.split(":");
    const { handleWave } = await import("../events/guildMemberAdd");
    await handleWave(interaction, waveParts[2]);
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

  if (interaction.customId.startsWith("channellockreveal:")) {
    // No module-disabled guard on purpose — the reveal carries no ability
    // to bypass the lock that triggered it either way.
    const revealParts = interaction.customId.split(":");
    const { handleChannelLockReveal } = await import("../modules/utility/channelLocks");
    await handleChannelLockReveal(interaction, revealParts[1], revealParts[2]);
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

  if (interaction.customId.startsWith("application:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "APPLICATIONS");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Applications is disabled for this server.", ephemeral: true });
      return;
    }
    var applicationParts = interaction.customId.split(":");
    if (applicationParts[2] === "custom") {
      const { handleApplicationCustomResponse } = await import("../modules/community/applications");
      await handleApplicationCustomResponse(interaction, applicationParts[1], applicationParts[3]);
      return;
    }
    const { handleApplicationReview } = await import("../modules/community/applications");
    await handleApplicationReview(interaction, applicationParts[1], applicationParts[2] as "accept" | "deny");
    return;
  }

  if (interaction.customId.startsWith("rulesgate:agree:")) {
    const enabled = await isModuleEnabled(interaction.guildId, "RULES_GATE");
    if (!enabled) {
      await interaction.reply({ content: "⚠️ Rules Gate is disabled for this server.", ephemeral: true });
      return;
    }
    const settingsId = interaction.customId.split(":")[2];
    const { handleRulesGateAgree } = await import("../modules/community/rulesGate");
    await handleRulesGateAgree(interaction, settingsId);
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
