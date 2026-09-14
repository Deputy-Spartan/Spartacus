"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import {
  api,
  type ReactionRolePanelRow,
  type ReactionRolePanelInput,
  type RolePanelLayout,
  type RolePanelOption,
  type RolePanelRow,
  type JoinRoleRow,
  type DiscordChannelOption,
  type DiscordRoleOption,
} from "../../../../lib/api";

type Tab = "reaction-roles" | "role-panels" | "join-roles";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "reaction-roles", label: "Reaction Roles" },
  { key: "role-panels", label: "Role Panels" },
  { key: "join-roles", label: "Join Roles" },
];

export default function ReactionRolesPage({ params }: { params: { guildId: string } }) {
  const [tab, setTab] = useState<Tab>("reaction-roles");

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="REACTION_ROLES"
        title="Reaction Roles"
        description="Self-assignable roles — react to a message, click a button, pick from a dropdown, or get one automatically on join."
      />

      <div className="flex gap-1 mb-4 border-b border-white/5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "px-4 py-2 text-sm border-b-2 transition-colors",
              tab === t.key ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "reaction-roles" && <ReactionRolesTab guildId={params.guildId} />}
      {tab === "role-panels" && <RolePanelsTab guildId={params.guildId} />}
      {tab === "join-roles" && <JoinRolesTab guildId={params.guildId} />}
    </div>
  );
}

const EMPTY_PANEL: ReactionRolePanelInput = {
  channelId: "",
  title: "",
  description: "",
  embedEnabled: false,
  embedColor: "#5865F2",
  embedExtra: {},
  options: [],
};

function ReactionRolesTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [panels, setPanels] = useState<ReactionRolePanelRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ReactionRolePanelInput>(EMPTY_PANEL);
  const [pickRoleId, setPickRoleId] = useState<string | null>(null);
  const [pickEmoji, setPickEmoji] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelOptions, setChannelOptions] = useState<DiscordChannelOption[]>([]);
  const [roleOptions, setRoleOptions] = useState<DiscordRoleOption[]>([]);

  function refresh() {
    api.getReactionRolePanels(guildId).then(setPanels);
    api.getDiscordChannels(guildId).then((r) => setChannelOptions([...r.textChannels, ...r.voiceChannels]));
    api.getDiscordRoles(guildId).then(setRoleOptions);
  }
  useEffect(refresh, [guildId]);

  function channelLabel(id: string): string {
    const c = channelOptions.find((c) => c.id === id);
    if (!c) return `#${id}`;
    return c.categoryName ? `${c.categoryName} / #${c.name}` : `#${c.name}`;
  }
  function roleLabel(id: string): string {
    return roleOptions.find((r) => r.id === id)?.name ?? id;
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_PANEL);
    setError(null);
    setShowEditor(true);
  }
  function startEdit(p: ReactionRolePanelRow) {
    setEditingId(p.id);
    setForm({
      channelId: p.channelId,
      title: p.title ?? "",
      description: p.description ?? "",
      embedEnabled: p.embedEnabled,
      embedColor: p.embedColor ?? "#5865F2",
      embedExtra: p.embedExtra ?? {},
      options: p.options.map((o) => ({ emoji: o.emoji, roleId: o.roleId })),
    });
    setError(null);
    setShowEditor(true);
  }

  function addOption() {
    if (!pickRoleId || !pickEmoji.trim()) return;
    if (form.options.some((o) => o.emoji === pickEmoji.trim())) {
      setError("That emoji is already used in this panel.");
      return;
    }
    setForm({ ...form, options: [...form.options, { emoji: pickEmoji.trim(), roleId: pickRoleId }] });
    setPickRoleId(null);
    setPickEmoji("");
    setError(null);
  }
  function removeOption(emoji: string) {
    setForm({ ...form, options: form.options.filter((o) => o.emoji !== emoji) });
  }

  async function save() {
    if (!form.channelId || form.options.length === 0) {
      setError("Pick a channel and add at least one emoji/role pair before posting.");
      return;
    }
    setError(null);
    try {
      if (editingId) await api.updateReactionRolePanel(guildId, editingId, form);
      else await api.addReactionRolePanel(guildId, form);
      setShowEditor(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save panel");
    }
  }

  async function remove(id: string) {
    if (!(await confirm("Delete this reaction role panel? Its posted message will stop working."))) return;
    await api.deleteReactionRolePanel(guildId, id);
    refresh();
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={startCreate} className="neon-button-sm">
          + New Panel
        </button>
      </div>

      {showEditor && (
        <NeonCard className="max-w-lg mb-6">
          <p className="font-medium mb-3">{editingId ? "Edit Panel" : "New Reaction Role Panel"}</p>
          <p className="text-xs text-slate-500 mb-4">
            The bot posts this message itself and reacts to it with every emoji below — members react to get the role, and
            it's removed if they un-react.
          </p>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Post In Channel
            <Required />
          </label>
          <ChannelSelect guildId={guildId} value={form.channelId || null} onChange={(id) => setForm({ ...form, channelId: id })} kind="text" />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-2">Title</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            placeholder="Pick your roles"
            value={form.title ?? ""}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Description</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            rows={2}
            placeholder="React below to get a role."
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
            <span className="text-sm text-slate-300">Post as an embed</span>
            <input
              type="checkbox"
              className="h-5 w-9 accent-neon-blue"
              checked={!!form.embedEnabled}
              onChange={(e) => setForm({ ...form, embedEnabled: e.target.checked })}
            />
          </div>

          {form.embedEnabled && (
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="color"
                  className="h-9 w-12 rounded-lg border border-white/10 bg-base-950 cursor-pointer"
                  value={form.embedColor ?? "#5865F2"}
                  onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
                />
                <input
                  className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
                  value={form.embedColor ?? "#5865F2"}
                  onChange={(e) => setForm({ ...form, embedColor: e.target.value })}
                />
              </div>
              <EmbedExtraFields value={form.embedExtra ?? {}} onChange={(v) => setForm({ ...form, embedExtra: v })} />
            </div>
          )}

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Emoji → Role
            <Required />
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {form.options.map((o) => (
              <span key={o.emoji} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10">
                {o.emoji} <span className="text-neon-blue">@{roleLabel(o.roleId)}</span>
                <button onClick={() => removeOption(o.emoji)} className="text-slate-500 hover:text-rose-400">
                  ×
                </button>
              </span>
            ))}
            {form.options.length === 0 && <span className="text-xs text-slate-500">No mappings added yet.</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2 mb-4">
            <input
              className="w-20 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              placeholder="🎮"
              value={pickEmoji}
              onChange={(e) => setPickEmoji(e.target.value)}
            />
            <RoleSelect guildId={guildId} value={pickRoleId} onChange={setPickRoleId} />
            <button onClick={addOption} disabled={!pickRoleId || !pickEmoji.trim()} className="neon-button-sm disabled:opacity-50">
              Add
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={save} className="neon-button">
              {editingId ? "Save Changes" : "Post Panel"}
            </button>
            <button onClick={() => setShowEditor(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </button>
          </div>
          <FormError message={error} />
        </NeonCard>
      )}

      <NeonCard className="max-w-lg">
        {panels.length === 0 ? (
          <p className="text-sm text-slate-500">No reaction role panels yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {panels.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">{p.title || "(untitled panel)"}</p>
                  <p className="text-xs text-slate-500">
                    {channelLabel(p.channelId)} · {p.embedEnabled ? "Embed" : "Plain text"} · {p.options.length} mapping(s) ·{" "}
                    {p.messageId ? "posted" : "posting…"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => startEdit(p)} className="text-xs text-slate-500 hover:text-neon-blue">
                    Edit
                  </button>
                  <button onClick={() => remove(p.id)} className="text-slate-500 hover:text-rose-400 text-xs">
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

const EMPTY_ROLE_PANEL: Partial<RolePanelRow> = {
  name: "Pick your roles",
  channelId: "",
  description: "",
  layout: "BUTTONS",
  options: [],
};

function RolePanelsTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [panels, setPanels] = useState<RolePanelRow[]>([]);
  const [editing, setEditing] = useState<Partial<RolePanelRow> | null>(null);
  const [pickRoleId, setPickRoleId] = useState<string | null>(null);
  const [pickLabel, setPickLabel] = useState("");
  const [pickEmoji, setPickEmoji] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [channelOptions, setChannelOptions] = useState<DiscordChannelOption[]>([]);

  function refresh() {
    api.getRolePanels(guildId).then(setPanels);
    api.getDiscordChannels(guildId).then((r) => setChannelOptions([...r.textChannels, ...r.voiceChannels]));
  }
  useEffect(refresh, [guildId]);

  function channelLabel(id: string): string {
    const c = channelOptions.find((c) => c.id === id);
    if (!c) return `#${id}`;
    return c.categoryName ? `${c.categoryName} / #${c.name}` : `#${c.name}`;
  }

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
    if (!editing?.name || !editing.channelId || !editing.options?.length) {
      setError("Enter a panel name, pick a channel, and add at least one role before posting.");
      return;
    }
    setError(null);
    if (editing.id) await api.updateRolePanel(guildId, editing.id, editing);
    else await api.addRolePanel(guildId, editing);
    setEditing(null);
    refresh();
  }

  async function remove(id: string, name: string) {
    if (!(await confirm(`Delete the "${name}" role panel? Its posted message will stop working.`))) return;
    await api.deleteRolePanel(guildId, id);
    refresh();
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => { setError(null); setEditing({ ...EMPTY_ROLE_PANEL }); }} className="neon-button-sm">
          + New panel
        </button>
      </div>

      {editing && (
        <NeonCard className="max-w-lg mb-6">
          <p className="font-medium mb-3">{editing.id ? "Edit Panel" : "New Panel"}</p>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Panel Name
            <Required />
          </label>
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

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Post In Channel
            <Required />
          </label>
          <ChannelSelect guildId={guildId} value={editing.channelId ?? null} onChange={(id) => setEditing({ ...editing, channelId: id })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Layout</label>
          <select
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={editing.layout ?? "BUTTONS"}
            onChange={(e) => setEditing({ ...editing, layout: e.target.value as RolePanelLayout })}
          >
            <option value="BUTTONS">Button grid (up to 5 roles)</option>
            <option value="DROPDOWN">Dropdown (up to 25 roles, multi-select)</option>
          </select>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Roles
            <Required />
          </label>
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
            <RoleSelect guildId={guildId} value={pickRoleId} onChange={setPickRoleId} />
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
          <FormError message={error} />
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
                    {channelLabel(p.channelId)} · {p.layout === "DROPDOWN" ? "Dropdown" : "Button grid"} · {p.options.length} role(s)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => { setError(null); setEditing(p); }} className="text-xs text-slate-500 hover:text-neon-blue">
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

function JoinRolesTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<JoinRoleRow[]>([]);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getJoinRoles(guildId).then(setRows);
  }
  useEffect(refresh, [guildId]);

  async function add() {
    if (!roleId) {
      setError("Select a role before adding.");
      return;
    }
    setError(null);
    await api.addJoinRole(guildId, roleId);
    setRoleId(null);
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Remove this join role?"))) return;
    await api.deleteJoinRole(guildId, id);
    refresh();
  }

  return (
    <NeonCard className="max-w-lg">
      <p className="font-medium mb-1">Auto-Assigned Roles</p>
      <p className="text-xs text-slate-500 mb-3">Roles the bot grants automatically the moment a member joins.</p>
      {rows.length === 0 && <p className="text-sm text-slate-500 mb-4">No join roles configured yet.</p>}
      <div className="divide-y divide-white/5 mb-4">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-neon-blue">@ role {r.roleId}</span>
            <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs">
              Remove
            </button>
          </div>
        ))}
      </div>

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
        Role
        <Required />
      </label>
      <RoleSelect guildId={guildId} value={roleId} onChange={setRoleId} />
      <button onClick={add} className="neon-button">
        Add Role
      </button>
      <FormError message={error} />
    </NeonCard>
  );
}
