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
  type RolePanelRow,
  type JoinRoleRow,
  type DiscordChannelOption,
  type DiscordRoleOption,
} from "../../../../lib/api";
import type { EmbedExtra } from "../../../../lib/embedExtra";

type PageTab = "panels" | "join-roles";
type Layout = "REACTIONS" | "BUTTONS" | "DROPDOWN";

// One merged item shape for the Active list, regardless of which of the two
// underlying tables (ReactionRolePanel or RolePanel) it actually lives in —
// this is the seam that makes the two old separate tabs feel like one
// feature everywhere except the two API calls at the very edges (save/remove).
interface MergedPanel {
  source: "reaction" | "panel";
  id: string;
  name: string;
  channelId: string;
  layout: Layout;
  mappingCount: number;
  messageId: string | null;
}

interface PanelDraft {
  name: string;
  description: string;
  channelId: string | null;
  layout: Layout;
  embedEnabled: boolean;
  embedColor: string;
  embedExtra: EmbedExtra;
  reactionOptions: Array<{ emoji: string; roleId: string }>;
  buttonOptions: Array<{ roleId: string; label: string; emoji?: string }>;
}

const EMPTY_DRAFT: PanelDraft = {
  name: "",
  description: "",
  channelId: null,
  layout: "REACTIONS",
  embedEnabled: false,
  embedColor: "#5865F2",
  embedExtra: {},
  reactionOptions: [],
  buttonOptions: [],
};

