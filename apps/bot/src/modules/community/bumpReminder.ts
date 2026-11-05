import { Events, type ButtonInteraction, type Message, type PartialMessage } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { showBumpStage } from "../../lib/bumpStatus";

export const name = Events.MessageCreate;

// Disboard's own application user id — stable across all servers, not
// something that needs configuring per guild.
const DISBOARD_BOT_ID = "302050872383242240";
export const COOLDOWN_MS = 2 * 60 * 60 * 1000; // Disboard's own bump cooldown

// Each Disboard reply is counted once, whether it arrives as a new message or
// as an edit (when Disboard is slow it posts "thinking…" first, then edits
// that message into "Bump done!").
const seen = new Set<string>();

// Disboard replies to /bump with an embed whose description starts with
// "Bump done!" — that's the one signal a bump actually succeeded (as
// opposed to someone running /bump too early and getting a "please wait"
// reply instead, which must NOT start a new cooldown timer).
async function handleDisboard(message: Message) {
  if (message.author?.id !== DISBOARD_BOT_ID || !message.guildId || seen.has(message.id)) return;
  const text = message.embeds.map((e) => `${e.title ?? ""} ${e.description ?? ""}`).join(" ").toLowerCase();
  if (!text.includes("bump done")) return;
  if (!(await isModuleEnabled(message.guildId, "BUMP_REMINDER"))) return;
  seen.add(message.id);
  if (seen.size > 500) seen.delete(seen.values().next().value as string);

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

export async function execute(message: Message) {
  await handleDisboard(message);
}

export async function onUpdate(_old: Message | PartialMessage, message: Message | PartialMessage) {
  if (message.author && message.author.id !== DISBOARD_BOT_ID) return;
  const full = message.partial ? await message.fetch().catch(() => null) : message;
  if (full) await handleDisboard(full);
}

// The "DM me when it's ready" button on the bump message toggles you on the list.
export async function handleBumpButton(interaction: ButtonInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  await interaction.deferReply({ ephemeral: true });
  const row = await prisma.bumpReminderSettings.findUnique({ where: { guildId } });
  if (!row) return void (await interaction.editReply("The bump reminder isn't set up here."));
  const list = Array.isArray(row.dmUserIds) ? row.dmUserIds.filter((x): x is string => typeof x === "string") : [];
  const on = !list.includes(interaction.user.id);
  const next = on ? [...list, interaction.user.id].slice(-25) : list.filter((id) => id !== interaction.user.id);
  await prisma.bumpReminderSettings.update({ where: { guildId }, data: { dmUserIds: next } });
  if (!on) return void (await interaction.editReply("🔕 You won't get bump DMs anymore."));
  const test = await interaction.user.send({ content: `🔔 You'll get a DM here whenever **${interaction.guild?.name ?? "the server"}** can be bumped. Tap the button again to stop.` }).catch(() => null);
  await interaction.editReply(
    test
      ? "🔔 You're on the list. I sent you a DM so you can see it works. You'll get one every time the bump is ready."
      : "🔔 You're on the list, but I couldn't DM you. Turn on **Direct Messages** for this server (server name → Privacy Settings), then you'll get them."
  );
}
