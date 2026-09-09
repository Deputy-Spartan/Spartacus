"use client";

import { useEffect, useState } from "react";
import { api, type ButtonPresetRow, type StickyButton } from "../../lib/api";

interface ButtonsEditorProps {
  guildId: string;
  buttons: StickyButton[];
  onChange: (next: StickyButton[]) => void;
}

// Shared "add up to 5 link buttons, save the set as a reusable preset, load
// one back later" block — used everywhere buttons can be attached to a
// message (sticky messages, welcome, custom commands, events, embeds).
export function ButtonsEditor({ guildId, buttons, onChange }: ButtonsEditorProps) {
  const [presets, setPresets] = useState<ButtonPresetRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getButtonPresets(guildId).then(setPresets);
  }, [guildId]);

  function updateButton(index: number, field: keyof StickyButton, value: string) {
    const next = [...buttons];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  }

  async function savePreset() {
    if (buttons.length === 0) return;
    const name = window.prompt("Name this button preset:");
    if (!name) return;
    setSaving(true);
    const preset = await api.saveButtonPreset(guildId, name, buttons);
    setPresets((prev) => [...prev.filter((p) => p.name !== preset.name), preset].sort((a, b) => a.name.localeCompare(b.name)));
    setSaving(false);
  }

  async function deletePreset(id: string) {
    await api.deleteButtonPreset(guildId, id);
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <label className="text-xs uppercase tracking-wide text-slate-500">Custom Buttons (open a link)</label>
        <div className="flex items-center gap-3">
          {presets.length > 0 && (
            <select
              className="bg-base-800 border border-white/10 rounded text-xs text-slate-300 px-2 py-1"
              value=""
              onChange={(e) => {
                const preset = presets.find((p) => p.id === e.target.value);
                if (preset) onChange(preset.buttons);
              }}
            >
              <option value="">Load preset…</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {buttons.length > 0 && (
            <button type="button" onClick={savePreset} disabled={saving} className="text-xs text-neon-blue hover:text-neon-purple">
              Save as preset
            </button>
          )}
          {buttons.length < 5 && (
            <button
              type="button"
              onClick={() => onChange([...buttons, { label: "", url: "" }])}
              className="text-xs text-neon-blue hover:text-neon-purple"
            >
              + Add button
            </button>
          )}
        </div>
      </div>

      {buttons.length === 0 && <p className="text-xs text-slate-600">No buttons yet.</p>}

      <div className="space-y-2">
        {buttons.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="w-28 bg-base-950 border border-white/10 rounded-lg p-2 text-sm"
              placeholder="Label"
              value={b.label}
              onChange={(e) => updateButton(i, "label", e.target.value)}
            />
            <input
              className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2 text-sm"
              placeholder="https://…"
              value={b.url}
              onChange={(e) => updateButton(i, "url", e.target.value)}
            />
            <button
              type="button"
              onClick={() => onChange(buttons.filter((_, idx) => idx !== i))}
              className="text-slate-500 hover:text-rose-400 text-xs shrink-0"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {presets.map((p) => (
            <span key={p.id} className="flex items-center gap-1 bg-base-800 border border-white/10 rounded-full px-2 py-0.5 text-[11px] text-slate-500">
              {p.name}
              <button type="button" onClick={() => deletePreset(p.id)} className="hover:text-rose-400">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
