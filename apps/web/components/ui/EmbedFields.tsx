"use client";

import { ToggleSwitch } from "./ToggleSwitch";
import { ButtonsEditor } from "./ButtonsEditor";
import type { StickyButton } from "../../lib/api";

interface EmbedFieldsProps {
  guildId: string;
  embedEnabled: boolean;
  embedTitle: string;
  embedColor: string;
  buttons: StickyButton[];
  onChange: (next: { embedEnabled: boolean; embedTitle: string; embedColor: string; buttons: StickyButton[] }) => void;
  titleLabel?: string;
}

// Shared "turn this message into an embed, give it a title/color, add
// link buttons" block — used everywhere the bot posts a dashboard-authored
// message (Welcome/Goodbye, Custom Commands, Sticky Messages).
export function EmbedFields({ guildId, embedEnabled, embedTitle, embedColor, buttons, onChange, titleLabel = "Embed Title" }: EmbedFieldsProps) {
  function set(patch: Partial<{ embedEnabled: boolean; embedTitle: string; embedColor: string; buttons: StickyButton[] }>) {
    onChange({ embedEnabled, embedTitle, embedColor, buttons, ...patch });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
        <span className="text-sm text-slate-300">Use an embed</span>
        <ToggleSwitch enabled={embedEnabled} onChange={(v) => set({ embedEnabled: v })} label="Use an embed" />
      </div>

      {embedEnabled && (
        <div className="mb-4 space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">{titleLabel}</label>
            <input
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={embedTitle}
              onChange={(e) => set({ embedTitle: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 rounded-lg border border-white/10 bg-base-950 cursor-pointer"
                value={embedColor}
                onChange={(e) => set({ embedColor: e.target.value })}
              />
              <input
                className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                value={embedColor}
                onChange={(e) => set({ embedColor: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <ButtonsEditor guildId={guildId} buttons={buttons} onChange={(next) => set({ buttons: next })} />
      </div>
    </div>
  );
}
