import cron from "node-cron";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, type PollAnswerData } from "discord.js";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { renderPollEmbed } from "../modules/engagement/pollVotes";

// Picks up polls created via the dashboard (messageId still null) and
// posts them. CUSTOM polls get our own embed + reactions, with vote
// tracking in modules/engagement/pollVotes.ts matched by messageId. NATIVE
// polls use Discord's own built-in poll object — Discord tracks the votes
// itself; we just mirror them into PollVote via the messagePollVoteAdd/
// Remove events (also wired in pollVotes.ts) so the dashboard's results
// list works the same way for both types.
export function startPollPosterJob(client: Client) {
  cron.schedule("*/5 * * * * *", async () => {
    let loggedThisTick = 0;
    const pending = await prisma.poll.findMany({ where: { messageId: null, closed: false }, take: 20 });

    for (const poll of pending) {
      if (!(await isModuleEnabled(poll.guildId, "POLLS"))) continue;
      if (poll.options.length === 0 || poll.emojis.length !== poll.options.length) continue;

      const channel = await client.channels.fetch(poll.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      let message;
      if (poll.pollType === "NATIVE") {
        if (!poll.endsAt) continue; // native polls require a duration — the dashboard always sets one, but skip defensively
        const hours = Math.min(768, Math.max(1, Math.ceil((poll.endsAt.getTime() - Date.now()) / 3_600_000)));
        const answers: PollAnswerData[] = poll.options.map((label, i) => ({
          text: label.slice(0, 55),
          emoji: poll.emojis[i] || undefined,
        }));
        message = await channel
          .send({
            poll: {
              question: { text: poll.question.slice(0, 300) },
              answers,
              duration: hours,
              allowMultiselect: poll.allowMultiselect,
            },
          })
          .catch((err) => {
            if (loggedThisTick < 5) {
              logError("bot", err, poll.guildId);
              loggedThisTick++;
            }
            return null;
          });
      } else {
        const embed = await renderPollEmbed(poll);
        const components = poll.allowWriteIn
          ? [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`poll:writein:${poll.id}`).setLabel("✍️ Write In").setStyle(ButtonStyle.Secondary)
              ),
            ]
          : [];
        message = await channel.send({ embeds: [embed], components }).catch((err) => {
          if (loggedThisTick < 5) {
            logError("bot", err, poll.guildId);
            loggedThisTick++;
          }
          return null;
        });
        if (message) {
          for (const emoji of poll.emojis) {
            await message.react(emoji).catch(() => null);
          }
        }
      }
      if (!message) continue;

      await prisma.poll.update({ where: { id: poll.id }, data: { messageId: message.id } });
    }
  });
}
