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
import { SERVER_EMOJI, cleanTempGameChoices, type TempGameChoice } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { moveToGameCategory, nextTempName } from "./tempGameCategories";
import { tempGuideEmbed } from "./tempChannelGuide";

// A server emoji or a standard one goes in the option's emoji slot. Anything
// else stays in the label, since Discord refuses the whole message for a bad emoji.
export function menuOption(g: TempGameChoice, i: number) {
  const custom = g.emoji?.match(SERVER_EMOJI);
  const standard = !custom && g.emoji && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g.emoji) && g.emoji.length <= 16;
  const emoji = custom ? { id: custom[3], name: custom[2], animated: custom[1] === "a" } : standard ? { name: g.emoji! } : undefined;
  const label = emoji || !g.emoji ? g.label : `${g.emoji} ${g.label}`;
  return { label: label.slice(0, 100), value: String(i), emoji, description: g.userLimit ? `${g.userLimit}-player limit` : undefined };
}

// The Lock, Rename and Limit buttons posted in a squad channel's own chat,
// with a "What are you playing?" menu when the lobby lists games.
// Only the person who made the channel can use them.
// With `picked`, the game was already chosen on the panel, so there is no menu.
// With `thread`, the controls are in a private thread instead of the voice chat.
export function tempChannelControls(
  channelId: string,
  { games = [], ownerId, picked, guide = false, thread = false }: { games?: TempGameChoice[]; ownerId?: string; picked?: TempGameChoice; guide?: boolean; thread?: boolean } = {},
) {
  const menu = games.length
    ? [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`tvc:game:${channelId}`)
            .setPlaceholder("🎮 What are you playing? Pick a game to name your channel")
            .addOptions(
              ...games.map(menuOption),
              { label: "Custom name", value: "custom", emoji: { name: "✏️" }, description: "Type your own channel name" },
            ),
        ),
      ]
    : [];
  return {
    content: controlsText(channelId, games, ownerId, picked, thread),
    allowedMentions: { users: ownerId ? [ownerId] : [] },
    components: [
      ...menu,
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`tvc:lock:${channelId}`).setLabel("Lock / Unlock").setEmoji("🔒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tvc:rename:${channelId}`).setLabel("Rename").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tvc:limit:${channelId}`).setLabel("Limit").setEmoji("👥").setStyle(ButtonStyle.Secondary),
        ...(guide ? [new ButtonBuilder().setCustomId(`tvc:help:${channelId}`).setLabel("How it works").setEmoji("❓").setStyle(ButtonStyle.Secondary)] : []),
      ),
    ],
  };
}

function controlsText(channelId: string, games: TempGameChoice[], ownerId: string | undefined, picked: TempGameChoice | undefined, thread: boolean) {
  const what = picked ? `your **${picked.label}** squad channel` : "your squad channel";
  const intro = thread ? `🔊 These are the controls for ${what}, <#${channelId}>.` : `🔊 This is ${what}.`;
  const ask = !picked && games.length ? " Pick what you're playing to name it." : "";
  const ping = ownerId && (thread || picked || games.length) ? `<@${ownerId}> ` : "";
  return `${ping}${intro}${ask} It's deleted when everyone leaves.`;
}

// Discord allows 2 renames per channel every 10 minutes and holds any more
// until the window opens, so stop waiting after a few seconds and say so.
// Returns true when renamed, false when it failed, null when Discord is holding it.
async function editSoon(channel: VoiceChannel, data: { name: string; userLimit?: number }): Promise<boolean | null> {
  const done = channel.edit(data).then(() => true, () => false);
  return Promise.race([done, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
}
// Keeps a private controls thread named after its squad. Not awaited: Discord
// limits thread renames too, and the squad rename is what matters.
async function renameThread(channelId: string, interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction, name: string) {
  const instance = await prisma.tempChannelInstance.findFirst({ where: { channelId } });
  if (!instance?.controlsThreadId) return;
  const thread = await interaction.guild?.channels.fetch(instance.controlsThreadId).catch(() => null);
  if (thread?.isThread()) void thread.setName(`🔧 ${name}`.slice(0, 100)).catch(() => null);
}

const HELD = "Discord allows 2 renames every 10 minutes, so it will change once that opens up.";

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
    // Anyone in the channel can read the guide, not just its owner.
    if (prefix === "tvc" && action === "help") {
      const instance = await prisma.tempChannelInstance.findFirst({ where: { channelId } });
      const lobby = instance && (await prisma.tempChannelLobby.findUnique({ where: { id: instance.lobbyId } }));
      if (!lobby || !interaction.guild) return void (await interaction.reply({ content: "This squad channel is gone.", ephemeral: true }));
      return void (await interaction.reply({ embeds: [tempGuideEmbed(interaction.guild, lobby)], ephemeral: true }));
    }

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
      if (lobby?.gameCategories) await moveToGameCategory(channel, lobby, game, instance?.textChannelId);
      const member = await interaction.guild!.members.fetch(interaction.user.id).catch(() => null);
      const name = nextTempName(channel.guild, channel.parentId, game.nameFormat, member?.displayName ?? interaction.user.username, channel.id);
      const done = await editSoon(channel, { name, ...(game.userLimit ? { userLimit: game.userLimit } : {}) });
      if (done !== false) await renameThread(channelId, interaction, name);
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
        if (done !== false) await renameThread(channelId, interaction, value.slice(0, 90));
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
