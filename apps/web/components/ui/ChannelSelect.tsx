"use client";

import { useEffect, useState } from "react";
import { api, type DiscordChannelOption } from "../../lib/api";

interface ChannelSelectProps {
  guildId: string;
  value: string | null;
  onChange: (channelId: string) => void;
  kind?: "text" | "voice" | "category";
  placeholder?: string;
}

export function ChannelSelect({ guildId, value, onChange, kind = "text", placeholder }: ChannelSelectProps) {
  const [options, setOptions] = useState<DiscordChannelOption[] | Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    api.getDiscordChannels(guildId).then((channels) => {
      if (kind === "category") setOptions(channels.categories);
      else if (kind === "voice") setOptions(channels.voiceChannels);
      else setOptions(channels.textChannels);
    });
  }, [guildId, kind]);

  return (
    <select
      className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder ?? "Select a channel…"}</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {"categoryName" in c && c.categoryName ? `${c.categoryName} / ` : ""}
          {kind === "category" ? c.name : `#${c.name}`}
        </option>
      ))}
    </select>
  );
}
