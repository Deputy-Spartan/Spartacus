import { Events, type Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { showBumpStage } from "../../lib/bumpStatus";

export const name = Events.MessageCreate;

// Disboard's own application user id — stable across all servers, not
// something that needs configuring per guild.
const DISBOARD_BOT_ID = "302050872383242240";
export const COOLDOWN_MS = 2 * 60 * 60 * 1000; // Disboard's own bump cooldown

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

  // Who ran /bump, from the slash command the reply belongs to.
  const bumper = message.interactionMetadata?.user?.id ?? null;
  const now = new Date();
  // A new bump starts a fresh cooldown and clears any missed-bump alerts.
  const data = { nextReminderAt: new Date(now.getTime() + COOLDOWN_MS), reminded: false, lastBumpAt: now, lastBumpedById: bumper, missedAlerts: 0 };
  await prisma.bumpReminderSettings.upsert({
    where: { guildId: message.guildId },
    create: { guildId: message.guildId, ...data, bumpCount: 1 },
    update: { ...data, bumpCount: { increment: 1 } },
  });
  // Swap the reminder for the "Bump done" message under Disboard's reply.
  await showBumpStage(message.client, message.guildId, "bumped", { ping: false }).catch(() => null);
}
