import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type BaseMessageOptions } from "discord.js";
import { applyEmbedExtra } from "./embedExtra";
import { buildSavedEmbedPayload, type SavedEmbedData } from "./savedEmbedRender";

interface StickyButton {
  label: string;
  url: string;
}

export interface StickyMessageLike {
  content: string;
  embedEnabled: boolean;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  buttons: unknown;
  embedExtra?: unknown;
}

// `savedEmbed` (already resolved via resolveSavedEmbed(row.savedEmbedId))
// takes over the whole payload when present — Welcome, Custom Commands,
// Announcements, and Sticky Messages all send through this one function,
// so this is the single place that makes "use a saved embed" work for all
// four instead of each needing its own branch.
export async function buildStickyPayload(
  sticky: StickyMessageLike,
  options?: { thumbnailUrl?: string; savedEmbed?: SavedEmbedData | null; guildId?: string; tokens?: Record<string, string> }
): Promise<BaseMessageOptions> {
  if (options?.savedEmbed && options.guildId) return buildSavedEmbedPayload(options.guildId, options.savedEmbed, options.tokens);

  const buttons = Array.isArray(sticky.buttons) ? (sticky.buttons as StickyButton[]) : [];

  const components =
    buttons.length > 0
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            buttons.map((b) => new ButtonBuilder().setLabel(b.label).setURL(b.url).setStyle(ButtonStyle.Link))
          ),
        ]
      : [];

  if (!sticky.embedEnabled) {
    return { content: sticky.content, embeds: [], components };
  }

  const embed = new EmbedBuilder();
  if (sticky.embedTitle) embed.setTitle(sticky.embedTitle);
  embed.setDescription(sticky.embedDescription || sticky.content);
  if (sticky.embedColor) embed.setColor(sticky.embedColor as `#${string}`);
  if (options?.thumbnailUrl) embed.setThumbnail(options.thumbnailUrl);
  applyEmbedExtra(embed, sticky.embedExtra);

  // A plain message alongside an embed is completely normal Discord
  // behavior (it's what shows as the text line above the card) — only
  // drop it from `content` when it's the exact text already reused as the
  // embed's description, so that case doesn't show the same text twice.
  const plainContent = sticky.content && sticky.content !== sticky.embedDescription ? sticky.content : "";

  return { content: plainContent, embeds: [embed], components };
}
