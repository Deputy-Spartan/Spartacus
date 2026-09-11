import { AnySelectMenuInteraction, ButtonInteraction, GuildMember } from "discord.js";
import { prisma, type EmbedActionConfig } from "@spartacus/db";
import { addBalance } from "../../lib/economy";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../../lib/savedEmbedRender";
import { isSendableChannel } from "../../lib/channels";

// Executes whatever action was configured in the Embed Creator for a
// button click or select-menu pick — the custom_id ("ecaction:<id>") points
// at an EmbedComponentAction row created at send time (see
// apps/bot/src/lib/savedEmbedRender.ts / apps/api/src/lib/embedCreatorPayload.ts).
// A component with no action still gets a customId ("ecnoop:<random>"),
// handled separately in interactionCreate.ts with a generic "not connected"
// reply — this file only ever runs for components that DO have one.

type ActionableInteraction = ButtonInteraction | AnySelectMenuInteraction;

async function toggleRole(member: GuildMember, roleId: string): Promise<string> {
  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId).catch(() => null);
    return "Role removed.";
  }
  await member.roles.add(roleId).catch(() => null);
  return "Role added.";
}

async function runAction(interaction: ActionableInteraction, action: EmbedActionConfig | undefined, targetMember: GuildMember) {
  const ephemeral = action?.ephemeral !== false;

  if (!action || action.type === "none") {
    await interaction.reply({ content: "This component isn't connected to an action yet.", ephemeral: true });
    return;
  }

  switch (action.type) {
    case "give_role": {
      if (!action.roleId) return void (await interaction.reply({ content: "This action isn't fully configured (no role set).", ephemeral: true }));
      await targetMember.roles.add(action.roleId).catch(() => null);
      await interaction.reply({ content: "✅ Role added.", ephemeral });
      return;
    }
    case "remove_role": {
      if (!action.roleId) return void (await interaction.reply({ content: "This action isn't fully configured (no role set).", ephemeral: true }));
      await targetMember.roles.remove(action.roleId).catch(() => null);
      await interaction.reply({ content: "✅ Role removed.", ephemeral });
      return;
    }
    case "toggle_role": {
      if (!action.roleId) return void (await interaction.reply({ content: "This action isn't fully configured (no role set).", ephemeral: true }));
      const message = await toggleRole(targetMember, action.roleId);
      await interaction.reply({ content: `✅ ${message}`, ephemeral });
      return;
    }
    case "add_currency": {
      if (!action.currencyAmount || !interaction.guildId) {
        await interaction.reply({ content: "This action isn't fully configured (no amount set).", ephemeral: true });
        return;
      }
      await addBalance(interaction.guildId, targetMember.id, action.currencyAmount, "admin");
      await interaction.reply({ content: `✅ Gave **${action.currencyAmount}** currency.`, ephemeral });
      return;
    }
    case "send_message": {
      await interaction.reply({ content: action.messageText || "…", ephemeral });
      return;
    }
    case "post_embed": {
      const saved = await resolveSavedEmbed(action.embedPresetId);
      if (!saved || !interaction.guildId) {
        await interaction.reply({ content: "This action isn't fully configured (no saved embed set).", ephemeral: true });
        return;
      }
      const payload = await buildSavedEmbedPayload(interaction.guildId, saved);
      await interaction.reply({ ...payload, ephemeral });
      return;
    }
    default:
      await interaction.reply({ content: "This component isn't connected to an action yet.", ephemeral: true });
  }
}

export async function handleEmbedButtonAction(interaction: ButtonInteraction, actionId: string) {
  const row = await prisma.embedComponentAction.findUnique({ where: { id: actionId } });
  if (!row || !interaction.guild) {
    await interaction.reply({ content: "This button isn't connected to an action yet.", ephemeral: true });
    return;
  }
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: "Couldn't find your member info.", ephemeral: true });
    return;
  }
  await runAction(interaction, row.config as unknown as EmbedActionConfig, member);
}