export default function ReactionRolesPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const [tab, setTab] = useState<PageTab>("panels");

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="REACTION_ROLES"
        title="Reaction Roles"
        description="Self-assignable roles — react to a message, click a button, or pick from a dropdown, all from one panel type. Plus roles granted automatically on join."
      />

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("panels")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "panels" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Panels
        </button>
        <button
          onClick={() => setTab("join-roles")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "join-roles" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Join Roles
        </button>
      </div>

      {tab === "panels" && <PanelsTab guildId={guildId} />}
      {tab === "join-roles" && <JoinRolesTab guildId={guildId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels — one unified flow covering reaction, button, and dropdown panels
// ---------------------------------------------------------------------------

function draftFromReactionPanel(p: ReactionRolePanelRow): PanelDraft {
  return {
    name: p.title ?? "",
    description: p.description ?? "",
    channelId: p.channelId,
    layout: "REACTIONS",
    embedEnabled: p.embedEnabled,
    embedColor: p.embedColor ?? "#5865F2",
    embedExtra: p.embedExtra ?? {},
    reactionOptions: p.options.map((o) => ({ emoji: o.emoji, roleId: o.roleId })),
    buttonOptions: [],
  };
}

function draftFromRolePanel(p: RolePanelRow): PanelDraft {
  return {
    name: p.name,
    description: p.description ?? "",
    channelId: p.channelId,
    layout: p.layout,
    embedEnabled: p.embedEnabled,
    embedColor: p.embedColor ?? "#5865F2",
    embedExtra: p.embedExtra ?? {},
    reactionOptions: [],
    buttonOptions: p.options,
  };
}

function PanelFields({
  guildId,
  draft,
  onChange,
}: {
  guildId: string;
  draft: PanelDraft;
  onChange: (patch: Partial<PanelDraft>) => void;
}) {
  const [pickRoleId, setPickRoleId] = useState<string | null>(null);
  const [pickLabel, setPickLabel] = useState("");
  const [pickEmoji, setPickEmoji] = useState("");
  const [roleOptions, setRoleOptions] = useState<DiscordRoleOption[]>([]);

  useEffect(() => {
    api.getDiscordRoles(guildId).then(setRoleOptions);
  }, [guildId]);

  function roleLabel(id: string): string {
    return roleOptions.find((r) => r.id === id)?.name ?? id;
  }

  function addReactionOption() {
    if (!pickRoleId || !pickEmoji.trim()) return;
    if (draft.reactionOptions.some((o) => o.emoji === pickEmoji.trim())) return;
    onChange({ reactionOptions: [...draft.reactionOptions, { emoji: pickEmoji.trim(), roleId: pickRoleId }] });
    setPickRoleId(null);
    setPickEmoji("");
  }
  function removeReactionOption(emoji: string) {
    onChange({ reactionOptions: draft.reactionOptions.filter((o) => o.emoji !== emoji) });
  }

  function addButtonOption() {
    if (!pickRoleId || !pickLabel.trim()) return;
    onChange({ buttonOptions: [...draft.buttonOptions, { roleId: pickRoleId, label: pickLabel.trim(), emoji: pickEmoji.trim() || undefined }] });
    setPickRoleId(null);
    setPickLabel("");
    setPickEmoji("");
  }
  function removeButtonOption(roleId: string) {
    onChange({ buttonOptions: draft.buttonOptions.filter((o) => o.roleId !== roleId) });
  }

  return (
    <>
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
        Panel Name
        <Required />
      </label>
      <input
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
        placeholder="Pick your roles"
        value={draft.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Description</label>
      <textarea
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
        rows={2}
        placeholder="Click below to get a role."
        value={draft.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
        Post In Channel
        <Required />
      </label>
      <ChannelSelect guildId={guildId} value={draft.channelId} onChange={(id) => onChange({ channelId: id })} kind="text" />

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Layout</label>
      <select
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-1"
        value={draft.layout}
        onChange={(e) => onChange({ layout: e.target.value as Layout })}
      >
        <option value="REACTIONS">Emoji reactions</option>
        <option value="BUTTONS">Button grid (up to 5 roles)</option>
        <option value="DROPDOWN">Dropdown (up to 25 roles, multi-select)</option>
      </select>
      <p className="text-xs text-slate-600 mb-4">
        {draft.layout === "REACTIONS"
          ? "The bot posts the message and reacts to it with every emoji below — members react to get the role, un-react to remove it."
          : "Members click a button or pick from the dropdown to toggle a role."}
      </p>

      <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
        <span className="text-sm text-slate-300">Post as an embed</span>
        <input
          type="checkbox"
          className="h-5 w-9 accent-neon-blue"
          checked={draft.embedEnabled}
          onChange={(e) => onChange({ embedEnabled: e.target.checked })}
        />
      </div>

      {draft.embedEnabled && (
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Embed Color</label>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="color"
              className="h-9 w-12 rounded-lg border border-white/10 bg-base-950 cursor-pointer"
              value={draft.embedColor}
              onChange={(e) => onChange({ embedColor: e.target.value })}
            />
            <input
              className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
              value={draft.embedColor}
              onChange={(e) => onChange({ embedColor: e.target.value })}
            />
          </div>
          <EmbedExtraFields guildId={guildId} value={draft.embedExtra} onChange={(v) => onChange({ embedExtra: v })} />
        </div>
      )}

      {draft.layout === "REACTIONS" ? (
        <>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Emoji → Role
            <Required />
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {draft.reactionOptions.map((o) => (
              <span key={o.emoji} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10">
                {o.emoji} <span className="text-neon-blue">@{roleLabel(o.roleId)}</span>
                <button onClick={() => removeReactionOption(o.emoji)} className="text-slate-500 hover:text-rose-400">
                  ×
                </button>
              </span>
            ))}
            {draft.reactionOptions.length === 0 && <span className="text-xs text-slate-500">No mappings added yet.</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2 mb-4">
            <input
              className="w-20 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              placeholder="🎮"
              value={pickEmoji}
              onChange={(e) => setPickEmoji(e.target.value)}
            />
            <RoleSelect guildId={guildId} value={pickRoleId} onChange={setPickRoleId} />
            <button onClick={addReactionOption} disabled={!pickRoleId || !pickEmoji.trim()} className="neon-button-sm disabled:opacity-50">
              Add
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Roles
            <Required />
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {draft.buttonOptions.map((o) => (
              <span key={o.roleId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10">
                {o.emoji ? `${o.emoji} ` : ""}
                {o.label}
                <button onClick={() => removeButtonOption(o.roleId)} className="text-slate-500 hover:text-rose-400">
                  ×
                </button>
              </span>
            ))}
            {draft.buttonOptions.length === 0 && <span className="text-xs text-slate-500">No roles added yet.</span>}
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
              <button onClick={addButtonOption} disabled={!pickRoleId || !pickLabel.trim()} className="neon-button-sm disabled:opacity-50">
                Add
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function PanelsTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<"active" | "create">("active");
  const [reactionPanels, setReactionPanels] = useState<ReactionRolePanelRow[]>([]);
  const [rolePanels, setRolePanels] = useState<RolePanelRow[]>([]);
  const [channelOptions, setChannelOptions] = useState<DiscordChannelOption[]>([]);
  const [editing, setEditing] = useState<{ source: "reaction" | "panel"; id: string } | null>(null);
  const [form, setForm] = useState<PanelDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PanelDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function refresh() {
    api.getReactionRolePanels(guildId).then(setReactionPanels);
    api.getRolePanels(guildId).then(setRolePanels);
    api.getDiscordChannels(guildId).then((r) => setChannelOptions([...r.textChannels, ...r.voiceChannels]));
  }
  useEffect(refresh, [guildId]);

  function channelLabel(id: string): string {
    const c = channelOptions.find((c) => c.id === id);
    if (!c) return `#${id}`;
    return c.categoryName ? `${c.categoryName} / #${c.name}` : `#${c.name}`;
  }

  const merged: MergedPanel[] = [
    ...reactionPanels.map((p): MergedPanel => ({
      source: "reaction",
      id: p.id,
      name: p.title || "(untitled panel)",
      channelId: p.channelId,
      layout: "REACTIONS",
      mappingCount: p.options.length,
      messageId: p.messageId,
    })),
    ...rolePanels.map((p): MergedPanel => ({
      source: "panel",
      id: p.id,
      name: p.name,
      channelId: p.channelId,
      layout: p.layout,
      mappingCount: p.options.length,
      messageId: p.messageId,
    })),
  ];

  function layoutLabel(l: Layout): string {
    return l === "REACTIONS" ? "Emoji reactions" : l === "DROPDOWN" ? "Dropdown" : "Button grid";
  }

  function openEdit(m: MergedPanel) {
    setEditing({ source: m.source, id: m.id });
    if (m.source === "reaction") {
      const p = reactionPanels.find((r) => r.id === m.id);
      if (p) setForm(draftFromReactionPanel(p));
    } else {
      const p = rolePanels.find((r) => r.id === m.id);
      if (p) setForm(draftFromRolePanel(p));
    }
    setError(null);
  }

  function toApiPayload(d: PanelDraft) {
    if (d.layout === "REACTIONS") {
      return {
        channelId: d.channelId ?? "",
        title: d.name,
        description: d.description,
        embedEnabled: d.embedEnabled,
        embedColor: d.embedColor,
        embedExtra: d.embedExtra,
        options: d.reactionOptions,
      };
    }
    return {
      name: d.name,
      channelId: d.channelId ?? "",
      description: d.description,
      layout: d.layout,
      options: d.buttonOptions,
      embedEnabled: d.embedEnabled,
      embedColor: d.embedColor,
      embedExtra: d.embedExtra,
    };
  }

  function validate(d: PanelDraft): string | null {
    if (!d.name.trim()) return "Enter a panel name.";
    if (!d.channelId) return "Pick a channel to post this panel in.";
    if (d.layout === "REACTIONS" && d.reactionOptions.length === 0) return "Add at least one emoji/role mapping.";
    if (d.layout !== "REACTIONS" && d.buttonOptions.length === 0) return "Add at least one role.";
    return null;
  }

  async function saveEdit() {
    if (!editing) return;
    const validationError = validate(form);
    if (validationError) return setError(validationError);
    setError(null);
    try {
      if (editing.source === "reaction") {
        await api.updateReactionRolePanel(guildId, editing.id, toApiPayload(form) as never);
      } else {
        await api.updateRolePanel(guildId, editing.id, toApiPayload(form) as never);
      }
      setEditing(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save panel");
    }
  }

  async function createPanel() {
    const validationError = validate(draft);
    if (validationError) return setCreateError(validationError);
    setCreateError(null);
    setCreating(true);
    try {
      const payload = toApiPayload(draft);
      if (draft.layout === "REACTIONS") await api.addReactionRolePanel(guildId, payload as never);
      else await api.addRolePanel(guildId, payload as never);
      setDraft(EMPTY_DRAFT);
      setTab("active");
      refresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create panel");
    } finally {
      setCreating(false);
    }
  }

  async function remove(m: MergedPanel) {
    if (!(await confirm(`Delete the "${m.name}" panel? Its posted message will stop working.`))) return;
    if (m.source === "reaction") await api.deleteReactionRolePanel(guildId, m.id);
    else await api.deleteRolePanel(guildId, m.id);
    if (editing?.id === m.id) setEditing(null);
    refresh();
  }

  return (
    <div>
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setTab("active")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            tab === "active" ? "bg-base-800 border-neon-blue/40 text-neon-blue" : "bg-base-950 border-white/10 text-slate-400 hover:text-slate-200"
          }`}
        >
          Active Panels
        </button>
        <button
          onClick={() => {
            setDraft(EMPTY_DRAFT);
            setCreateError(null);
            setTab("create");
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            tab === "create" ? "bg-base-800 border-neon-blue/40 text-neon-blue" : "bg-base-950 border-white/10 text-slate-400 hover:text-slate-200"
          }`}
        >
          + Create New
        </button>
      </div>

      {tab === "active" &&
        (merged.length === 0 ? (
          <NeonCard className="max-w-lg">
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">No panels yet.</p>
              <p className="text-xs text-slate-600 mb-4">Create one to let members pick their own roles.</p>
              <button onClick={() => setTab("create")} className="neon-button-sm">
                + Create New
              </button>
            </div>
          </NeonCard>
        ) : (
          <div className="space-y-3 max-w-lg">
            {merged.map((m) => (
              <NeonCard key={`${m.source}:${m.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => (editing?.id === m.id ? setEditing(null) : openEdit(m))}>
                    <p className="font-medium truncate">{m.name}</p>
                    <p className="text-xs text-slate-500">
                      {channelLabel(m.channelId)} · {layoutLabel(m.layout)} · {m.mappingCount} mapping(s) · {m.messageId ? "posted" : "posting…"}
                    </p>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => (editing?.id === m.id ? setEditing(null) : openEdit(m))} className="text-xs text-slate-500 hover:text-neon-blue">
                      {editing?.id === m.id ? "Close" : "Edit"}
                    </button>
                    <button onClick={() => remove(m)} className="text-xs text-slate-500 hover:text-rose-400">
                      Remove
                    </button>
                  </div>
                </div>

                {editing?.id === m.id && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <PanelFields guildId={guildId} draft={form} onChange={(patch) => setForm({ ...form, ...patch })} />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="neon-button">
                        Save Changes
                      </button>
                    </div>
                    <FormError message={error} />
                  </div>
                )}
              </NeonCard>
            ))}
          </div>
        ))}

      {tab === "create" && (
        <NeonCard className="max-w-lg">
          <p className="font-medium mb-3">New Panel</p>
          <PanelFields guildId={guildId} draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          <button onClick={createPanel} disabled={creating} className="neon-button disabled:opacity-50">
            {creating ? "Creating…" : "Post Panel"}
          </button>
          <FormError message={createError} />
        </NeonCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Join Roles
// ---------------------------------------------------------------------------

function JoinRolesTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<JoinRoleRow[]>([]);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [roleOptions, setRoleOptions] = useState<DiscordRoleOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getJoinRoles(guildId).then(setRows);
    api.getDiscordRoles(guildId).then(setRoleOptions);
  }
  useEffect(refresh, [guildId]);

  function roleLabel(id: string): string {
    return roleOptions.find((r) => r.id === id)?.name ?? id;
  }

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
            <span className="text-neon-blue">@{roleLabel(r.roleId)}</span>
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
