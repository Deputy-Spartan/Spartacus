"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { EmbedFields } from "../../../../components/ui/EmbedFields";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { StickyPreview } from "../../../../components/ui/StickyPreview";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api, type CustomCommand } from "../../../../lib/api";

type CommandForm = Omit<CustomCommand, "id">;

const EMPTY_FORM: CommandForm = {
  trigger: "",
  response: "",
  embedEnabled: false,
  embedTitle: null,
  embedColor: "#5865F2",
  buttons: [],
  embedExtra: {},
};

export default function CommandsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CommandForm>(EMPTY_FORM);
  const [showEditor, setShowEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getCommands(params.guildId).then(setCommands);
  }
  useEffect(refresh, [params.guildId]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowEditor(true);
  }

  function startEdit(c: CustomCommand) {
    setEditingId(c.id);
    setForm({ trigger: c.trigger, response: c.response, embedEnabled: c.embedEnabled, embedTitle: c.embedTitle, embedColor: c.embedColor ?? "#5865F2", buttons: c.buttons, embedExtra: c.embedExtra ?? {} });
    setError(null);
    setShowEditor(true);
  }

  async function save() {
    if (!form.trigger || !form.response) {
      setError("Enter a trigger and a response before saving.");
      return;
    }
    setError(null);
    const body = {
      response: form.response,
      embedEnabled: form.embedEnabled,
      embedTitle: form.embedTitle,
      embedColor: form.embedColor,
      buttons: form.buttons,
      embedExtra: form.embedExtra,
    };
    if (editingId) {
      await api.updateCommand(params.guildId, editingId, body);
    } else {
      await api.addCommand(params.guildId, form.trigger.replace(/^!/, ""), body);
    }
    setShowEditor(false);
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Delete this custom command?"))) return;
    await api.deleteCommand(params.guildId, id);
    if (editingId === id) setShowEditor(false);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="CUSTOM_COMMANDS"
        title="Custom Commands"
        description="Text triggers the bot responds to instantly, e.g. !socials."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <NeonCard>
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium">Commands</p>
            <button onClick={startCreate} className="neon-button-sm">
              + New Command
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {commands.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                <div className="min-w-0">
                  <span className="text-neon-blue font-medium block">!{c.trigger}</span>
                  <span className="text-slate-500 text-xs truncate block">{c.embedTitle || c.response}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => startEdit(c)} className="text-slate-500 hover:text-neon-blue text-xs">
                    Edit
                  </button>
                  <button onClick={() => remove(c.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {commands.length === 0 && <p className="text-sm text-slate-500 py-2">No custom commands yet.</p>}
          </div>
        </NeonCard>

        {showEditor && (
          <NeonCard>
            <div className="flex items-center justify-between mb-3">
              <p className="font-medium">{editingId ? "Edit Command" : "New Command"}</p>
              <button onClick={() => setShowEditor(false)} className="text-slate-500 hover:text-slate-300 text-xs">
                Close
              </button>
            </div>

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
              Trigger
              <Required />
            </label>
            <input
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 disabled:opacity-50"
              placeholder="!trigger"
              value={form.trigger}
              disabled={!!editingId}
              onChange={(e) => setForm({ ...form, trigger: e.target.value })}
            />
            {editingId && <p className="text-xs text-slate-600 -mt-3 mb-4">Trigger can't be changed once created.</p>}

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
              {form.embedEnabled ? "Embed Description" : "Response"}
              <Required />
            </label>
            <textarea
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 min-h-20"
              placeholder="Response text…"
              value={form.response}
              onChange={(e) => setForm({ ...form, response: e.target.value })}
            />

            <EmbedFields
              guildId={params.guildId}
              embedEnabled={form.embedEnabled}
              embedTitle={form.embedTitle ?? ""}
              embedColor={form.embedColor ?? "#5865F2"}
              buttons={form.buttons}
              onChange={(next) => setForm({ ...form, ...next })}
            />

            <EmbedExtraFields
              value={form.embedExtra ?? {}}
              onChange={(v) => setForm({ ...form, embedExtra: v })}
            />

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Preview</label>
            <div className="mb-4">
              <StickyPreview
                content={form.response}
                embedEnabled={form.embedEnabled}
                embedTitle={form.embedTitle ?? ""}
                embedDescription={form.response}
                embedColor={form.embedColor ?? "#5865F2"}
                buttons={form.buttons}
              />
            </div>

            <button onClick={save} className="neon-button">
              {editingId ? "Save Changes" : "Create Command"}
            </button>
            <FormError message={error} />
          </NeonCard>
        )}
      </div>
    </div>
  );
}
