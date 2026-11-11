"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../ui/NeonCard";
import { StickyPreview } from "../ui/StickyPreview";
import { SavedEmbedPreview } from "../embedCreator/SavedEmbedPreview";
import { SavedEmbedPicker } from "../embedCreator/SavedEmbedPicker";
import { useConfirm } from "../ui/ConfirmDialog";
import { Required } from "../ui/Required";
import { FormError } from "../ui/FormError";
import { api, type CustomCommand } from "../../lib/api";

type Tab = "active" | "create";

type CommandForm = Omit<CustomCommand, "id">;

const EMPTY_FORM: CommandForm = {
  trigger: "",
  response: "",
  embedEnabled: false,
  embedTitle: null,
  embedColor: "#5865F2",
  buttons: [],
  embedExtra: {},
  savedEmbedId: null,
};

// The full field set — shared by the Active tab's inline editor and the
// Create tab's fresh draft, wired to whichever value/onChange the caller
// passes in.
function CommandFields({
  guildId,
  value,
  onChange,
  editing,
}: {
  guildId: string;
  value: CommandForm;
  onChange: (patch: Partial<CommandForm>) => void;
  editing: boolean;
}) {
  return (
    <>
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
        Trigger
        <Required />
      </label>
      <input
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 disabled:opacity-50"
        placeholder="!trigger"
        value={value.trigger}
        disabled={editing}
        onChange={(e) => onChange({ trigger: e.target.value })}
      />
      {editing && <p className="text-xs text-slate-600 -mt-3 mb-4">Trigger can't be changed once created.</p>}

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
        Response
        <Required />
      </label>
      <textarea
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 min-h-20"
        placeholder="Response text…"
        value={value.response}
        onChange={(e) => onChange({ response: e.target.value })}
      />

      <SavedEmbedPicker guildId={guildId} value={value.savedEmbedId ?? null} onChange={(id) => onChange({ savedEmbedId: id })} />

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Preview</label>
      <div className="mb-4">
        {/* Same message as apps/bot/src/events/messageCreate.ts sends for the command. */}
        {value.savedEmbedId ? (
          <SavedEmbedPreview guildId={guildId} savedEmbedId={value.savedEmbedId} />
        ) : (
          <StickyPreview
            content={value.embedEnabled ? "" : value.response}
            embedEnabled={!!value.embedEnabled}
            embedTitle={value.embedTitle ?? ""}
            embedDescription={value.response}
            embedColor={value.embedColor ?? "#5865F2"}
            buttons={value.buttons ?? []}
            embedExtra={value.embedExtra ?? {}}
          />
        )}
      </div>
    </>
  );
}

// The !text triggers part of Custom Commands (a tab of the page).
export function TextTriggers({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CommandForm>(EMPTY_FORM);
  const [draft, setDraft] = useState<CommandForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  function refresh() {
    api.getCommands(guildId).then(setCommands);
  }
  useEffect(refresh, [guildId]);

  function openEdit(c: CustomCommand) {
    setEditingId(c.id);
    setForm({ trigger: c.trigger, response: c.response, embedEnabled: c.embedEnabled, embedTitle: c.embedTitle, embedColor: c.embedColor ?? "#5865F2", buttons: c.buttons, embedExtra: c.embedExtra ?? {}, savedEmbedId: c.savedEmbedId ?? null });
    setError(null);
  }

  async function saveEdit() {
    if (!form.trigger || !form.response) {
      setError("Enter a trigger and a response before saving.");
      return;
    }
    if (!editingId) return;
    setError(null);
    const body = {
      response: form.response,
      embedEnabled: form.embedEnabled,
      embedTitle: form.embedTitle,
      embedColor: form.embedColor,
      buttons: form.buttons,
      embedExtra: form.embedExtra,
      savedEmbedId: form.savedEmbedId,
    };
    await api.updateCommand(guildId, editingId, body);
    setEditingId(null);
    refresh();
  }

  async function createCommand() {
    if (!draft.trigger || !draft.response) {
      setCreateError("Enter a trigger and a response before saving.");
      return;
    }
    setCreateError(null);
    const body = {
      response: draft.response,
      embedEnabled: draft.embedEnabled,
      embedTitle: draft.embedTitle,
      embedColor: draft.embedColor,
      buttons: draft.buttons,
      embedExtra: draft.embedExtra,
      savedEmbedId: draft.savedEmbedId,
    };
    await api.addCommand(guildId, draft.trigger.replace(/^!/, ""), body);
    setDraft(EMPTY_FORM);
    setTab("active");
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Delete this custom command?"))) return;
    await api.deleteCommand(guildId, id);
    if (editingId === id) setEditingId(null);
    refresh();
  }

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Active Commands
        </button>
        <button
          onClick={() => {
            setDraft(EMPTY_FORM);
            setCreateError(null);
            setTab("create");
          }}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "create" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          + Create New
        </button>
      </div>

      {tab === "active" &&
        (commands.length === 0 ? (
          <NeonCard>
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">No custom commands yet.</p>
              <p className="text-xs text-slate-600 mb-4">Create one for a text trigger the bot responds to instantly.</p>
              <button onClick={() => setTab("create")} className="neon-button-sm">
                + Create New
              </button>
            </div>
          </NeonCard>
        ) : (
          <div className="space-y-3">
            {commands.map((c) => (
              <NeonCard key={c.id}>
                <div className="flex items-center justify-between gap-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => (editingId === c.id ? setEditingId(null) : openEdit(c))}>
                    <span className="text-neon-blue font-medium block">!{c.trigger}</span>
                    <span className="text-slate-500 text-xs truncate block">{c.embedTitle || c.response}</span>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => (editingId === c.id ? setEditingId(null) : openEdit(c))} className="text-xs text-slate-500 hover:text-neon-blue">
                      {editingId === c.id ? "Close" : "Edit"}
                    </button>
                    <button onClick={() => remove(c.id)} className="text-xs text-slate-500 hover:text-rose-400">
                      Remove
                    </button>
                  </div>
                </div>

                {editingId === c.id && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <CommandFields guildId={guildId} value={form} onChange={(patch) => setForm({ ...form, ...patch })} editing />
                    <button onClick={saveEdit} className="neon-button">
                      Save Changes
                    </button>
                    <FormError message={error} />
                  </div>
                )}
              </NeonCard>
            ))}
          </div>
        ))}

      {tab === "create" && (
        <NeonCard>
          <p className="font-medium mb-3">New Command</p>
          <CommandFields guildId={guildId} value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} editing={false} />
          <button onClick={createCommand} className="neon-button">
            Create Command
          </button>
          <FormError message={createError} />
        </NeonCard>
      )}
    </div>
  );
}
