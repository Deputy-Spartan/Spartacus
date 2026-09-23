"use client";

import { useEffect, useState } from "react";
import { ChannelSelect } from "./ChannelSelect";
import { ToggleSwitch } from "./ToggleSwitch";

interface ChannelOverrideFieldProps {
  guildId: string;
  value: string | null;
  onChange: (channelId: string | null) => void;
  label?: string;
  /** Shown in place of the channel picker while the checkbox is off. */
  fallbackNote: string;
  kind?: "text" | "voice";
}

// The on/off pair used anywhere a feature can either post to one fixed
// channel or just fall back to wherever it was triggered — unchecked hides
// the picker entirely and shows the fallback behavior as a note, so there's
// nothing left to configure until it's turned on.
export function ChannelOverrideField({ guildId, value, onChange, label, fallbackNote, kind = "text" }: ChannelOverrideFieldProps) {
  const [enabled, setEnabled] = useState(value !== null);
  const [remembered, setRemembered] = useState<string | null>(value);

  // Keep in sync with the server value once it loads/reloads (e.g. after a
  // save echoes back, or switching between items that each have their own).
  useEffect(() => {
    setEnabled(value !== null);
    if (value !== null) setRemembered(value);
  }, [value]);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-300">{label ?? "Post to a specific channel"}</span>
        <ToggleSwitch
          enabled={enabled}
          onChange={(next) => {
            setEnabled(next);
            onChange(next ? remembered : null);
          }}
        />
      </div>
      {enabled ? (
        <ChannelSelect guildId={guildId} value={value} onChange={onChange} kind={kind} />
      ) : (
        <p className="text-xs text-slate-600">{fallbackNote}</p>
      )}
    </div>
  );
}
