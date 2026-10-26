import {
  ActionRowBuilder,
  ButtonInteraction,
  Events,
  Message,
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

// Discord has no real progress-bar rendering in an embed, and monospace
// block characters (the old `████░░░░` approach) render as an illegible
// grey code pill on most clients. These are the emoji choices SQUARE/CIRCLE
// snap to for both the primary (filled) and secondary (empty) color —
// includes white/black so a plain light/dark secondary still matches sensibly.
const COLOR_SQUARES: Array<{ emoji: string; rgb: [number, number, number] }> = [
  { emoji: "🟥", rgb: [221, 46, 68] },
  { emoji: "🟧", rgb: [240, 138, 55] },
  { emoji: "🟨", rgb: [253, 203, 88] },
  { emoji: "🟩", rgb: [120, 177, 89] },
  { emoji: "🟦", rgb: [85, 172, 238] },
  { emoji: "🟪", rgb: [170, 142, 214] },
  { emoji: "🟫", rgb: [168, 120, 74] },
  { emoji: "⬜", rgb: [255, 255, 255] },
  { emoji: "⬛", rgb: [49, 51, 56] },
];
const COLOR_CIRCLES: Array<{ emoji: string; rgb: [number, number, number] }> = [
  { emoji: "🔴", rgb: [221, 46, 68] },
  { emoji: "🟠", rgb: [240, 138, 55] },
  { emoji: "🟡", rgb: [253, 203, 88] },
  { emoji: "🟢", rgb: [120, 177, 89] },
  { emoji: "🔵", rgb: [85, 172, 238] },
  { emoji: "🟣", rgb: [170, 142, 214] },
  { emoji: "🟤", rgb: [168, 120, 74] },
  { emoji: "⚪", rgb: [255, 255, 255] },
  { emoji: "⚫", rgb: [49, 51, 56] },
];

function nearestColorEmoji(hex: string | null | undefined, palette: Array<{ emoji: string; rgb: [number, number, number] }>, fallback: string): string {
  const match = (hex ?? "").match(/^#?([0-9a-f]{6})$/i);
  if (!match) return fallback;
  const n = parseInt(match[1], 16);
  const target: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best = palette[0];
  let bestDist = Infinity;
  for (const sq of palette) {
    const dist = sq.rgb.reduce((s, c, i) => s + (c - target[i]) ** 2, 0);
    if (dist < bestDist) {
      bestDist = dist;
      best = sq;
    }
  }
  return best.emoji;
}

// Returns the [filled, empty] emoji/char pair for a bar style. SQUARE and
// CIRCLE snap BOTH colors to the nearest matching emoji on the live message
// itself; CLASSIC and SOLID stay plain ▰/▱ and █/░ there (Discord can't
// color plain text) — their primary/secondary colors only affect the
// dashboard's own preview, which is called out in the dashboard UI.
function barChars(poll: Poll): [string, string] {
  switch (poll.barStyle) {
    case "CIRCLE":
      return [
        nearestColorEmoji(poll.barColor ?? poll.color, COLOR_CIRCLES, "🔵"),
        nearestColorEmoji(poll.barColorSecondary, COLOR_CIRCLES, "⚪"),
      ];
    case "CLASSIC":
      return ["▰", "▱"];
    case "SOLID":
      return ["█", "░"];
    case "SQUARE":
    default:
      return [
        nearestColorEmoji(poll.barColor ?? poll.color, COLOR_SQUARES, "🟦"),
        nearestColorEmoji(poll.barColorSecondary, COLOR_SQUARES, "⬜"),
      ];
  }
}

// Shared by both add/remove — redraws the embed from the current vote
// tally. Private polls keep their bars hatched/locked right up until
// pollCloser reveals the real numbers at close.
export async function renderPollEmbed(poll: Poll) {
  const votes = await prisma.pollVote.findMany({ where: { pollId: poll.id } });
  const counts = poll.emojis.map((e) => votes.filter((v) => v.emoji === e).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const [filledChar, emptyChar] = barChars(poll);
  // Narrow characters (solid blocks, the classic bar) read better with more
  // segments; wide emoji squares/circles get cramped past ten.
  const barLen = poll.barStyle === "SOLID" || poll.barStyle === "CLASSIC" ? 20 : 10;

  const lines = poll.options.map((opt, i) => {
    const emoji = poll.emojis[i];

    // SIMPLE just lists the options — no bar, no inline count — the way
    // Dyno's default poll looks; votes are only visible via the reactions
    // themselves underneath the message.
    if (poll.resultsStyle === "SIMPLE") {
      return `${emoji} **${opt}**`;
    }

    if (poll.isPrivate && !poll.closed) {
      return `${emoji} **${opt}**\n${emptyChar.repeat(barLen)} · 🔒 hidden`;
    }
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    const filled = total ? Math.round((pct / 100) * barLen) : 0;
    const bar = filledChar.repeat(filled) + emptyChar.repeat(barLen - filled);
    return `${emoji} **${opt}** — ${counts[i]} vote${counts[i] === 1 ? "" : "s"} (${pct}%)\n${bar}`;
  });

  // Timestamps (<t:...>) and bold text only render inside the description
  // and fields — an embed FOOTER is plain text only, so the old "Ends
  // <t:...:R>" line there just showed the raw markup, never a live
  // countdown. This status line lives in the description instead.
  let statusLine: string;
  if (poll.isPrivate && !poll.closed) statusLine = "🔒 Results hidden — reaction counts on this message are still visible to anyone, as usual on Discord";
  else if (poll.closed) statusLine = `Closed${poll.closedAt ? ` <t:${Math.floor(poll.closedAt.getTime() / 1000)}:R>` : ""} — final results`;
  else if (poll.durationMode === "TIMER" && poll.endsAt) statusLine = `⏱️ Ends <t:${Math.floor(poll.endsAt.getTime() / 1000)}:R>`;
  else statusLine = "🖐 Open until a staff member stops it";
  if (poll.allowWriteIn && !poll.closed) statusLine += " · Click ✍️ Write In below to submit your own answer";

  const footerText = `${total} vote${total === 1 ? "" : "s"} total`;

  return new EmbedBuilder()
    .setColor((poll.color as `#${string}`) || "#00E5FF")
    .setTitle(`🗳️ ${poll.question}`)
    .setDescription([lines.join("\n\n"), statusLine].join("\n\n"))
    .setFooter({ text: footerText });
}

async function findPoll(reaction: MessageReaction | PartialMessageReaction): Promise<Poll | null> {
  if (!reaction.message.id) return null;
  return prisma.poll.findFirst({ where: { messageId: reaction.message.id } });
}

// Posted as a reply right under the poll the moment it closes (timer or
// manual) — the embed above already shows the final results, this just
// makes the "voting's over" moment visible in the channel itself instead
// of only showing up if someone happens to re-read the embed's footer.
export async function announcePollClosed(message: Message) {
  await message
    .reply("🔒 **This poll has ended — voting is now closed.** No more votes or option changes will be counted; see the final results above.")
    .catch(() => null);
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
