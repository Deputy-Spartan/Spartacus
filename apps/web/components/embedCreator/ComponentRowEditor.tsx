"use client";

import { useState } from "react";
import { RoleSelect } from "../ui/RoleSelect";
import { ChannelSelect } from "../ui/ChannelSelect";
import { ActionConfigEditor } from "./ActionConfigEditor";
import type { EmbedActionConfig, EmbedActionType, EmbedCreatorButtonItem, EmbedCreatorComponentRow, EmbedSelectOption } from "../../lib/api";

const COMPONENT_TYPES: Array<{ key: string; label: string }> = [
  { key: "button", label: "Button" },
  { key: "link", label: "Link Button" },
  { key: "string", label: "Select Menu" },
  { key: "user", label: "User Select Menu" },
  { key: "role", label: "Role Select Menu" },
  { key: "user_role", label: "User & Role Select Menu" },
  { key: "channel", label: "Channel Select Menu" },
];
const SELECT_LABELS: Record<string, string> = { string: "Select Menu", user: "User Select", role: "Role Select", user_role: "User & Role Select", channel: "Channel Select" };
type ButtonStyle = "primary" | "secondary" | "success" | "danger";
const BUTTON_STYLES: ButtonStyle[] = ["primary", "secondary", "success", "danger"];

const BUTTON_ACTION_TYPES: EmbedActionType[] = ["none", "give_role", "remove_role", "toggle_role", "add_currency", "send_message", "post_embed"];
const USER_ACTION_TYPES: EmbedActionType[] = ["none", "give_role", "add_currency"];
const CHANNEL_ACTION_TYPES: EmbedActionType[] = ["none", "send_embed_to_channel"];

interface Props {
  guildId: string;
  row: EmbedCreatorComponentRow;
  index: number;
  onChange: (next: EmbedCreatorComponentRow) => void;
  onRemove: () => void;
}

function uid() {
  return "i" + Math.random().toString(36).slice(2, 9);
}

