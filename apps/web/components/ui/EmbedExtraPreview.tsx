"use client";

import type { EmbedExtra } from "../../lib/embedExtra";

// Shared rendering for the "extra" embed fields (author, thumbnail, image,
// footer icon, timestamp, fields) inside a Discord-style preview block.
// Used by StickyPreview plus the couple of pages (Giveaways, Birthdays) that
// draw their own bespoke preview instead of reusing StickyPreview, so every
// embed-creator page reflects the same fields the same way.
export function EmbedExtraAuthor({ embedExtra }: { embedExtra?: EmbedExtra }) {
  if (!embedExtra?.authorName) return null;
  return (
    <div className="flex items-center gap-1.5 mb-1">
      {embedExtra.authorIconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={embedExtra.authorIconUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
      )}
      <span className="text-[#f2f3f5] text-xs font-semibold">{embedExtra.authorName}</span>
    </div>
  );
}

export function EmbedExtraThumbnail({ embedExtra }: { embedExtra?: EmbedExtra }) {
  if (!embedExtra?.thumbnailUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={embedExtra.thumbnailUrl} alt="" className="float-right h-16 w-16 rounded object-cover ml-3 mb-1" />
  );
}

export function EmbedExtraImage({ embedExtra }: { embedExtra?: EmbedExtra }) {
  if (!embedExtra?.imageUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={embedExtra.imageUrl} alt="" className="rounded mt-2 max-h-52 w-full object-cover" />
  );
}

export function EmbedExtraFieldsPreview({ embedExtra }: { embedExtra?: EmbedExtra }) {
  const fields = (embedExtra?.fields ?? []).filter((f) => f.name || f.value);
  if (fields.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
      {fields.map((f, i) => (
        <div key={i} className={f.inline ? "" : "col-span-2"}>
          <p className="text-[#f2f3f5] text-xs font-semibold">{f.name || "Field"}</p>
          <p className="text-[#dbdee1] text-xs whitespace-pre-wrap break-words">{f.value || "—"}</p>
        </div>
      ))}
    </div>
  );
}

export function EmbedExtraFooter({ embedExtra }: { embedExtra?: EmbedExtra }) {
  if (!embedExtra?.footerText && !embedExtra?.footerIconUrl && !embedExtra?.timestamp) return null;
  return (
    <div className="flex items-center gap-1.5 mt-2">
      {embedExtra.footerIconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={embedExtra.footerIconUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
      )}
      <span className="text-[#949ba4] text-[10px]">
        {embedExtra.footerText}
        {embedExtra.footerText && embedExtra.timestamp ? " • " : ""}
        {embedExtra.timestamp ? `Today at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
      </span>
    </div>
  );
}
