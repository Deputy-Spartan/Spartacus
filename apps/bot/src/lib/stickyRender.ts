import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type BaseMessageOptions } from "discord.js";
import { applyEmbedExtra } from "./embedExtra";

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

export function buildStickyPayload(sticky: StickyMessageLike, options?: { thumbnailUrl?: string }): BaseMessageOptions {
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

  return { content: "", embeds: [embed], components };
}
