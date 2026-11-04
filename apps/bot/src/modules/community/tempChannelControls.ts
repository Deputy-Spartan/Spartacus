import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  OverwriteType,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type VoiceChannel,
} from "discord.js";
import { logError } from "@spartacus/db";
import { cleanTempGameChoices, fillTempName, type TempGameChoice } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";

// The Lock, Rename and Limit buttons posted in a squad channel's own chat,
// with a "What are you playing?" menu when the lobby lists games.
// Only the person who made the channel can use them.
export function tempChannelControls(channelId: string, games: TempGameChoice[] = [], ownerId?: string) {
  const menu = games.length
    ? [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`tvc:game:${channelId}`)
            .setPlaceholder("🎮 What are you playing? Pick a game to name your channel")
            .addOptions(
              ...games.map((g, i) => ({ label: `${g.emoji ? g.emoji + " " : ""}${g.label}`.slice(0, 100), value: String(i), description: g.userLimit ? `${g.userLimit}-player limit` : undefined })),
              { label: "✏️ Custom name", value: "custom", description: "Type your own channel name" },
            ),
        ),
      ]
    : [];
  return {
    content: games.length
      ? `${ownerId ? `<@${ownerId}> ` : ""}🔊 This is your squad channel. Pick what you're playing to name it. It's deleted when everyone leaves.`
      : "🔊 This is your squad channel. It's deleted when everyone leaves.",
    allowedMentions: { users: ownerId ? [ownerId] : [] },
    components: [
      ...menu,
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`tvc:lock:${channelId}`).setLabel("Lock / Unlock").setEmoji("🔒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tvc:rename:${channelId}`).setLabel("Rename").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tvc:limit:${channelId}`).setLabel("Limit").setEmoji("👥").setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// Discord allows 2 renames per channel every 10 minutes and holds any more
// until the window opens, so stop waiting after a few seconds and say so.
// Returns true when renamed, false when it failed, null when Discord is holding it.
async function editSoon(channel: VoiceChannel, data: { name: string; userLimit?: number }): Promise<boolean | null> {
  const done = channel.edit(data).then(() => true, () => false);
  return Promise.race([done, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
}
const HELD = "Discord allows 2 renames every 10 minutes, so it will change once that opens up.";

// The lowest free number for {index}, so two R6 squads are 1 and 2, not 2 and 2.
function nextName(channel: VoiceChannel, format: string, user: string): string {
  const taken = new Set(channel.guild.channels.cache.filter((c) => c.id !== channel.id && c.parentId === channel.parentId).map((c) => c.name.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = fillTempName(format, { user, index: n, guild: channel.guild.name });
    if (!/{index}|{count}/.test(format) || !taken.has(name.toLowerCase()) || n >= 99) return name;
  }
}

async function ownedChannel(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction, channelId: string): Promise<VoiceChannel | string> {
  const instance = await prisma.tempChannelInstance.findFirst({ where: { channelId } });
  if (!instance) return "This squad channel is gone.";
  if (instance.ownerId !== interaction.user.id) return "Only the person who made this channel can change it.";
  const channel = await interaction.guild?.channels.fetch(channelId).catch(() => null);
  return channel?.isVoiceBased() ? (channel as VoiceChannel) : "This squad channel is gone.";
}

function renameModal(channelId: string, current: string) {
  const input = new TextInputBuilder().setCustomId("value").setLabel("New name").setStyle(TextInputStyle.Short).setMaxLength(90).setValue(current.slice(0, 90));
  return new ModalBuilder().setCustomId(`tvcm:rename:${channelId}`).setTitle("Rename your channel").addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

export async function handleTempChannelControl(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction) {
  const [prefix, action, channelId] = interaction.customId.split(":");
  try {
    const channel = await ownedChannel(interaction, channelId);
    if (typeof channel === "string") return void (await interaction.reply({ content: channel, ephemeral: true }));

    if (prefix === "tvc" && action === "game" && interaction.isStringSelectMenu()) {
      const pick = interaction.values[0];
      if (pick === "custom") return void (await interaction.showModal(renameModal(channelId, channel.name)));
      const instance = await prisma.tempChannelInstance.findFirst({ where: { channelId } });
      const lobby = instance && (await prisma.tempChannelLobby.findUnique({ where: { id: instance.lobbyId } }));
      const game = cleanTempGameChoices(lobby?.gameChoices)[Number(pick)];
      if (!game) return void (await interaction.reply({ content: "That game was removed. Pick another one.", ephemeral: true }));
      await interaction.deferReply({ ephemeral: true });
      const member = await interaction.guild!.members.fetch(interaction.user.id).catch(() => null);
      const name = nextName(channel, game.nameFormat, member?.displayName ?? interaction.user.username);
      const done = await editSoon(channel, { name, ...(game.userLimit ? { userLimit: game.userLimit } : {}) });
      const limit = game.userLimit ? ` with a ${game.userLimit}-player limit` : "";
      if (done === false) return void (await interaction.editReply("That didn't work. Spartacus may need Manage Channels here."));
      return void (await interaction.editReply(done ? `🎮 Your channel is now **${name}**${limit}.` : `🎮 Your channel will be **${name}**${limit}. ${HELD}`));
    }

    if (prefix === "tvc" && interaction.isButton()) {
      if (action === "rename") return void (await interaction.showModal(renameModal(channelId, channel.name)));
      if (action === "limit") {
        const input = new TextInputBuilder().setCustomId("value").setLabel("Player limit (0 for none, up to 99)").setStyle(TextInputStyle.Short).setMaxLength(2).setValue(String(channel.userLimit));
        const modal = new ModalBuilder().setCustomId(`tvcm:limit:${channelId}`).setTitle("Set a player limit").addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
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
        await interaction.deferReply({ ephemeral: true });
        const done = await editSoon(channel, { name: value.slice(0, 90) });
        if (done === false) return void (await interaction.editReply("That didn't work. Spartacus may need Manage Channels here."));
        return void (await interaction.editReply(done ? `✏️ Renamed to **${value.slice(0, 90)}**. Discord allows 2 renames every 10 minutes.` : `✏️ It will be **${value.slice(0, 90)}**. ${HELD}`));
      }
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 0 || limit > 99) return void (await interaction.reply({ content: "Pick a number from 0 to 99.", ephemeral: true }));
      await channel.setUserLimit(limit);
      return void (await interaction.reply({ content: limit ? `👥 Limit set to ${limit}.` : "👥 No limit.", ephemeral: true }));
    }
  } catch (err) {
    logError("bot", err, interaction.guildId ?? undefined);
    if (interaction.deferred) await interaction.editReply("That didn't work. Spartacus may need Manage Channels here.").catch(() => null);
    else if (!interaction.replied) await interaction.reply({ content: "That didn't work. Spartacus may need Manage Channels here.", ephemeral: true }).catch(() => null);
  }
}
