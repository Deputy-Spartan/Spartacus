import {
  ActionRowBuilder,
  ButtonInteraction,
  Events,
  MessageReaction,
  ModalBuilder,
  ModalSubmitInteraction,
  PartialMessageReaction,
  TextInputBuilder,
  TextInputStyle,
  User,
  PartialUser,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import type { Poll } from "@spartacus/db";

export const addName = Events.MessageReactionAdd;
export const removeName = Events.MessageReactionRemove;

function emojiKey(reaction: MessageReaction | PartialMessageReaction): string {
  return reaction.emoji.id ?? reaction.emoji.name ?? "";
}

// Shared by both add/remove — redraws the embed from the current vote
// tally. Private polls keep their bars hatched/locked right up until
// pollCloser reveals the real numbers at close.
export async function renderPollEmbed(poll: Poll) {
  const votes = await prisma.pollVote.findMany({ where: { pollId: poll.id } });
  const counts = poll.emojis.map((e) => votes.filter((v) => v.emoji === e).length);
  const total = counts.reduce((a, b) => a + b, 0);

  const lines = poll.options.map((opt, i) => {
    const emoji = poll.emojis[i];
    if (poll.isPrivate && !poll.closed) {
      return `${emoji} **${opt}** — 🔒 hidden until the poll closes`;
    }
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    const barLen = 14;
    const filled = total ? Math.round((pct / 100) * barLen) : 0;
    const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
    return `${emoji} **${opt}** — ${counts[i]} vote${counts[i] === 1 ? "" : "s"} (${pct}%)\n\`${bar}\``;
  });

  const footerParts: string[] = [];
  if (poll.isPrivate && !poll.closed) footerParts.push("🔒 Results hidden — reaction counts on this message are still visible to anyone, as usual on Discord");
  if (poll.closed) footerParts.push(`Closed${poll.closedAt ? ` <t:${Math.floor(poll.closedAt.getTime() / 1000)}:R>` : ""} — final results`);
  else if (poll.durationMode === "TIMER" && poll.endsAt) footerParts.push(`Ends <t:${Math.floor(poll.endsAt.getTime() / 1000)}:R>`);
  else footerParts.push("Open until a staff member stops it");
  footerParts.push(`${total} vote${total === 1 ? "" : "s"} total`);
  if (poll.allowWriteIn && !poll.closed) footerParts.push("Click ✍️ Write In below to submit your own answer");

  return new EmbedBuilder()
    .setColor((poll.color as `#${string}`) || "#00E5FF")
    .setTitle(`🗳️ ${poll.question}`)
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: footerParts.join(" · ") });
}

async function findPoll(reaction: MessageReaction | PartialMessageReaction): Promise<Poll | null> {
  if (!reaction.message.id) return null;
  return prisma.poll.findFirst({ where: { messageId: reaction.message.id } });
}

// One vote per member: reacting with a different emoji on the same poll
// swaps their vote and the bot removes their old reaction so the message
// itself never shows someone double-counted across options.
export async function onReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  if (user.bot || !reaction.message.guildId) return;
  if (!(await isModuleEnabled(reaction.message.guildId, "POLLS"))) return;

  const poll = await findPoll(reaction);
  if (!poll) return;
  const key = emojiKey(reaction);
  if (!poll.emojis.includes(key)) return;

  if (poll.closed) {
    await reaction.users.remove(user.id).catch(() => null);
    return;
  }

  const existing = await prisma.pollVote.findUnique({ where: { pollId_userId: { pollId: poll.id, userId: user.id } } });
  if (existing && existing.emoji !== key) {
    const oldReaction = reaction.message.reactions?.cache?.get(existing.emoji);
    await oldReaction?.users.remove(user.id).catch(() => null);
  }

  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId: poll.id, userId: user.id } },
    create: { pollId: poll.id, userId: user.id, emoji: key },
    update: { emoji: key },
  });

  const embed = await renderPollEmbed(poll);
  await reaction.message.edit({ embeds: [embed] }).catch(() => null);
}

export async function onReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
  if (user.bot || !reaction.message.guildId) return;
  if (!(await isModuleEnabled(reaction.message.guildId, "POLLS"))) return;

  const poll = await findPoll(reaction);
  if (!poll || poll.closed) return;
  const key = emojiKey(reaction);
  if (!poll.emojis.includes(key)) return;

  const existing = await prisma.pollVote.findUnique({ where: { pollId_userId: { pollId: poll.id, userId: user.id } } });
  if (!existing || existing.emoji !== key) return; // they un-reacted the one that got replaced, not their current vote

  await prisma.pollVote.delete({ where: { pollId_userId: { pollId: poll.id, userId: user.id } } }).catch(() => null);

  const embed = await renderPollEmbed(poll);
  await reaction.message.edit({ embeds: [embed] }).catch(() => null);
}

// "✍️ Write In" button on the poll message — opens a modal right in the
// channel instead of DMing the member, so it can never collide with
// Support DM/Modmail/Applications (every DM-driven module listens on
// every DM; a modal only opens from this one specific interaction).
export async function handleWriteInButton(interaction: ButtonInteraction, pollId: string) {
  const poll = await prisma.poll.findUnique({ where: { id: pollId } });
  if (!poll || poll.closed) {
    await interaction.reply({ content: "This poll isn't accepting answers anymore.", ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`pollwritein:${pollId}`)
    .setTitle(poll.question.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("answer").setLabel("Your answer").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
      )
    );
  await interaction.showModal(modal);
}

export async function handleWriteInModalSubmit(interaction: ModalSubmitInteraction, pollId: string) {
  const poll = await prisma.poll.findUnique({ where: { id: pollId } });
  if (!poll || poll.closed) {
    await interaction.reply({ content: "This poll isn't accepting answers anymore.", ephemeral: true });
    return;
  }

  const text = interaction.fields.getTextInputValue("answer").trim();
  await prisma.pollWriteIn.create({ data: { pollId, userId: interaction.user.id, text: text.slice(0, 1000) } });
  await interaction.reply({ content: `✅ Got it — your answer for **${poll.question}** has been recorded.`, ephemeral: true });
}
