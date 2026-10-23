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
  if (sticky.embedDescription) embed.setDescription(sticky.embedDescription);
  if (sticky.embedColor) embed.setColor(sticky.embedColor as `#${string}`);
  if (options?.thumbnailUrl) embed.setThumbnail(options.thumbnailUrl);
  applyEmbedExtra(embed, sticky.embedExtra);

  // `content` is independent of the embed's own description — it's the
  // plain text line Discord shows above the embed card, same as any bot
  // message that sends both together. No fallback here: a feature that
  // wants content to double as the embed's body (Welcome, for example)
  // already passes the same string for both rather than relying on one
  // silently filling in for the other, which previously risked showing
  // the same text twice once content and embedDescription could differ.
  return { content: sticky.content, embeds: [embed], components };
}
