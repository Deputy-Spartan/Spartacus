"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type DiscordChannelOption } from "../../lib/api";

interface ChannelSelectProps {
  guildId: string;
  value: string | null;
  onChange: (channelId: string) => void;
  kind?: "text" | "voice" | "category";
  placeholder?: string;
}

const NO_CATEGORY = "__none__";

export function ChannelSelect({ guildId, value, onChange, kind = "text", placeholder }: ChannelSelectProps) {
  const [channels, setChannels] = useState<DiscordChannelOption[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoryId, setCategoryId] = useState<string>("");

  useEffect(() => {
    api.getDiscordChannels(guildId).then((result) => {
      setCategories(result.categories);
      setChannels(kind === "voice" ? result.voiceChannels : result.textChannels);
    });
  }, [guildId, kind]);

  // Once channels load, derive which category the current value lives in
  // so re-opening an existing config lands on the right category directly
  // instead of an empty picker.
  useEffect(() => {
    if (!value || channels.length === 0) return;
    const current = channels.find((c) => c.id === value);
    if (current) setCategoryId(current.categoryName ? current.categoryName : NO_CATEGORY);
  }, [value, channels]);

  const channelsInCategory = useMemo(() => {
    if (!categoryId) return [];
    if (categoryId === NO_CATEGORY) return channels.filter((c) => !c.categoryName);
    return channels.filter((c) => c.categoryName === categoryId);
  }, [channels, categoryId]);

  if (kind === "category") {
    return (
      <select
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder ?? "Select a category…"}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    );
  }

  const hasUncategorized = channels.some((c) => !c.categoryName);

  return (
    <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <select
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
        value={categoryId}
        onChange={(e) => {
          setCategoryId(e.target.value);
          onChange(""); // category changed — force an explicit re-pick of the channel
        }}
      >
        <option value="">Select a category…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
        {hasUncategorized && <option value={NO_CATEGORY}>No category</option>}
      </select>

      <select
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm disabled:opacity-50"
        value={value ?? ""}
        disabled={!categoryId}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder ?? "Select a channel…"}</option>
        {channelsInCategory.map((c) => (
          <option key={c.id} value={c.id}>
            {kind === "voice" ? "🔊 " : "#"}
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
