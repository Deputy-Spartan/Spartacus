import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import type { CustomSlashCommand } from "@spartacus/db";
import { addBalance } from "../../lib/economy";
import { buildStickyPayload } from "../../lib/stickyRender";
import { resolveSavedEmbed } from "../../lib/savedEmbedRender";

export async function executeCustomCommand(interaction: ChatInputCommandInteraction, command: CustomSlashCommand) {
  const ephemeral = command.ephemeralReply;

  if (command.actionType === "SEND_MESSAGE") {
    await interaction.reply({ content: command.messageText || "…", ephemeral });
    return;
  }

  if (command.actionType === "POST_EMBED") {
    const saved = await resolveSavedEmbed(command.savedEmbedId);
    await interaction.reply({
      ...(await buildStickyPayload(
        {
          content: command.messageText || "",
          embedEnabled: command.embedEnabled,
          embedTitle: command.embedTitle,
          embedDescription: command.embedDescription,
          embedColor: command.embedColor,
          buttons: command.buttons,
          embedExtra: command.embedExtra,
        },
        { savedEmbed: saved, guildId: command.guildId }
      )),
      ephemeral,
    });
    return;
  }

  if (command.actionType === "GIVE_ROLE" || command.actionType === "REMOVE_ROLE") {
    if (!command.roleId) {
      await interaction.reply({ content: "This command isn't fully configured (no role set).", ephemeral: true });
      return;
    }
    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    if (targetUser.id !== interaction.user.id && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "You need Manage Roles to use this on someone else.", ephemeral: true });
      return;
    }
    const member = await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "Couldn't find that member.", ephemeral: true });
      return;
    }

    const giving = command.actionType === "GIVE_ROLE";
    const changed = await (giving ? member.roles.add(command.roleId) : member.roles.remove(command.roleId)).then(
      () => true,
      () => false
    );
    if (!changed) {
      await interaction.reply({ content: "⚠️ I couldn't change that role. Drag my role above it.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: `✅ ${giving ? "Gave" : "Removed"} <@&${command.roleId}> ${giving ? "to" : "from"} ${targetUser}.`, ephemeral });
    return;
  }

  if (command.actionType === "ADD_CURRENCY") {
    if (!command.currencyAmount || !interaction.guildId) {
      await interaction.reply({ content: "This command isn't fully configured (no amount set).", ephemeral: true });
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "You need Manage Server to give currency.", ephemeral: true });
      return;
    }
    const targetUser = interaction.options.getUser("user", true);
    await addBalance(interaction.guildId, targetUser.id, command.currencyAmount, "admin");
    await interaction.reply({ content: `✅ Gave **${command.currencyAmount}** currency to ${targetUser}.`, ephemeral });
    return;
  }

  await interaction.reply({ content: "This command isn't configured correctly.", ephemeral: true });
}
