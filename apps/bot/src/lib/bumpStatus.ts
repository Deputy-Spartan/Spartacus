import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type BaseMessageOptions, type Client } from "discord.js";
import { cleanBumpMessages, fillBumpStage, BUMP_DEFAULTS, type BumpStage, type BumpStageMessage } from "@spartacus/shared";
import { prisma } from "./prisma";
import { isSendableChannel } from "./channels";
import { applyEmbedExtra } from "./embedExtra";
import { logError } from "@spartacus/db";

type Row = NonNullable<Awaited<ReturnType<typeof prisma.bumpReminderSettings.findUnique>>>;

const COOLDOWN_MS = 2 * 60 * 60 * 1000;

// Where the bump stands right now, or null before the first bump.
export function currentBumpStage(row: Row, now = Date.now()): BumpStage | null {
  if (!row.nextReminderAt) return null;
  if (now < row.nextReminderAt.getTime()) return "bumped";
  return row.missedAlerts > 0 ? "missed" : "ready";
}

function hasEmbedBody(m: BumpStageMessage) {
  const e = m.extra;
  return !!(m.title || m.description || e.imageUrl || e.thumbnailUrl || e.footerText || e.authorName || e.fields?.length);
}

export function buildBumpPayload(row: Row, stage: BumpStage, serverName: string): BaseMessageOptions {
  let msg = cleanBumpMessages(row.bumpMessages)[stage];
  // A stage left completely empty falls back to the default so Discord accepts it.
  if (!msg.content.trim() && !(msg.embedEnabled && hasEmbedBody(msg))) msg = BUMP_DEFAULTS[stage];
  // Before any bump is recorded, "Bump done" counts 2 hours from now and Ready counts from now.
  const ready = row.nextReminderAt ?? new Date(stage === "bumped" ? Date.now() + COOLDOWN_MS : Date.now());
  const filled = fillBumpStage(msg, {
    userId: row.lastBumpedById,
    roleId: row.mentionRoleId,
    nextAt: ready,
    serverName,
    missed: row.missedAlerts,
    count: row.bumpCount,
  });
  const embeds: EmbedBuilder[] = [];
  if (filled.embedEnabled && hasEmbedBody(filled)) {
    const embed = new EmbedBuilder().setColor(filled.color as `#${string}`);
    if (filled.title) embed.setTitle(filled.title);
    if (filled.description) embed.setDescription(filled.description);
    applyEmbedExtra(embed, filled.extra);
    embeds.push(embed);
  }
  const dmButton = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId("bump:dm").setLabel("DM me when it's ready").setEmoji("🔔").setStyle(ButtonStyle.Secondary));
  return {
    content: filled.content || (embeds.length ? "" : "​"),
    embeds,
    components: [dmButton],
    allowedMentions: { roles: row.mentionRoleId ? [row.mentionRoleId] : [], users: row.lastBumpedById ? [row.lastBumpedById] : [] },
  };
}

// Shows `stage` as the one Spartacus bump message in the channel. It edits
// the message when it's still the newest one there and nobody needs a ping;
// otherwise it deletes the old one and posts a new one (Discord only pings
// on new messages, and a new one sits below Disboard's reply).
export async function showBumpStage(client: Client, guildId: string, stage: BumpStage, opts: { ping: boolean }) {
  const row = await prisma.bumpReminderSettings.findUnique({ where: { guildId } });
  if (!row?.channelId) return;
  const channel = await client.channels.fetch(row.channelId).catch(() => null);
  if (!isSendableChannel(channel) || !("messages" in channel)) return;

  const messages = cleanBumpMessages(row.bumpMessages);
  const old = row.statusMessageId ? await channel.messages.fetch(row.statusMessageId).catch(() => null) : null;

  // "Bump done" switched off: just clear the old reminder away.
  if (stage === "bumped" && !messages.bumped.enabled) {
    await old?.delete().catch(() => null);
    if (row.statusMessageId) await prisma.bumpReminderSettings.update({ where: { id: row.id }, data: { statusMessageId: null } });
    return;
  }

  const guild = client.guilds.cache.get(guildId);
  const payload = buildBumpPayload(row, stage, guild?.name ?? "the server");
  const pings = opts.ping && /<@&?\d+>/.test(payload.content ?? "");
  const newest = "lastMessageId" in channel ? channel.lastMessageId : null;

  if (old && !pings && newest === old.id) {
    const edited = await old.edit(payload).catch(() => null);
    if (edited) return;
  }
  await old?.delete().catch(() => null);
  const posted = await channel.send(payload).catch((err) => {
    logError("bot", err, guildId);
    return null;
  });
  await prisma.bumpReminderSettings.update({ where: { id: row.id }, data: { statusMessageId: posted?.id ?? null } });
  if (opts.ping && (stage === "ready" || stage === "missed")) await dmBumpers(client, row, stage, guild?.name ?? "the server", posted?.url ?? null);
}

