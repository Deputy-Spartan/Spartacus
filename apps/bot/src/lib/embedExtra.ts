import { EmbedBuilder } from "discord.js";

// Bot-side (discord.js EmbedBuilder) counterpart to
// apps/web/lib/embedExtra.ts — same JSON shape, applied to an already-built
// embed. Keep this in sync if the shape changes; there's also a raw-REST
// version in apps/api/src/lib/embedExtra.ts for jobs/routes that build
// embed JSON directly instead of going through discord.js.
interface EmbedExtraShape {
  authorName?: string;
  authorIconUrl?: string;
  authorUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerText?: string;
  footerIconUrl?: string;
  timestamp?: boolean;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export function applyEmbedExtra(embed: EmbedBuilder, raw: unknown): EmbedBuilder {
  if (!raw || typeof raw !== "object") return embed;
  const extra = raw as EmbedExtraShape;

  if (extra.authorName) {
    embed.setAuthor({ name: extra.authorName, iconURL: extra.authorIconUrl || undefined, url: extra.authorUrl || undefined });
  }
  if (extra.thumbnailUrl) embed.setThumbnail(extra.thumbnailUrl);
  if (extra.imageUrl) embed.setImage(extra.imageUrl);
  if (extra.footerText || extra.footerIconUrl) {
    embed.setFooter({ text: extra.footerText || "​", iconURL: extra.footerIconUrl || undefined });
  }
  if (extra.timestamp) embed.setTimestamp(new Date());
  if (Array.isArray(extra.fields) && extra.fields.length > 0) {
    embed.addFields(
      extra.fields.slice(0, 25).map((f) => ({ name: f.name.slice(0, 256) || "​", value: (f.value || "​").slice(0, 1024), inline: !!f.inline }))
    );
  }
  return embed;
}
