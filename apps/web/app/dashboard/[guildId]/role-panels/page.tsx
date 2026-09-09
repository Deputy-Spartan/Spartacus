"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type RolePanelLayout, type RolePanelOption, type RolePanelRow } from "../../../../lib/api";

const EMPTY_PANEL: Partial<RolePanelRow> = {
  name: "Pick your roles",
  channelId: "",
  description: "",
  layout: "BUTTONS",
  options: [],
};

export default function RolePanelsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [panels, setPanels] = useState<RolePanelRow[]>([]);
  const [editing, setEditing] = useState<Partial<RolePanelRow> | null>(null);
  const [pickRoleId, setPickRoleId] = useState<string | null>(null);
  const [pickLabel, setPickLabel] = useState("");
  const [pickEmoji, setPickEmoji] = useState("");

  function refresh() {
    api.getRolePanels(params.guildId).then(setPanels);
  }
  useEffect(refresh, [params.guildId]);

  function addOption() {
    if (!editing || !pickRoleId || !pickLabel.trim()) return;
    const option: RolePanelOption = { roleId: pickRoleId, label: pickLabel.trim(), emoji: pickEmoji.trim() || undefined };
    setEditing({ ...editing, options: [...(editing.options ?? []), option] });
    setPickRoleId(null);
    setPickLabel("");
    setPickEmoji("");
  }

  function removeOption(roleId: string) {
    if (!editing) return;
    setEditing({ ...editing, options: (editing.options ?? []).filter((o) => o.roleId !== roleId) });
  }

  async function save() {
    if (!editing?.name || !editing.channelId || !editing.options?.length) return;
    if (editing.id) await api.updateRolePanel(params.guildId, editing.id, editing);
    else await api.addRolePanel(params.guildId, editing);
    setEditing(null);
    refresh();
  }

  async function remove(id: string, name: string) {
    if (!(await confirm(`Delete the "${name}" role panel? Its posted message will stop working.`))) return;
    await api.deleteRolePanel(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="ROLE_PANELS"
        title="Role Panels"
        description="Button or dropdown panels members click to self-assign roles — a more modern alternative to reaction roles."
      />

      <div className="flex justify-end mb-4">
        <button onClick={() => setEditing({ ...EMPTY_PANEL })} className="neon-button-sm">
          + New panel
        </button>
      </div>

      {editing && (
        <NeonCard className="max-w-lg mb-6">
          <p className="font-medium mb-3">{editing.id ? "Edit Panel" : "New Panel"}</p>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Panel Name</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={editing.name ?? ""}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Description</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            rows={2}
            value={editing.description ?? ""}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Post In Channel</label>
          <ChannelSelect guildId={params.guildId} value={editing.channelId ?? null} onChange={(id) => setEditing({ ...editing, channelId: id })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Layout</label>
          <select
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={editing.layout ?? "BUTTONS"}
            onChange={(e) => setEditing({ ...editing, layout: e.target.value as RolePanelLayout })}
          >
            <option value="BUTTONS">Button grid (up to 5 roles)</option>
            <option value="DROPDOWN">Dropdown (up to 25 roles, multi-select)</option>
          </select>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Roles</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {(editing.options ?? []).map((o) => (
              <span key={o.roleId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10">
                {o.emoji ? `${o.emoji} ` : ""}
                {o.label}
                <button onClick={() => removeOption(o.roleId)} className="text-slate-500 hover:text-rose-400">
                  ×
                </button>
              </span>
            ))}
            {(editing.options ?? []).length === 0 && <span className="text-xs text-slate-500">No roles added yet.</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 mb-4">
            <RoleSelect guildId={params.guildId} value={pickRoleId} onChange={setPickRoleId} />
            <input
              className="bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              placeholder="Button label"
              value={pickLabel}
              onChange={(e) => setPickLabel(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="w-16 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                placeholder="🎮"
                value={pickEmoji}
                onChange={(e) => setPickEmoji(e.target.value)}
              />
              <button onClick={addOption} disabled={!pickRoleId || !pickLabel.trim()} className="neon-button-sm disabled:opacity-50">
                Add
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={!editing.name || !editing.channelId || !editing.options?.length} className="neon-button disabled:opacity-50">
              Post Panel
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </button>
          </div>
        </NeonCard>
      )}

      <NeonCard className="max-w-lg">
        {panels.length === 0 ? (
          <p className="text-sm text-slate-500">No role panels yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {panels.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    #{p.channelId.slice(0, 6)} · {p.layout === "DROPDOWN" ? "Dropdown" : "Button grid"} · {p.options.length} role(s)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditing(p)} className="text-xs text-slate-500 hover:text-neon-blue">
                    Edit
                  </button>
                  <button onClick={() => remove(p.id, p.name)} className="text-slate-500 hover:text-rose-400 text-xs">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </NeonCard>
    </div>
  );
}
