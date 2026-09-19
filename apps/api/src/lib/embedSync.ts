import { prisma } from "@spartacus/db";
import { editChannelMessage, editWebhookMessage } from "./discordRest";
import { buildMessagePayload, type BuilderEmbed, type BuilderComponentRow } from "./embedCreatorPayload";

export interface SyncResult {
  updated: number;
  failed: number;
  places: string[]; // human-readable list of where the embed was refreshed
  failures: string[]; // "<where> — <why>" for anything that could not be edited
}

// Turns Discord's raw JSON error into a reason a person can act on.
function reason(raw: string): string {
  if (raw.includes("10008") || raw.includes("10003")) return "the message was deleted";
  if (raw.includes("50005")) return "it was posted by a different bot or webhook";
  if (raw.includes("50001") || raw.includes("50013")) return "the bot can't see or edit that channel";
  return "Discord refused the edit";
}

interface Target {
  label: string;
  channelId: string;
  messageId: string;
}

// Called whenever a saved embed is saved or edited: finds every posted Discord
// message that was built from it and edits it in place. Only content and
// embeds are sent, so each module's own buttons / dropdowns stay untouched.
// Modules that read the preset fresh each time they send (Welcome, custom
// commands, LFG, giveaways, birthdays, sticky messages) need nothing here —
// their next message already uses the new version.
export async function syncPresetUsage(guildId: string, presetId: string): Promise<SyncResult> {
  const preset = await prisma.embedCreatorPreset.findUnique({ where: { id: presetId } });
  const result: SyncResult = { updated: 0, failed: 0, places: [], failures: [] };
  if (!preset) return result;

  const data = preset.data as { content?: string; embeds?: BuilderEmbed[]; components?: BuilderComponentRow[] };
  const payload = await buildMessagePayload(guildId, { content: data.content, embeds: data.embeds, components: [] });
  const edit = { content: payload.content ?? "", embeds: payload.embeds ?? [] };

  const targets: Target[] = [];
  const where = { guildId, savedEmbedId: presetId, messageId: { not: null } } as const;

  for (const p of await prisma.reactionRolePanel.findMany({ where })) {
    targets.push({ label: `Reaction role panel "${p.title ?? "untitled"}"`, channelId: p.channelId, messageId: p.messageId! });
  }
  for (const p of await prisma.rolePanel.findMany({ where })) {
    targets.push({ label: `Role panel "${p.name}"`, channelId: p.channelId, messageId: p.messageId! });
  }
  for (const p of await prisma.ticketPanel.findMany({ where })) {
    targets.push({ label: `Ticket panel "${p.name}"`, channelId: p.channelId, messageId: p.messageId! });
  }
  for (const p of await prisma.applicationPanel.findMany({ where })) {
    targets.push({ label: `Application panel "${p.name}"`, channelId: p.channelId, messageId: p.messageId! });
  }
  for (const a of await prisma.announcement.findMany({ where })) {
    targets.push({ label: "Announcement", channelId: a.channelId, messageId: a.messageId! });
  }

  for (const t of targets) {
    const r = await editChannelMessage(t.channelId, t.messageId, edit);
    if (r.error) {
      result.failed++;
      result.failures.push(`${t.label} — ${reason(r.error)}`);
    } else {
      result.updated++;
      result.places.push(t.label);
    }
  }

  // The message this preset itself was last sent as from the Embed Creator.
  if (preset.lastSentMessageId) {
    const full = await buildMessagePayload(guildId, { content: data.content, embeds: data.embeds, components: data.components });
    let r: { error?: string } | null = null;
    if (preset.lastSentMode === "webhook" && preset.lastSentWebhookUrl) r = await editWebhookMessage(preset.lastSentWebhookUrl, preset.lastSentMessageId, full);
    else if (preset.lastSentChannelId) r = await editChannelMessage(preset.lastSentChannelId, preset.lastSentMessageId, full);
    if (r) {
      if (r.error) {
        result.failed++;
        result.failures.push(`Its last sent message — ${reason(r.error)}`);
        // a deleted message can never be edited again, so stop tracking it
        if (/10008|10003/.test(r.error)) {
          await prisma.embedCreatorPreset.update({ where: { id: presetId }, data: { lastSentMessageId: null, lastSentChannelId: null, lastSentWebhookUrl: null, lastSentMode: null } });
        }
      } else {
        result.updated++;
        result.places.push("Its last sent message");
      }
    }
  }
  return result;
}
