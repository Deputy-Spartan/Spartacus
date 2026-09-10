import { Events, type Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";

export const name = Events.MessageCreate;

// Disboard's own application user id — stable across all servers, not
// something that needs configuring per guild.
const DISBOARD_BOT_ID = "302050872383242240";
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // Disboard's own bump cooldown

// Disboard replies to /bump with an embed whose description starts with
// "Bump done!" — that's the one signal a bump actually succeeded (as
// opposed to someone running /bump too early and getting a "please wait"
// reply instead, which must NOT start a new cooldown timer).
export async function execute(message: Message) {
  if (message.author.id !== DISBOARD_BOT_ID || !message.guildId) return;
  const enabled = await isModuleEnabled(message.guildId, "BUMP_REMINDER");
  if (!enabled) return;

  const description = message.embeds[0]?.description ?? "";
  if (!description.toLowerCase().includes("bump done")) return;

  await prisma.bumpReminderSettings.upsert({
    where: { guildId: message.guildId },
    create: { guildId: message.guildId, nextReminderAt: new Date(Date.now() + COOLDOWN_MS), reminded: false },
    update: { nextReminderAt: new Date(Date.now() + COOLDOWN_MS), reminded: false },
  });
}