interface SelectActionConfig {
  selectType: "string" | "user" | "role" | "user_role" | "channel";
  defaultAction?: EmbedActionConfig;
  options?: Array<{ value: string; action?: EmbedActionConfig }>;
}

export async function handleEmbedSelectAction(interaction: AnySelectMenuInteraction, actionId: string) {
  const row = await prisma.embedComponentAction.findUnique({ where: { id: actionId } });
  if (!row || !interaction.guild) {
    await interaction.reply({ content: "This menu isn't connected to an action yet.", ephemeral: true });
    return;
  }
  const config = row.config as unknown as SelectActionConfig;
  const invoker = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!invoker) {
    await interaction.reply({ content: "Couldn't find your member info.", ephemeral: true });
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const opt = (config.options || []).find((o) => o.value === interaction.values[0]);
    await runAction(interaction, opt?.action, invoker);
    return;
  }

  if (interaction.isRoleSelectMenu()) {
    const roleId = interaction.values[0];
    const options = config.options ?? [];
    const matched = options.find((o) => o.value === roleId);
    if (matched) {
      if (!matched.action || matched.action.type === "none") {
        const ephemeral = matched.action?.ephemeral !== false;
        const message = await toggleRole(invoker, roleId);
        await interaction.reply({ content: `✅ ${message}`, ephemeral });
      } else {
        await runAction(interaction, matched.action, invoker);
      }
      return;
    }
    if (options.length > 0) {
      await interaction.reply({ content: "That role isn't set up for this menu.", ephemeral: true });
      return;
    }
    // No curated list configured at all — every role picker's baseline
    // behavior is self-assign/unassign whatever gets picked.
    const ephemeral = config.defaultAction?.ephemeral !== false;
    const message = await toggleRole(invoker, roleId);
    await interaction.reply({ content: `✅ ${message}`, ephemeral });
    return;
  }

  if (interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    const options = config.options ?? [];
    const matched = options.find((o) => o.value === channelId);
    const action = matched ? matched.action : options.length === 0 ? config.defaultAction : undefined;

    if (options.length > 0 && !matched) {
      await interaction.reply({ content: "That channel isn't set up for this menu.", ephemeral: true });
      return;
    }
    if (!action?.embedPresetId) {
      await interaction.reply({ content: "This menu isn't fully configured (no saved embed set).", ephemeral: true });
      return;
    }
    const saved = await resolveSavedEmbed(action.embedPresetId);
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!saved || !channel || !isSendableChannel(channel)) {
      await interaction.reply({ content: "Couldn't send to that channel — check my permissions there.", ephemeral: true });
      return;
    }
    const payload = await buildSavedEmbedPayload(interaction.guildId!, saved);
    await channel.send(payload).catch(() => null);
    await interaction.reply({ content: `✅ Sent to <#${channelId}>.`, ephemeral: true });
    return;
  }

  if (interaction.isUserSelectMenu()) {
    const userId = interaction.values[0];
    const options = config.options ?? [];
    const matched = options.find((o) => o.value === userId);
    if (options.length > 0 && !matched) {
      await interaction.reply({ content: "That member isn't set up for this menu.", ephemeral: true });
      return;
    }
    const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ content: "Couldn't find that member.", ephemeral: true });
      return;
    }
    await runAction(interaction, matched ? matched.action : config.defaultAction, targetMember);
    return;
  }

  if (interaction.isMentionableSelectMenu()) {
    const pickedUser = interaction.users.first();
    const pickedRole = interaction.roles.first();
    if (pickedUser) {
      const targetMember = await interaction.guild.members.fetch(pickedUser.id).catch(() => null);
      if (targetMember) {
        await runAction(interaction, config.defaultAction, targetMember);
        return;
      }
    } else if (pickedRole) {
      const ephemeral = config.defaultAction?.ephemeral !== false;
      const message = await toggleRole(invoker, pickedRole.id);
      await interaction.reply({ content: `✅ ${message}`, ephemeral });
      return;
    }
    await interaction.reply({ content: "Couldn't resolve your selection.", ephemeral: true });
  }
}
