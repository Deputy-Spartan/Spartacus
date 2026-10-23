// Shared shape for the "extra" embed fields every embed-creator page on the
// dashboard now supports, stored as a single `embedExtra Json?` column on
// each embed-bearing model rather than one new typed column per field per
// table (10 models × 7 fields would've meant 70 migrations to keep in
// sync). apps/bot/src/lib/embedExtra.ts and apps/api/src/lib/embedExtra.ts
// are the same shape applied on the sending side — keep all three in sync
// if this changes.
export interface EmbedFieldEntry {
  name: string;
  value: string;
  inline: boolean;
}

export interface EmbedExtra {
  authorName?: string;
  authorIconUrl?: string;
  authorUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerText?: string;
  footerIconUrl?: string;
  timestamp?: boolean;
  fields?: EmbedFieldEntry[];
}

export const EMPTY_EMBED_EXTRA: EmbedExtra = {};

// Prisma returns the raw JSON value typed as `unknown`/`JsonValue` — this
// normalizes whatever comes back (including null, since every embedExtra
// column is nullable) into a safe, fully-optional EmbedExtra.
export function parseEmbedExtra(value: unknown): EmbedExtra {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  return {
    authorName: typeof v.authorName === "string" ? v.authorName : undefined,
    authorIconUrl: typeof v.authorIconUrl === "string" ? v.authorIconUrl : undefined,
    authorUrl: typeof v.authorUrl === "string" ? v.authorUrl : undefined,
    thumbnailUrl: typeof v.thumbnailUrl === "string" ? v.thumbnailUrl : undefined,
    imageUrl: typeof v.imageUrl === "string" ? v.imageUrl : undefined,
    footerText: typeof v.footerText === "string" ? v.footerText : undefined,
    footerIconUrl: typeof v.footerIconUrl === "string" ? v.footerIconUrl : undefined,
    timestamp: v.timestamp === true,
    fields: Array.isArray(v.fields)
      ? v.fields
          .filter((f): f is EmbedFieldEntry => !!f && typeof f === "object" && typeof (f as EmbedFieldEntry).name === "string")
          .slice(0, 25) // Discord's own embed field cap
          .map((f) => ({ name: String(f.name).slice(0, 256), value: String(f.value ?? "").slice(0, 1024), inline: !!f.inline }))
      : undefined,
  };
}
