"use client";

import type { StickyButton } from "../../lib/api";
import type { EmbedExtra } from "../../lib/embedExtra";
import { DiscordButton, DiscordButtonRow, DiscordEmbed, DiscordMessage, extraEmbedProps } from "./DiscordPreview";

interface StickyPreviewProps {
  content: string;
  embedEnabled: boolean;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  buttons: StickyButton[];
  embedExtra?: EmbedExtra;
}

// What the sticky looks like in Discord (see apps/bot/src/lib/stickyRender.ts).
export function StickyPreview({ content, embedEnabled, embedTitle, embedDescription, embedColor, buttons, embedExtra }: StickyPreviewProps) {
  const showEmbed = embedEnabled && (embedTitle || embedDescription || embedExtra?.authorName || embedExtra?.fields?.length || embedExtra?.imageUrl);
  const hasContent = content || showEmbed;

  return (
    // The plain message is independent of the embed: it's the text line
    // Discord shows above the card, shown whenever it's set.
    <DiscordMessage content={content}>
      {!hasContent && <p className="text-[#949ba4] text-sm italic">Nothing to preview yet.</p>}
      {showEmbed && <DiscordEmbed color={embedColor} title={embedTitle} description={embedDescription} {...extraEmbedProps(embedExtra)} />}
      {buttons.length > 0 && (
        <DiscordButtonRow>
          {buttons.map((b, i) => (
            <DiscordButton key={i} label={b.label || "Button"} style="link" />
          ))}
        </DiscordButtonRow>
      )}
    </DiscordMessage>
  );
}
