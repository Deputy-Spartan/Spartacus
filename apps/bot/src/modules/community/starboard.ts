import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";

export const name = Events.MessageReactionAdd;

const IMAGE = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i;

// Bigger star as the count climbs, like most starboards.
export function starEmoji(count: number) {
  if (count >= 20) return "✨";
  if (count >= 10) return "💫";
  if (count >= 5) return "🌟";
  return "⭐";
}

// The picture to show: an image attachment, then a sticker, then a link preview
// (Tenor and Giphy GIFs come through as embeds with a thumbnail).
function pickImage(message: Message): string | null {
  const att = message.attachments.find((a) => a.contentType?.startsWith("image/") || IMAGE.test(a.name ?? a.url));
  if (att) return att.url;
  const sticker = message.stickers.first();
  if (sticker && sticker.format !== 3) return sticker.url; // 3 = Lottie, which embeds can't show
  for (const e of message.embeds) {
    const url = e.image?.url ?? e.thumbnail?.url;
    if (url) return url;
  }
  return null;
}

export async function starboardPayload(message: Message, count: number) {
  const member = message.member ?? (await message.guild?.members.fetch(message.author.id).catch(() => null)) ?? null;
  const author = member?.displayName ?? message.author.displayName ?? message.author.username;
  const image = pickImage(message);

  // A message that is only a link to a GIF shows the GIF without the bare link.
  let text = message.content ?? "";
  if (image && message.embeds.some((e) => e.url && text.trim() === e.url)) text = "";
  if (!text) {
    const embedText = message.embeds.find((e) => e.description || e.title);
    if (embedText) text = [embedText.title ? `**${embedText.title}**` : "", embedText.description ?? ""].filter(Boolean).join("\n");
  }

  const embed = new EmbedBuilder()
    .setColor(0xfbbf24)
    .setAuthor({ name: author, iconURL: (member ?? message.author).displayAvatarURL() })
    .setTimestamp(message.createdAt);
  if (text) embed.setDescription(text.slice(0, 4096));
  if (image) embed.setImage(image);

  if (message.reference?.messageId) {
    const replied = await message.fetchReference().catch(() => null);
    if (replied) {
      const who = replied.member?.displayName ?? replied.author.displayName ?? replied.author.username;
      const snippet = (replied.content || (replied.attachments.size ? "📎 Attachment" : "Message")).replace(/\s+/g, " ").slice(0, 200);
      embed.addFields({ name: `↩️ Replying to ${who}`, value: `[${snippet}](${replied.url})` });
    }
  }

  const others = message.attachments.filter((a) => a.url !== image);
  if (others.size) {
    embed.addFields({ name: "📎 Attachments", value: others.map((a) => `[${a.name}](${a.url})`).join("\n").slice(0, 1024) });
  }
  if (!text && !image && !others.size) embed.setDescription("-# This message has nothing to show here. Jump to it to see it.");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Jump to message").setURL(message.url));
  return {
    content: `${starEmoji(count)} **${count}** · <#${message.channelId}>`,
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: [] as never[] },
  };
}

async function sync(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, added: boolean) {
  if (user.bot || reaction.emoji.name !== "⭐" || !reaction.message.guildId) return;
  const guildId = reaction.message.guildId;
  if (!(await isModuleEnabled(guildId, "STARBOARD"))) return;

  const config = await prisma.starboardConfig.findUnique({ where: { guildId } });
  if (!config?.channelId || reaction.message.channelId === config.channelId) return;

  const full = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
  if (!full) return;
  const count = full.count ?? 0;

  const existing = await prisma.starredMessage.findUnique({
    where: { guildId_originalMessageId: { guildId, originalMessageId: reaction.message.id } },
  });
  // Removing a star only updates a post that's already up; it never posts one.
  if (!existing && (!added || count < config.threshold)) return;

  const message = full.message.partial ? await full.message.fetch().catch(() => null) : full.message;
  if (!message) return;

  const channel = (await message.guild?.channels.fetch(config.channelId).catch(() => null)) ?? null;
  if (!isSendableChannel(channel)) return;

  const payload = await starboardPayload(message as Message, count);
  if (existing?.starboardMessageId) {
    const boardMsg = await channel.messages.fetch(existing.starboardMessageId).catch(() => null);
    await boardMsg?.edit(payload).catch(() => null);
    await prisma.starredMessage.update({ where: { id: existing.id }, data: { starCount: count } });
  } else {
    const posted = await channel.send(payload).catch(() => null);
    if (posted) {
      await prisma.starredMessage.create({
        data: { guildId, originalMessageId: message.id, starboardMessageId: posted.id, starCount: count },
      });
    }
  }
}

export async function execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  await sync(reaction, user, true);
}

export async function onReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  await sync(reaction, user, false);
}
