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

// Both remaining bar styles are plain characters — Discord can't color
// plain text, so barColor/barColorSecondary only affect the dashboard's own
// preview (called out in the dashboard UI), never the live message.
function barChars(poll: Poll): [string, string] {
  return poll.barStyle === "SOLID" ? ["█", "░"] : ["▰", "▱"];
}

// Shared by both add/remove — redraws the embed from the current vote
// tally. Private polls keep their bars hatched/locked right up until
// pollCloser reveals the real numbers at close.
export async function renderPollEmbed(poll: Poll) {
  const votes = await prisma.pollVote.findMany({ where: { pollId: poll.id } });
  const counts = poll.emojis.map((e) => votes.filter((v) => v.emoji === e).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const [filledChar, emptyChar] = barChars(poll);
  const barLen = 20;

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
  if (poll.allowLockIn && !poll.closed) statusLine += " · Click 🔒 Lock In once you're done to make your answer final";

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

async function isLockedIn(pollId: string, userId: string): Promise<boolean> {
  const submission = await prisma.pollSubmission.findUnique({ where: { pollId_userId: { pollId, userId } } });
  return !!submission;
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

// allowMultiselect=false: reacting is the member's one answer — any other
// reaction they're already holding on this poll gets removed (both the DB
// row and their actual reaction on the message), and any write-in they'd
// submitted is cleared too, so switching answers never leaves more than one
// counted. allowMultiselect=true: reactions just stack, no removal.
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

  if (await isLockedIn(poll.id, user.id)) {
    await reaction.users.remove(user.id).catch(() => null);
    return;
  }

  if (!poll.allowMultiselect) {
    const existingVotes = await prisma.pollVote.findMany({ where: { pollId: poll.id, userId: user.id } });
    for (const vote of existingVotes) {
      if (vote.emoji === key) continue;
      const oldReaction = reaction.message.reactions?.cache?.get(vote.emoji);
      await oldReaction?.users.remove(user.id).catch(() => null);
      await prisma.pollVote.delete({ where: { id: vote.id } }).catch(() => null);
    }
    await prisma.pollWriteIn.deleteMany({ where: { pollId: poll.id, userId: user.id } });
  }

  await prisma.pollVote.upsert({
    where: { pollId_userId_emoji: { pollId: poll.id, userId: user.id, emoji: key } },
    create: { pollId: poll.id, userId: user.id, emoji: key },
    update: {},
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

  // Locked in: un-reacting doesn't undo the vote — it stays counted.
  if (await isLockedIn(poll.id, user.id)) return;

  await prisma.pollVote.deleteMany({ where: { pollId: poll.id, userId: user.id, emoji: key } });

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
  if (await isLockedIn(pollId, interaction.user.id)) {
    await interaction.reply({ content: "🔒 You've already locked in your answer(s) for this poll.", ephemeral: true });
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

// allowMultiselect=false: a write-in replaces whatever the member had
// already picked — their standing reactions get removed (DB rows and the
// actual reactions on the message) and any earlier write-in is cleared —
// same "one answer, switching replaces it" rule as reacting does above.
export async function handleWriteInModalSubmit(interaction: ModalSubmitInteraction, pollId: string) {
  const poll = await prisma.poll.findUnique({ where: { id: pollId } });
  if (!poll || poll.closed) {
    await interaction.reply({ content: "This poll isn't accepting answers anymore.", ephemeral: true });
    return;
  }
  if (await isLockedIn(pollId, interaction.user.id)) {
    await interaction.reply({ content: "🔒 You've already locked in your answer(s) for this poll.", ephemeral: true });
    return;
  }

  if (!poll.allowMultiselect) {
    const existingVotes = await prisma.pollVote.findMany({ where: { pollId, userId: interaction.user.id } });
    for (const vote of existingVotes) {
      const oldReaction = interaction.message?.reactions.cache.get(vote.emoji);
      await oldReaction?.users.remove(interaction.user.id).catch(() => null);
    }
    if (existingVotes.length) await prisma.pollVote.deleteMany({ where: { pollId, userId: interaction.user.id } });
    await prisma.pollWriteIn.deleteMany({ where: { pollId, userId: interaction.user.id } });
  }

  const text = interaction.fields.getTextInputValue("answer").trim();
  await prisma.pollWriteIn.create({ data: { pollId, userId: interaction.user.id, text: text.slice(0, 1000) } });

  if (interaction.message) {
    const embed = await renderPollEmbed(poll);
    await interaction.message.edit({ embeds: [embed] }).catch(() => null);
  }

  await interaction.reply({ content: `✅ Got it — your answer for **${poll.question}** has been recorded.`, ephemeral: true });
}

// "🔒 Lock In" button — makes the member's current reaction(s)/write-in
// final. Requires at least one answer already on record; after this,
// onReactionAdd/onReactionRemove/handleWriteInButton/handleWriteInModalSubmit
// all check isLockedIn() and refuse to change anything further for them.
export async function handleLockInButton(interaction: ButtonInteraction, pollId: string) {
  const poll = await prisma.poll.findUnique({ where: { id: pollId } });
  if (!poll || poll.closed) {
    await interaction.reply({ content: "This poll isn't accepting answers anymore.", ephemeral: true });
    return;
  }
  if (await isLockedIn(pollId, interaction.user.id)) {
    await interaction.reply({ content: "🔒 You've already locked in your answer(s) for this poll.", ephemeral: true });
    return;
  }

  const [hasVote, hasWriteIn] = await Promise.all([
    prisma.pollVote.findFirst({ where: { pollId, userId: interaction.user.id } }),
    prisma.pollWriteIn.findFirst({ where: { pollId, userId: interaction.user.id } }),
  ]);
  if (!hasVote && !hasWriteIn) {
    await interaction.reply({ content: "React to an option (or submit a write-in) before locking in.", ephemeral: true });
    return;
  }

  await prisma.pollSubmission.create({ data: { pollId, userId: interaction.user.id } });
  await interaction.reply({ content: "🔒 Your answer(s) are locked in and can't be changed.", ephemeral: true });
}
