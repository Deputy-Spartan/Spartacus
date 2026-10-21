"use client";

import { useRef, useState } from "react";
import { MentionTextarea } from "../ui/MentionTextarea";
import { StyleToggleInput } from "../ui/StyleToggleInput";
import type { EmbedCreatorEmbed, EmbedCreatorField } from "../../lib/api";

const COLOR_PRESETS = ["#7B99BC", "#5E7FA6", "#7CB88F", "#D8AE6B", "#C77B7B", "#B98AD1", "#5865F2"];

interface EmbedCardProps {
  guildId: string;
  embed: EmbedCreatorEmbed;
  index: number;
  onChange: (next: EmbedCreatorEmbed) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function EmbedCard({ guildId, embed, index, onChange, onDuplicate, onRemove }: EmbedCardProps) {
  const [open, setOpen] = useState(index === 0);
  const descRef = useRef<HTMLTextAreaElement>(null);

  function set<K extends keyof EmbedCreatorEmbed>(key: K, value: EmbedCreatorEmbed[K]) {
    onChange({ ...embed, [key]: value });
  }

  function updateField(i: number, patch: Partial<EmbedCreatorField>) {
    const fields = [...embed.fields];
    fields[i] = { ...fields[i], ...patch };
    set("fields", fields);
  }
  function addField() {
    if (embed.fields.length >= 25) return;
    set("fields", [...embed.fields, { name: "", value: "", inline: false }]);
  }
  function removeField(i: number) {
    set(
      "fields",
      embed.fields.filter((_, idx) => idx !== i)
    );
  }

  const label = embed.title || embed.description || `Embed ${index + 1}`;

  return (
    <div className="rounded-xl border border-white/10 bg-base-900 mb-3 overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: embed.color || "#7B99BC" }}>
      <div className="flex items-center gap-2.5 px-4 py-3 cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
        <span className={`text-[10px] text-slate-500 transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        <span className="text-sm font-medium flex-1 min-w-0 truncate">{label}</span>
        <button
          type="button"
          title="Duplicate"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-base-800 hover:text-slate-200 text-sm"
        >
          ⧉
        </button>
        <button
          type="button"
          title="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-base-800 hover:text-rose-400 text-sm"
        >
          ✕
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Author</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1.5">Name</label>
                <input
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
                  value={embed.authorName ?? ""}
                  onChange={(e) => set("authorName", e.target.value)}
                  placeholder="e.g. Spartacus Updates"
                />
                <p className="text-[10px] text-slate-600 mt-1">Discord shows this as plain text — markdown doesn't render here.</p>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1.5">Icon URL</label>
                <input
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
                  value={embed.authorIconUrl ?? ""}
                  onChange={(e) => set("authorIconUrl", e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Content</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1.5">
                  Title{" "}
                  <span className={`font-mono ${(embed.title ?? "").length > 256 ? "text-rose-400" : "text-slate-600"}`}>
                    {(embed.title ?? "").length}/256
                  </span>
                </label>
                <StyleToggleInput
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                  value={embed.title ?? ""}
                  onChange={(v) => set("title", v)}
                  placeholder="Embed title"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1.5">Title URL</label>
                <input
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                  value={embed.titleUrl ?? ""}
                  onChange={(e) => set("titleUrl", e.target.value)}
                  placeholder="Optional link"
                />
              </div>
            </div>

            <label className="text-[11px] text-slate-500 block mb-1.5">
              Description <span className="text-slate-600 font-mono">{(embed.description ?? "").length}/4096</span>
            </label>
            <MentionTextarea
              guildId={guildId}
              value={embed.description ?? ""}
              onChange={(v) => set("description", v)}
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20 mb-3"
              maxLength={4096}
              placeholder="Embed body text — supports markdown"
            />

            <label className="text-[11px] text-slate-500 block mb-1.5">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-11 rounded-lg border border-white/10 bg-base-950 cursor-pointer shrink-0"
                value={embed.color ?? "#7B99BC"}
                onChange={(e) => set("color", e.target.value)}
              />
              <input
                className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                value={embed.color ?? "#7B99BC"}
                onChange={(e) => set("color", e.target.value)}
              />
            </div>
            <div className="flex gap-1.5 mt-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => set("color", c)}
                  className="w-4.5 h-4.5 rounded border border-white/10 hover:scale-110 transition-transform"
                  style={{ background: c, width: 18, height: 18 }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Images</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1.5">Thumbnail URL</label>
                <input
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
                  value={embed.thumbnailUrl ?? ""}
                  onChange={(e) => set("thumbnailUrl", e.target.value)}
                  placeholder="Small, top-right"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1.5">Image URL</label>
                <input
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
                  value={embed.imageUrl ?? ""}
                  onChange={(e) => set("imageUrl", e.target.value)}
                  placeholder="Large, bottom"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fields ({embed.fields.length}/25)</p>
              {embed.fields.length < 25 && (
                <button type="button" onClick={addField} className="text-[11px] text-neon-blue hover:underline">
                  + Add field
                </button>
              )}
            </div>
            <div className="space-y-2">
              {embed.fields.map((f, i) => (
                <div key={i} className="bg-base-950 border border-white/10 rounded-lg p-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="text-[10px] text-slate-600 block mb-1">
                        Field name <span className={f.name.length > 256 ? "text-rose-400" : ""}>{f.name.length}/256</span>
                      </label>
                      <StyleToggleInput
                        className="w-full bg-base-900 border border-white/10 rounded p-1.5 text-xs"
                        value={f.name}
                        onChange={(v) => updateField(i, { name: v })}
                        placeholder="Field name"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-600 block mb-1">
                        Field value <span className={f.value.length > 1024 ? "text-rose-400" : ""}>{f.value.length}/1024</span>
                      </label>
                      <MentionTextarea
                        guildId={guildId}
                        className="w-full bg-base-900 border border-white/10 rounded p-1.5 text-xs min-h-[38px]"
                        value={f.value}
                        maxLength={1024}
                        onChange={(v) => updateField(i, { value: v })}
                        placeholder="Field value — supports markdown"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <input type="checkbox" checked={!!f.inline} onChange={(e) => updateField(i, { inline: e.target.checked })} />
                      Inline
                    </label>
                    <button type="button" onClick={() => removeField(i)} className="text-[11px] text-slate-500 hover:text-rose-400">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {embed.fields.length === 0 && <p className="text-[11px] text-slate-600">No fields yet.</p>}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Footer</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1.5">
                  Footer Text <span className="text-slate-600 font-mono">{(embed.footerText ?? "").length}/2048</span>
                </label>
                <input
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
                  value={embed.footerText ?? ""}
                  maxLength={2048}
                  onChange={(e) => set("footerText", e.target.value)}
                  placeholder="Optional"
                />
                <p className="text-[10px] text-slate-600 mt-1">Discord shows this as plain text — markdown doesn't render here.</p>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1.5">Footer Icon URL</label>
                <input
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
                  value={embed.footerIconUrl ?? ""}
                  onChange={(e) => set("footerIconUrl", e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={!!embed.timestamp} onChange={(e) => set("timestamp", e.target.checked)} />
              Show current timestamp in footer
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
