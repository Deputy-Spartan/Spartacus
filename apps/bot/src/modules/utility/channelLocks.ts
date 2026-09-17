import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Events, Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import { buildStickyPayload } from "../../lib/stickyRender";
import { resolveSavedEmbed } from "../../lib/savedEmbedRender";
import type { ChannelLock } from "@spartacus/db";

export const name = Events.MessageCreate;

const URL_PATTERN = /https?:\/\//i;

function shouldDelete(message: Message, lock: {
  allowImages: boolean;
  allowLinks: boolean;
  allowFiles: boolean;
  allowMessages: boolean;
  slashCommandsOnly: boolean;
  requiredPrefixes: unknown;
  bannedWords: unknown;
}): boolean {
  const content = message.content;
  const hasImage = message.attachments.some((a) => (a.contentType ?? "").startsWith("image/"));
  const hasFile = message.attachments.some((a) => !(a.contentType ?? "").startsWith("image/"));
  const hasLink = URL_PATTERN.test(content);
  const hasText = content.trim().length > 0;

  const bannedWords = Array.isArray(lock.bannedWords) ? (lock.bannedWords as string[]) : [];
  if (bannedWords.some((w) => content.toLowerCase().includes(w.toLowerCase()))) return true;

  // A channel locked to slash commands only rejects every regular message
  // outright — interactions never fire messageCreate, so this can't
  // accidentally catch legitimate command usage.
  if (lock.slashCommandsOnly) return true;

  if (hasImage && !lock.allowImages) return true;
  if (hasFile && !lock.allowFiles) return true;
  if (hasLink && !lock.allowLinks) return true;

  if (hasText) {
    const prefixes = Array.isArray(lock.requiredPrefixes) ? (lock.requiredPrefixes as string[]) : [];
    if (prefixes.length > 0) {
      if (!prefixes.some((p) => content.startsWith(p))) return true;
    } else if (!lock.allowMessages) {
      return true;
    }
  }

  return false;
}

// Builds the actual notice content — shared by the in-channel/DM paths
// (which have the real deleted Message to pull {user}/{channel} from) and
// the ephemeral reveal (which only has a channelId + userId from a button
// click, no Message).
async function buildNotifyPayload(lock: ChannelLock, authorMention: string, channelId: string) {
  const content = (lock.notifyContent || "{user}, that message isn't allowed in {channel}.")
    .replace(/{user}/g, authorMention)
    .replace(/{channel}/g, `<#${channelId}>`);

  // A saved embed overrides the whole notice (same rule as Welcome, Sticky
  // Messages, etc.) — it's static content from the shared library, so the
  // {user}/{channel} tokens above only apply to the non-saved path.
  const savedEmbed = await resolveSavedEmbed(lock.savedEmbedId);

  return buildStickyPayload(
    {
      content,
      embedEnabled: lock.notifyEmbedEnabled,
      embedTitle: lock.notifyEmbedTitle,
      embedDescription: content,
      embedColor: lock.notifyEmbedColor,
      buttons: lock.notifyButtons,
    },
    { savedEmbed, guildId: lock.guildId }
  );
}

export async function execute(message: Message) {
  if (message.author.bot || !message.guildId) return;

  const enabled = await isModuleEnabled(message.guildId, "CHANNEL_LOCKS");
  if (!enabled) return;

  const lock = await prisma.channelLock.findUnique({ where: { channelId: message.channelId } });
  if (!lock) return;

  if (!shouldDelete(message, lock)) return;

  await message.delete().catch(() => null);
  if (!lock.notifyEnabled) return;

  // Ephemeral: nothing revealing goes in the channel — just a small
  // "click to see why" prompt whose button reply is ephemeral (Discord's
  // real ephemeral mechanism, only reachable via an interaction), scoped to
  // the author via the button's customId.
  if (lock.notifyEphemeral) {
    if (isSendableChannel(message.channel)) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`channellockreveal:${lock.id}:${message.author.id}`).setLabel("Why was this removed?").setStyle(ButtonStyle.Secondary)
      );
      const sent = await message.channel
        .send({ content: `${message.author}, your message was removed.`, components: [row] })
        .catch(() => null);
      if (sent && lock.notifyDeleteAfterSec > 0) {
        setTimeout(() => sent.delete().catch(() => null), lock.notifyDeleteAfterSec * 1000);
      }
    }
    return;
  }

  const payload = await buildNotifyPayload(lock, `${message.author}`, message.channelId);

  // notifyHidden is the closest real equivalent to "ephemeral" for a plain
  // message when nothing above already covers it — send it as a DM instead
  // of posting in-channel, so nobody but the author sees it.
  if (lock.notifyHidden) {
    const sent = await message.author.send(payload).catch(() => null); // silently drop if the member has DMs closed
    if (sent && lock.notifyDeleteAfterSec > 0) {
      setTimeout(() => sent.delete().catch(() => null), lock.notifyDeleteAfterSec * 1000);
    }
    return;
  }

  if (isSendableChannel(message.channel)) {
    const sent = await message.channel.send(payload).catch(() => null);
    if (sent && lock.notifyDeleteAfterSec > 0) {
      setTimeout(() => sent.delete().catch(() => null), lock.notifyDeleteAfterSec * 1000);
    }
  }

  if (lock.dmUser) {
    await message.author.send(payload).catch(() => null); // silently drop if the member has DMs closed
  }
}

// The "Why was this removed?" button — only the member the notice is about
// can reveal it; anyone else clicking gets their own small ephemeral
// "not for you" instead of the real content.
export async function handleChannelLockReveal(interaction: ButtonInteraction, lockId: string, authorId: string) {
  if (interaction.user.id !== authorId) {
    await interaction.reply({ content: "This notice isn't for you.", ephemeral: true });
    return;
  }

  const lock = await prisma.channelLock.findUnique({ where: { id: lockId } });
  if (!lock) {
    await interaction.reply({ content: "This channel lock no longer exists.", ephemeral: true });
    return;
  }

  const payload = await buildNotifyPayload(lock, `<@${authorId}>`, interaction.channelId);
  await interaction.reply({ ...payload, ephemeral: true });
}
