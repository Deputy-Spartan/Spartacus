import cron from "node-cron";
import { Client, EmbedBuilder, type Message, type MessageCreateOptions } from "discord.js";
import type { ReactionRole, ReactionRolePanel } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logError } from "@spartacus/db";
import { isSendableChannel } from "../lib/channels";
import { isModuleEnabled } from "../lib/moduleGate";
import { applyEmbedExtra } from "../lib/embedExtra";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../lib/savedEmbedRender";

const DEFAULT_DESCRIPTION = "React below to get a role.";

type PanelWithOptions = ReactionRolePanel & { options: ReactionRole[] };

async function buildPayload(panel: PanelWithOptions): Promise<Pick<MessageCreateOptions, "content" | "embeds">> {
  const listing = panel.options.map((o) => `${o.emoji} — <@&${o.roleId}>`).join("\n");
  const description = [panel.description || DEFAULT_DESCRIPTION, "", listing].join("\n");

  // A saved embed from the Embed Creator library is the whole message body
  // (the bot still reacts with every emoji below); its own buttons are
  // dropped since reaction panels carry no components.
  const savedEmbed = await resolveSavedEmbed(panel.savedEmbedId);
  const savedPayload = savedEmbed ? await buildSavedEmbedPayload(panel.guildId, savedEmbed) : null;

  return savedPayload
    ? { content: savedPayload.content, embeds: savedPayload.embeds }
    : panel.embedEnabled
    ? {
        embeds: [
          applyEmbedExtra(
            new EmbedBuilder()
              .setColor((panel.embedColor as `#${string}`) || "#5865F2")
              .setTitle(panel.title || "Pick your roles")
              .setDescription(description),
            panel.embedExtra
          ),
        ],
      }
    : { content: [panel.title, description].filter(Boolean).join("\n\n") };
}

// "<:name:id>" / "<a:name:id>" → id; a unicode emoji is its own key — the
// same keys discord.js uses for message.reactions.cache.
function reactionKey(emoji: string): string {
  return emoji.match(/^<a?:\w+:(\d+)>$/)?.[1] ?? emoji;
}

// Makes the message's reactions match the panel: drops reactions for
// options that were removed, then adds the bot's reaction for every option.
async function syncReactions(client: Client, message: Message, panel: PanelWithOptions) {
  const wanted = new Set(panel.options.map((o) => reactionKey(o.emoji)));
  for (const [key, reaction] of message.reactions.cache) {
    if (wanted.has(key)) continue;
    // Clearing everyone's reaction needs Manage Messages; without it, at
    // least take the bot's own off so the option stops looking clickable.
    await reaction.remove().catch(() => (client.user ? reaction.users.remove(client.user.id).catch(() => null) : null));
  }
  for (const option of panel.options) {
    await message.react(option.emoji).catch(() => null);
  }
}

async function linkOptionsToMessage(panelId: string, messageId: string) {
  await prisma.reactionRolePanel.update({ where: { id: panelId }, data: { messageId } });
  await prisma.reactionRole.updateMany({ where: { panelId }, data: { messageId } });
}

// Edits the panel's already-posted message in place (text/embed, and
// reactions added or removed to match) instead of posting a new one. Also
// strips any buttons/dropdown, so a message adopted from a button panel
// that was switched to reactions converts cleanly. Returns false if
// there's no live message to edit — the caller then clears messageId and
// the poster below sends a fresh one.
export async function refreshReactionRolePanel(client: Client, panelId: string): Promise<boolean> {
  const panel = await prisma.reactionRolePanel.findUnique({ where: { id: panelId }, include: { options: true } });
  if (!panel?.messageId) return false;
  const channel = await client.channels.fetch(panel.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return false;
  const message = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (!message) return false;

  const payload = await buildPayload(panel);
  const edited = await message.edit({ content: payload.content ?? "", embeds: payload.embeds ?? [], components: [] }).catch((err) => {
    logError("bot", err, panel.guildId);
    return null;
  });
  if (!edited) return false;

  await linkOptionsToMessage(panel.id, edited.id);
  await syncReactions(client, edited, panel);
  return true;
}

// Posts the message for any ReactionRolePanel that doesn't have one yet
// (created just now, moved to another channel, or its old message is gone),
// then seeds the bot's own reaction for every emoji->role option so members
// have something to click. The actual role add/remove on click lives in
// modules/community/reactionRoles.ts and matches purely on messageId+emoji.
export function startReactionRolePosterJob(client: Client) {
  cron.schedule("*/5 * * * * *", async () => {
    let loggedThisTick = 0;
    const pending = await prisma.reactionRolePanel.findMany({
      where: { messageId: null },
      include: { options: true },
      take: 20,
    });

    for (const panel of pending) {
      if (!(await isModuleEnabled(panel.guildId, "REACTION_ROLES"))) continue;
      if (panel.options.length === 0) continue;

      const channel = await client.channels.fetch(panel.channelId).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const message = await channel.send(await buildPayload(panel)).catch((err) => {
        if (loggedThisTick < 5) {
          logError("bot", err, panel.guildId);
          loggedThisTick++;
        }
        return null;
      });
      if (!message) continue;

      await linkOptionsToMessage(panel.id, message.id);
      for (const option of panel.options) {
        await message.react(option.emoji).catch(() => null);
      }
    }
  });
}
