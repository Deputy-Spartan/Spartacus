"use client";

import { useState } from "react";
import type { EmbedExtra, EmbedFieldEntry } from "../../lib/embedExtra";
import { ImageUrlField } from "./ImageUrlField";

interface EmbedExtraFieldsProps {
  guildId: string;
  value: EmbedExtra;
  onChange: (next: EmbedExtra) => void;
}

// Drop this into any embed-creator page right after the color picker — it
// covers every embed feature beyond title/description/color/buttons:
// author, thumbnail, large image, footer icon, timestamp, and up to 25
// name/value fields. Collapsed behind a details/summary so pages that
// don't need it stay visually simple by default.
export function EmbedExtraFields({ guildId, value, onChange }: EmbedExtraFieldsProps) {
  const [open, setOpen] = useState(
    !!(value.authorName || value.thumbnailUrl || value.imageUrl || value.footerIconUrl || value.timestamp || value.fields?.length)
  );

  function set<K extends keyof EmbedExtra>(key: K, v: EmbedExtra[K]) {
    onChange({ ...value, [key]: v });
  }

  const fields = value.fields ?? [];
  function updateField(i: number, patch: Partial<EmbedFieldEntry>) {
    const next = [...fields];
    next[i] = { ...next[i], ...patch };
    set("fields", next);
  }
  function addField() {
    if (fields.length >= 25) return;
    set("fields", [...fields, { name: "", value: "", inline: false }]);
  }
  function removeField(i: number) {
    set(
      "fields",
      fields.filter((_, idx) => idx !== i)
    );
  }

  return (
    <div className="border border-white/10 rounded-lg mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200"
      >
        <span>More embed options (author, image, fields, timestamp)</span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500 block mb-1">Author name</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
                value={value.authorName ?? ""}
                onChange={(e) => set("authorName", e.target.value || undefined)}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500 block mb-1">Author icon URL</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
                value={value.authorIconUrl ?? ""}
                onChange={(e) => set("authorIconUrl", e.target.value || undefined)}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500 block mb-1">Author link</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
                value={value.authorUrl ?? ""}
                onChange={(e) => set("authorUrl", e.target.value || undefined)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500 block mb-1">Thumbnail</label>
              <ImageUrlField
                guildId={guildId}
                value={value.thumbnailUrl ?? ""}
                onChange={(v) => set("thumbnailUrl", v || undefined)}
                placeholder="Small image, top-right — paste a link or upload"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500 block mb-1">Image</label>
              <ImageUrlField
                guildId={guildId}
                value={value.imageUrl ?? ""}
                onChange={(v) => set("imageUrl", v || undefined)}
                placeholder="Large image, full width — paste a link or upload"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500 block mb-1">Footer icon URL</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
                value={value.footerIconUrl ?? ""}
                onChange={(e) => set("footerIconUrl", e.target.value || undefined)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={!!value.timestamp} onChange={(e) => set("timestamp", e.target.checked || undefined)} />
            Show current time in the footer
          </label>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] uppercase tracking-wide text-slate-500">Fields ({fields.length}/25)</label>
              {fields.length < 25 && (
                <button type="button" onClick={addField} className="text-[11px] text-neon-blue hover:underline">
                  + Add field
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {fields.map((f, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-1.5 bg-base-950 border border-white/5 rounded-lg p-2">
                  <input
                    className="sm:w-1/3 bg-base-900 border border-white/10 rounded p-1.5 text-xs"
                    placeholder="Name"
                    value={f.name}
                    onChange={(e) => updateField(i, { name: e.target.value })}
                  />
                  <input
                    className="flex-1 bg-base-900 border border-white/10 rounded p-1.5 text-xs"
                    placeholder="Value"
                    value={f.value}
                    onChange={(e) => updateField(i, { value: e.target.value })}
                  />
                  <label className="flex items-center gap-1 text-[11px] text-slate-500 shrink-0 px-1">
                    <input type="checkbox" checked={f.inline} onChange={(e) => updateField(i, { inline: e.target.checked })} />
                    Inline
                  </label>
                  <button type="button" onClick={() => removeField(i)} className="text-[11px] text-slate-500 hover:text-rose-400 shrink-0 px-1">
                    Remove
                  </button>
                </div>
              ))}
              {fields.length === 0 && <p className="text-[11px] text-slate-600">No fields yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