export function ComponentRowEditor({ guildId, row, index, onChange, onRemove }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [openActionId, setOpenActionId] = useState<string | null>(null);

  function addComponent(type: string) {
    if (type === "button" || type === "link") {
      const item: EmbedCreatorButtonItem =
        type === "link" ? { id: uid(), kind: "link", label: "Link", url: "" } : { id: uid(), kind: "button", label: "Button", style: "primary" };
      onChange({ ...row, type: "buttons", items: [...row.items, item] });
    } else if (type === "string") {
      onChange({ ...row, type: "string", placeholder: row.placeholder || "Choose an option…", options: row.options?.length ? row.options : [{ id: uid(), label: "Option 1", value: "option_1" }] });
    } else {
      onChange({ ...row, type: type as EmbedCreatorComponentRow["type"], placeholder: row.placeholder || "Choose an option…" });
    }
    setDropdownOpen(false);
  }

  function updateItem(id: string, patch: Partial<{ label: string; url: string; style: ButtonStyle; action: EmbedActionConfig | undefined }>) {
    onChange({ ...row, items: row.items.map((it) => (it.id === id ? ({ ...it, ...patch } as EmbedCreatorButtonItem) : it)) });
  }
  function removeItem(id: string) {
    const items = row.items.filter((it) => it.id !== id);
    onChange({ ...row, items, type: items.length === 0 ? null : row.type });
  }
  function clearRow() {
    onChange({ ...row, type: null, placeholder: "", items: [], options: undefined, action: undefined, defaultValueId: undefined });
  }

  function addOption() {
    const options = row.options ?? [];
    if (options.length >= 25) return;
    onChange({ ...row, options: [...options, { id: uid(), label: `Option ${options.length + 1}`, value: `option_${options.length + 1}` }] });
  }
  function updateOption(id: string, patch: Partial<EmbedSelectOption>) {
    onChange({ ...row, options: (row.options ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  }
  function removeOption(id: string) {
    onChange({ ...row, options: (row.options ?? []).filter((o) => o.id !== id) });
  }

  const isEmpty = !row.type;
  const canAddMore = row.type === "buttons" ? row.items.length < 5 : !row.type;
  const dropdownOptions = row.type === "buttons" ? COMPONENT_TYPES.filter((t) => t.key === "button" || t.key === "link") : COMPONENT_TYPES;

  return (
    <div className="bg-base-950 border border-white/10 rounded-lg p-3 mb-2.5">
      <div className="flex items-center gap-2 mb-2.5">
        {isEmpty && (
          <span className="text-rose-400 text-sm" title="Empty row">
            ⚠
          </span>
        )}
        <span className="text-xs font-semibold text-slate-400 flex-1">Row {index + 1}</span>
        <button type="button" onClick={onRemove} className="text-slate-500 hover:text-rose-400 text-xs w-6 h-6 rounded hover:bg-base-800">
          ✕
        </button>
      </div>

      {row.type === "buttons" && (
        <div className="flex flex-col gap-2 mb-2.5">
          {row.items.map((it) => (
            <div key={it.id} className="bg-base-900 border border-white/10 rounded-lg p-2">
              <div className="flex items-center gap-1.5">
                <input
                  className="bg-base-950 border border-white/10 rounded p-1.5 text-xs w-28"
                  placeholder="Label"
                  maxLength={80}
                  value={it.label}
                  onChange={(e) => updateItem(it.id, { label: e.target.value })}
                />
                {it.kind === "link" ? (
                  <input
                    className="bg-base-950 border border-white/10 rounded p-1.5 text-xs flex-1"
                    placeholder="https://…"
                    value={it.url}
                    onChange={(e) => updateItem(it.id, { url: e.target.value })}
                  />
                ) : (
                  <select
                    className="bg-base-950 border border-white/10 rounded p-1.5 text-xs"
                    value={it.style}
                    onChange={(e) => updateItem(it.id, { style: e.target.value as ButtonStyle })}
                  >
                    {BUTTON_STYLES.map((s) => (
                      <option key={s} value={s}>
                        {s[0].toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                )}
                {it.kind === "button" && (
                  <button type="button" onClick={() => setOpenActionId(openActionId === it.id ? null : it.id)} className="text-[11px] text-neon-blue hover:underline shrink-0">
                    {it.action && it.action.type !== "none" ? "Edit action" : "+ Action"}
                  </button>
                )}
                <button type="button" onClick={() => removeItem(it.id)} className="text-slate-500 hover:text-rose-400 text-xs px-1 shrink-0">
                  ✕
                </button>
              </div>
              {it.kind === "button" && openActionId === it.id && (
                <ActionConfigEditor guildId={guildId} action={it.action} onChange={(next) => updateItem(it.id, { action: next })} allowedTypes={BUTTON_ACTION_TYPES} />
              )}
            </div>
          ))}
        </div>
      )}

      {row.type === "string" && (
        <div className="mb-2.5">
          <input
            className="w-full bg-base-900 border border-white/10 rounded-lg p-2 text-xs mb-2"
            placeholder="Placeholder text, e.g. Choose an option…"
            value={row.placeholder ?? ""}
            onChange={(e) => onChange({ ...row, placeholder: e.target.value })}
          />
          <div className="flex flex-col gap-2">
            {(row.options ?? []).map((opt, i) => (
              <div key={opt.id} className="bg-base-900 border border-white/10 rounded-lg p-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-600 w-5 shrink-0">{i + 1}.</span>
                  <input
                    className="bg-base-950 border border-white/10 rounded p-1.5 text-xs flex-1"
                    placeholder="Label"
                    maxLength={100}
                    value={opt.label}
                    onChange={(e) => updateOption(opt.id, { label: e.target.value })}
                  />
                  <button type="button" onClick={() => setOpenActionId(openActionId === opt.id ? null : opt.id)} className="text-[11px] text-neon-blue hover:underline shrink-0">
                    {opt.action && opt.action.type !== "none" ? "Edit action" : "+ Action"}
                  </button>
                  <button type="button" onClick={() => removeOption(opt.id)} className="text-slate-500 hover:text-rose-400 text-xs px-1 shrink-0">
                    ✕
                  </button>
                </div>
                {openActionId === opt.id && (
                  <ActionConfigEditor guildId={guildId} action={opt.action} onChange={(next) => updateOption(opt.id, { action: next })} allowedTypes={BUTTON_ACTION_TYPES} />
                )}
              </div>
            ))}
          </div>
          {(row.options?.length ?? 0) < 25 && (
            <button type="button" onClick={addOption} className="neon-button-sm mt-2">
              + Add Option
            </button>
          )}
          <button type="button" onClick={clearRow} className="text-slate-500 hover:text-rose-400 text-xs mt-2 ml-3">
            Remove menu
          </button>
        </div>
      )}

      {row.type && row.type !== "buttons" && row.type !== "string" && (
        <div className="mb-2.5">
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            <span className="text-[11px] font-semibold text-cyan-300 bg-cyan-500/10 px-2 py-1 rounded">{SELECT_LABELS[row.type]}</span>
            <input
              className="flex-1 min-w-[160px] bg-base-900 border border-white/10 rounded-lg p-2 text-xs"
              placeholder="Placeholder text, e.g. Choose an option…"
              value={row.placeholder ?? ""}
              onChange={(e) => onChange({ ...row, placeholder: e.target.value })}
            />
            <button type="button" onClick={clearRow} className="text-slate-500 hover:text-rose-400 text-xs">
              ✕
            </button>
          </div>

          {row.type === "role" && (
            <>
              <label className="text-[11px] text-slate-500 block mb-1.5">Default role (optional — pre-selects it in the picker)</label>
              <RoleSelect guildId={guildId} value={row.defaultValueId ?? null} onChange={(id) => onChange({ ...row, defaultValueId: id })} placeholder="No default" />
              <p className="text-[11px] text-slate-600 mt-1.5">Clicking a role here always assigns it to whoever picks it — that's the whole point of a role menu, so there's no separate action to configure.</p>
            </>
          )}

          {row.type === "channel" && (
            <>
              <label className="text-[11px] text-slate-500 block mb-1.5">Default channel (optional — pre-selects it in the picker)</label>
              <ChannelSelect guildId={guildId} value={row.defaultValueId ?? null} onChange={(id) => onChange({ ...row, defaultValueId: id })} kind="text" placeholder="No default" />
              <ActionConfigEditor guildId={guildId} action={row.action} onChange={(next) => onChange({ ...row, action: next })} allowedTypes={CHANNEL_ACTION_TYPES} />
            </>
          )}

          {row.type === "user" && (
            <ActionConfigEditor guildId={guildId} action={row.action} onChange={(next) => onChange({ ...row, action: next })} allowedTypes={USER_ACTION_TYPES} />
          )}

          {row.type === "user_role" && (
            <>
              <ActionConfigEditor guildId={guildId} action={row.action} onChange={(next) => onChange({ ...row, action: next })} allowedTypes={USER_ACTION_TYPES} />
              <p className="text-[11px] text-slate-600 mt-1.5">Applies when a member is picked. If a role gets picked instead, it's assigned to whoever made the pick.</p>
            </>
          )}
        </div>
      )}

      {canAddMore && (
        <div className="relative inline-block">
          <button type="button" onClick={() => setDropdownOpen((o) => !o)} className="neon-button-sm">
            + Add
          </button>
          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="absolute bottom-full left-0 mb-1.5 bg-base-950 border border-white/10 rounded-lg p-1.5 min-w-[190px] shadow-xl z-20">
                {dropdownOptions.map((t) => (
                  <div key={t.key} onClick={() => addComponent(t.key)} className="px-3 py-2 rounded text-xs text-slate-200 hover:bg-base-800 cursor-pointer">
                    {t.label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
