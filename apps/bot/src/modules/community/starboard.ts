import { EmbedBuilder, Events, MessageReaction, PartialMessageReaction, User, PartialUser } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";

export const name = Events.MessageReactionAdd;

export async function execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  if (user.bot || reaction.emoji.name !== "⭐" || !reaction.message.guildId) return;

  const guildId = reaction.message.guildId;
  const enabled = await isModuleEnabled(guildId, "STARBOARD");
  if (!enabled) return;

  const config = await prisma.starboardConfig.findUnique({ where: { guildId } });
  if (!config?.channelId) return;

  const full = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
  if (!full || (full.count ?? 0) < config.threshold) return;

  const message = full.message.partial ? await full.message.fetch().catch(() => null) : full.message;
  if (!message) return;

  const existing = await prisma.starredMessage.findUnique({
    where: { guildId_originalMessageId: { guildId, originalMessageId: message.id } },
  });

  const channel = (await message.guild?.channels.fetch(config.channelId).catch(() => null)) ?? null;
  if (!isSendableChannel(channel)) return;

  const embed = new EmbedBuilder()
    .setColor(0xfbbf24)
    .setAuthor({ name: message.author?.tag ?? "Unknown", iconURL: message.author?.displayAvatarURL() })
    .setDescription(message.content || "*(no text content)*")
    .addFields({ name: "Source", value: `[Jump to message](${message.url})` })
    .setFooter({ text: `⭐ ${full.count} · #${(message.channel as any).name ?? "channel"}` })
    .setTimestamp(message.createdAt);

  if (existing?.starboardMessageId) {
    const boardMsg = await channel.messages.fetch(existing.starboardMessageId).catch(() => null);
    await boardMsg?.edit({ embeds: [embed] }).catch(() => null);
    await prisma.starredMessage.update({ where: { id: existing.id }, data: { starCount: full.count ?? 0 } });
  } else {
    const posted = await channel.send({ embeds: [embed] }).catch(() => null);
    if (posted) {
      await prisma.starredMessage.create({
        data: {
          guildId,
          originalMessageId: message.id,
          starboardMessageId: posted.id,
          starCount: full.count ?? 0,
        },
      });
    }
  }
}
