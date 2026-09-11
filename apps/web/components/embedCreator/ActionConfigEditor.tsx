"use client";

import { useEffect, useState } from "react";
import { RoleSelect } from "../ui/RoleSelect";
import { api, type EmbedActionConfig, type EmbedActionType, type EmbedCreatorPresetRow } from "../../lib/api";

const ACTION_LABELS: Record<EmbedActionType, string> = {
  none: "No action",
  give_role: "Give Role",
  remove_role: "Remove Role",
  toggle_role: "Toggle Role (add if missing, remove if they have it)",
  add_currency: "Add Currency",
  send_message: "Send a Message",
  post_embed: "Post a Saved Embed",
  self_role: "Assign the picked role to yourself",
  send_embed_to_channel: "Send a Saved Embed to the picked channel",
};

interface Props {
  guildId: string;
  action: EmbedActionConfig | undefined;
  onChange: (next: EmbedActionConfig | undefined) => void;
  allowedTypes: EmbedActionType[];
}

// Reused for a button's action, a string-select option's action, and a
// user/channel-select row's single action — the dropdown only ever shows
// `allowedTypes` since not every action makes sense in every context (e.g.
// a channel select can only sensibly "send an embed to the picked channel").
export function ActionConfigEditor({ guildId, action, onChange, allowedTypes }: Props) {
  const [presets, setPresets] = useState<EmbedCreatorPresetRow[]>([]);
  const type = action?.type ?? "none";

  useEffect(() => {
    if (allowedTypes.includes("post_embed") || allowedTypes.includes("send_embed_to_channel")) {
      api.getEmbedCreatorPresets(guildId).then(setPresets);
    }
  }, [guildId, allowedTypes]);

  function set(patch: Partial<EmbedActionConfig>) {
    onChange({ type, ephemeral: true, ...action, ...patch });
  }

  return (
    <div className="bg-base-900 border border-white/10 rounded-lg p-3 mt-2">
      <label className="text-[11px] text-slate-500 block mb-1.5">Action</label>
      <select
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs mb-2"
        value={type}
        onChange={(e) => {
          const nextType = e.target.value as EmbedActionType;
          onChange(nextType === "none" ? undefined : { type: nextType, ephemeral: true });
        }}
      >
        {allowedTypes.map((t) => (
          <option key={t} value={t}>
            {ACTION_LABELS[t]}
          </option>
        ))}
      </select>

      {(type === "give_role" || type === "remove_role" || type === "toggle_role") && (
        <RoleSelect guildId={guildId} value={action?.roleId ?? null} onChange={(id) => set({ roleId: id })} placeholder="Pick a role…" />
      )}

      {type === "add_currency" && (
        <input
          type="number"
          min={1}
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
          placeholder="Amount"
          value={action?.currencyAmount ?? ""}
          onChange={(e) => set({ currencyAmount: Number(e.target.value) })}
        />
      )}

      {type === "send_message" && (
        <textarea
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs min-h-16"
          placeholder="Message to reply with"
          value={action?.messageText ?? ""}
          onChange={(e) => set({ messageText: e.target.value })}
        />
      )}

      {(type === "post_embed" || type === "send_embed_to_channel") && (
        <select
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-xs"
          value={action?.embedPresetId ?? ""}
          onChange={(e) => set({ embedPresetId: e.target.value || undefined })}
        >
          <option value="">— pick a saved embed —</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {type !== "none" && type !== "self_role" && (
        <label className="flex items-center gap-2 text-[11px] text-slate-500 mt-2">
          <input type="checkbox" checked={action?.ephemeral !== false} onChange={(e) => set({ ephemeral: e.target.checked })} />
          Only the person who clicked sees the reply
        </label>
      )}
    </div>
  );
}