// A DM is a phone notification, so people at work still hear about it.
async function dmBumpers(client: Client, row: Row, stage: BumpStage, serverName: string, url: string | null) {
  const ids = Array.isArray(row.dmUserIds) ? row.dmUserIds.filter((x): x is string => typeof x === "string") : [];
  const link = url ?? `https://discord.com/channels/${row.guildId}/${row.channelId}`;
  const text =
    stage === "ready"
      ? `⏰ **${serverName}** can be bumped now! Run \`/bump\` here: ${link}`
      : `⚠️ **${serverName}** still hasn't been bumped${row.missedAlerts > 1 ? ` (missed ${row.missedAlerts} in a row)` : ""}. Run \`/bump\` here: ${link}`;
  for (const id of ids) {
    const user = await client.users.fetch(id).catch(() => null);
    await user?.send({ content: `${text}\n-# Tap 🔔 on the bump message to stop these.` }).catch(() => null);
  }
}

// The dashboard's Send Now: optionally sets when the last bump was, then
// posts the current stage's message with fresh timers (no ping).
export async function sendBumpStatusNow(client: Client, guildId: string, lastBumpAt?: Date | null): Promise<{ ok: boolean; error?: string; stage?: BumpStage }> {
  let row = await prisma.bumpReminderSettings.findUnique({ where: { guildId } });
  if (!row?.channelId) return { ok: false, error: "Pick a bump channel first." };
  const channelId = row.channelId;
  if (lastBumpAt) {
    const next = new Date(lastBumpAt.getTime() + COOLDOWN_MS);
    row = await prisma.bumpReminderSettings.update({
      where: { id: row.id },
      // Already past: it's ready now, and the missed-bump timer runs from then.
      // Who bumped isn't known for a bump Spartacus didn't see, so {user} reads "someone".
      data: { lastBumpAt, lastBumpedById: null, nextReminderAt: next, reminded: next.getTime() <= Date.now(), missedAlerts: 0 },
    });
  }
  const stage = currentBumpStage(row) ?? "ready";
  if (stage === "bumped" && !cleanBumpMessages(row.bumpMessages).bumped.enabled) {
    return { ok: false, error: "The Bump Done message is switched off, so there's nothing to send until the bump is ready." };
  }
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!isSendableChannel(channel)) return { ok: false, error: "Spartacus can't post in the bump channel." };
  await showBumpStage(client, guildId, stage, { ping: false });
  return { ok: true, stage };
}

// After the message is changed on the dashboard: redraw the current one, no ping.
export async function refreshBumpStatus(client: Client, guildId: string) {
  const row = await prisma.bumpReminderSettings.findUnique({ where: { guildId } });
  if (!row?.channelId || !row.statusMessageId) return;
  const stage = currentBumpStage(row);
  if (!stage) return;
  const channel = await client.channels.fetch(row.channelId).catch(() => null);
  if (!isSendableChannel(channel) || !("messages" in channel)) return;
  const old = await channel.messages.fetch(row.statusMessageId).catch(() => null);
  if (!old) return;
  const messages = cleanBumpMessages(row.bumpMessages);
  if (stage === "bumped" && !messages.bumped.enabled) return;
  const guild = client.guilds.cache.get(guildId);
  await old.edit(buildBumpPayload(row, stage, guild?.name ?? "the server")).catch(() => null);
}
