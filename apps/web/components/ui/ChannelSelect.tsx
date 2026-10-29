"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type DiscordChannelOption } from "../../lib/api";

interface ChannelSelectProps {
  guildId: string;
  value: string | null;
  onChange: (channelId: string) => void;
  kind?: "text" | "voice" | "category";
  placeholder?: string;
  // Hides the "Currently: Category / #channel" line above the selects —
  // for when this sits beside another field (e.g. a RoleSelect) in a grid
  // row and needs its dropdown to start at the same height, not shifted
  // down by this summary line only ChannelSelect has.
  showCurrent?: boolean;
}

const NO_CATEGORY = "__none__";

function RefreshButton({ onClick, spinning }: { onClick: () => void; spinning: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Refresh channel list"
      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 bg-base-950 text-slate-500 hover:text-neon-blue hover:border-neon-blue/40 transition-colors"
    >
      <span className={spinning ? "inline-block animate-spin" : "inline-block"}>⟳</span>
    </button>
  );
}

export function ChannelSelect({ guildId, value, onChange, kind = "text", placeholder, showCurrent = true }: ChannelSelectProps) {
  const [channels, setChannels] = useState<DiscordChannelOption[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getDiscordChannels(guildId)
      .then((result) => {
        setCategories(result.categories);
        setChannels(kind === "voice" ? result.voiceChannels : result.textChannels);
      })
      .finally(() => setLoading(false));
  }, [guildId, kind]);

  useEffect(load, [load]);

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

  const activeChannel = useMemo(() => channels.find((c) => c.id === value) ?? null, [channels, value]);
  const activeCategory = useMemo(() => categories.find((c) => c.id === value) ?? null, [categories, value]);

  if (kind === "category") {
    return (
      <div className="mb-4">
        {showCurrent && activeCategory && (
          <p className="text-xs text-slate-500 mb-1.5">
            Currently: <span className="text-slate-300">{activeCategory.name}</span>
          </p>
        )}
        <div className="flex gap-2">
          <select
            className="flex-1 min-w-0 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
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
          <RefreshButton onClick={load} spinning={loading} />
        </div>
      </div>
    );
  }

  const hasUncategorized = channels.some((c) => !c.categoryName);

  return (
    <div className="mb-4">
      {showCurrent && activeChannel && (
        <p className="text-xs text-slate-500 mb-1.5">
          Currently: <span className="text-slate-300">{activeChannel.categoryName ?? "No category"}</span>
          <span className="text-slate-600"> / </span>
          <span className="text-slate-300">
            {kind === "voice" ? "🔊 " : "#"}
            {activeChannel.name}
          </span>
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
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

        <RefreshButton onClick={load} spinning={loading} />
      </div>
    </div>
  );
}
