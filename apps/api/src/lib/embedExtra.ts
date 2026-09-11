// Raw-REST counterpart to apps/bot/src/lib/embedExtra.ts, for API-side code
// that posts embed JSON directly (no discord.js builder) — e.g.
// buildRestMessagePayload in discordRest.ts. Same JSON shape as
// apps/web/lib/embedExtra.ts; keep all three in sync if it changes.
interface EmbedExtraShape {
  authorName?: string;
  authorIconUrl?: string;
  authorUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerIconUrl?: string;
  timestamp?: boolean;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export function applyEmbedExtraRest(embed: Record<string, unknown>, raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return embed;
  const extra = raw as EmbedExtraShape;

  if (extra.authorName) {
    embed.author = { name: extra.authorName, icon_url: extra.authorIconUrl || undefined, url: extra.authorUrl || undefined };
  }
  if (extra.thumbnailUrl) embed.thumbnail = { url: extra.thumbnailUrl };
  if (extra.imageUrl) embed.image = { url: extra.imageUrl };
  if (extra.footerIconUrl) {
    const currentFooter = (embed.footer as { text?: string } | undefined) ?? {};
    embed.footer = { text: currentFooter.text ?? "​", icon_url: extra.footerIconUrl };
  }
  if (extra.timestamp) embed.timestamp = new Date().toISOString();
  if (Array.isArray(extra.fields) && extra.fields.length > 0) {
    embed.fields = extra.fields
      .slice(0, 25)
      .map((f) => ({ name: (f.name || "​").slice(0, 256), value: (f.value || "​").slice(0, 1024), inline: !!f.inline }));
  }
  return embed;
}
