import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  OverwriteType,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type VoiceChannel,
} from "discord.js";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";

// The Lock, Rename and Limit buttons posted in a squad channel's own chat.
// Only the person who made the channel can use them.
export function tempChannelControls(channelId: string) {
  return {
    content: "🔊 This is your squad channel. It's deleted when everyone leaves.",
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`tvc:lock:${channelId}`).setLabel("Lock / Unlock").setEmoji("🔒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tvc:rename:${channelId}`).setLabel("Rename").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tvc:limit:${channelId}`).setLabel("Limit").setEmoji("👥").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

async function ownedChannel(interaction: ButtonInteraction | ModalSubmitInteraction, channelId: string): Promise<VoiceChannel | string> {
  const instance = await prisma.tempChannelInstance.findFirst({ where: { channelId } });
  if (!instance) return "This squad channel is gone.";
  if (instance.ownerId !== interaction.user.id) return "Only the person who made this channel can change it.";
  const channel = await interaction.guild?.channels.fetch(channelId).catch(() => null);
  return channel?.isVoiceBased() ? (channel as VoiceChannel) : "This squad channel is gone.";
}

export async function handleTempChannelControl(interaction: ButtonInteraction | ModalSubmitInteraction) {
  const [prefix, action, channelId] = interaction.customId.split(":");
  try {
    const channel = await ownedChannel(interaction, channelId);
    if (typeof channel === "string") return void (await interaction.reply({ content: channel, ephemeral: true }));

    if (prefix === "tvc" && interaction.isButton()) {
      if (action === "rename" || action === "limit") {
        const input =
          action === "rename"
            ? new TextInputBuilder().setCustomId("value").setLabel("New name").setStyle(TextInputStyle.Short).setMaxLength(90).setValue(channel.name.slice(0, 90))
            : new TextInputBuilder().setCustomId("value").setLabel("Player limit (0 for none, up to 99)").setStyle(TextInputStyle.Short).setMaxLength(2).setValue(String(channel.userLimit));
        const modal = new ModalBuilder().setCustomId(`tvcm:${action}:${channelId}`).setTitle(action === "rename" ? "Rename your channel" : "Set a player limit").addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        return void (await interaction.showModal(modal));
      }
      if (action === "lock") {
        const everyone = interaction.guild!.roles.everyone.id;
        const locked = channel.permissionOverwrites.cache.get(everyone)?.deny.has("Connect");
        if (locked) {
          await channel.lockPermissions();
          return void (await interaction.reply({ content: "🔓 Unlocked. Anyone who can see it can join.", ephemeral: true }));
        }
        // Role allows beat an @everyone deny, so every role that can join is closed off,
        // and the people already inside get their own pass.
        for (const o of channel.permissionOverwrites.cache.values()) {
          if (o.type === OverwriteType.Role && (o.allow.has("Connect") || o.id === everyone)) await channel.permissionOverwrites.edit(o.id, { Connect: false });
        }
        if (!channel.permissionOverwrites.cache.has(everyone)) await channel.permissionOverwrites.edit(everyone, { Connect: false });
        for (const member of channel.members.values()) await channel.permissionOverwrites.edit(member.id, { Connect: true });
        return void (await interaction.reply({ content: "🔒 Locked. Only the people inside now can join.", ephemeral: true }));
      }
    }

    if (prefix === "tvcm" && interaction.isModalSubmit()) {
      const value = interaction.fields.getTextInputValue("value").trim();
      if (action === "rename") {
        if (!value) return void (await interaction.reply({ content: "The name can't be empty.", ephemeral: true }));
        await channel.setName(value.slice(0, 90));
        return void (await interaction.reply({ content: `✏️ Renamed to **${value.slice(0, 90)}**. Discord allows 2 renames every 10 minutes.`, ephemeral: true }));
      }
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 0 || limit > 99) return void (await interaction.reply({ content: "Pick a number from 0 to 99.", ephemeral: true }));
      await channel.setUserLimit(limit);
      return void (await interaction.reply({ content: limit ? `👥 Limit set to ${limit}.` : "👥 No limit.", ephemeral: true }));
    }
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    if (!interaction.replied) await interaction.reply({ content: "That didn't work. Spartacus may need Manage Channels here.", ephemeral: true }).catch(() => null);
  }
}
