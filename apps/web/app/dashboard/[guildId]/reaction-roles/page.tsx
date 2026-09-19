"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { EmojiPicker } from "../../../../components/ui/EmojiPicker";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
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

interface PanelOption {
  emoji: string;
  label: string;
  roleIds: string[];
  channelIds: string[];
}

interface PanelDraft {
  name: string;
  description: string;
  channelId: string | null;
  layout: Layout;
  savedEmbedId: string | null;
  options: PanelOption[];
}

const EMPTY_DRAFT: PanelDraft = {
  name: "",
  description: "",
  channelId: null,
  layout: "REACTIONS",
  savedEmbedId: null,
  options: [],
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
    savedEmbedId: p.savedEmbedId ?? null,
    options: p.options.map((o) => ({
      emoji: o.emoji,
      label: "",
      roleIds: [o.roleId, ...(o.extraRoleIds ?? [])].filter(Boolean),
      channelIds: o.channelIds ?? [],
    })),
  };
}

function draftFromRolePanel(p: RolePanelRow): PanelDraft {
  return {
    name: p.name,
    description: p.description ?? "",
    channelId: p.channelId,
    layout: p.layout,
    savedEmbedId: p.savedEmbedId ?? null,
    options: p.options.map((o) => ({
      emoji: o.emoji ?? "",
      label: o.label,
      roleIds: [...(o.roleIds ?? []), ...(o.roleId ? [o.roleId] : [])],
      channelIds: o.channelIds ?? [],
    })),
  };
}

// Chips for what is already chosen plus a dropdown to add another.
function MultiPick({
  label,
  items,
  chosen,
  onChange,
  prefix,
}: {
  label: string;
  items: Array<{ id: string; name: string }>;
  chosen: string[];
  onChange: (ids: string[]) => void;
  prefix: string;
}) {
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  return (
    <div className="mb-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {chosen.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-base-800 border border-white/10 text-neon-blue">
            {prefix}
            {nameOf(id)}
            <button type="button" onClick={() => onChange(chosen.filter((c) => c !== id))} className="text-slate-500 hover:text-rose-400">
              ×
            </button>
          </span>
        ))}
        {chosen.length === 0 && <span className="text-xs text-slate-600">None</span>}
      </div>
      <select
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-sm"
        value=""
        onChange={(e) => e.target.value && onChange([...chosen, e.target.value])}
      >
        <option value="">Add…</option>
        {items
          .filter((i) => !chosen.includes(i.id))
          .map((i) => (
            <option key={i.id} value={i.id}>
              {prefix}
              {i.name}
            </option>
          ))}
      </select>
    </div>
  );
}

const EMPTY_OPTION: PanelOption = { emoji: "", label: "", roleIds: [], channelIds: [] };

function PanelFields({
  guildId,
  draft,
  onChange,
}: {
  guildId: string;
  draft: PanelDraft;
  onChange: (patch: Partial<PanelDraft>) => void;
}) {
  const [pick, setPick] = useState<PanelOption>(EMPTY_OPTION);
  const [roles, setRoles] = useState<DiscordRoleOption[]>([]);
  const [channels, setChannels] = useState<DiscordChannelOption[]>([]);

  useEffect(() => {
    api.getDiscordRoles(guildId).then(setRoles);
    api.getDiscordChannels(guildId).then((r) => setChannels([...r.textChannels, ...r.voiceChannels]));
  }, [guildId]);

  const reactions = draft.layout === "REACTIONS";
  const canAdd =
    (pick.roleIds.length > 0 || pick.channelIds.length > 0) &&
    (reactions ? !!pick.emoji.trim() && !draft.options.some((o) => o.emoji === pick.emoji.trim()) : !!pick.label.trim());

  function addOption() {
    if (!canAdd) return;
    onChange({ options: [...draft.options, { ...pick, emoji: pick.emoji.trim(), label: pick.label.trim() }] });
    setPick(EMPTY_OPTION);
  }

  function summary(o: PanelOption): string {
    const r = o.roleIds.map((id) => `@${roles.find((x) => x.id === id)?.name ?? id}`);
    const c = o.channelIds.map((id) => `#${channels.find((x) => x.id === id)?.name ?? id}`);
    return [...r, ...c].join(", ");
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
        placeholder="Click below to get access."
        value={draft.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />

      <SavedEmbedPicker guildId={guildId} value={draft.savedEmbedId} onChange={(id) => onChange({ savedEmbedId: id })} />
      <p className="text-xs text-slate-600 mb-4">
        Build the message in the Embed Creator and save it, then pick it here. Without one, the panel posts a plain message using the name and description above.
      </p>

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
        <option value="BUTTONS">Button grid (up to 5)</option>
        <option value="DROPDOWN">Dropdown (up to 25, multi-select)</option>
      </select>
      <p className="text-xs text-slate-600 mb-4">
        {reactions
          ? "The bot posts the message and reacts with every emoji below. Members react to get access and un-react to lose it."
          : "Members click a button or pick from the dropdown to toggle access."}{" "}
        Members get a private confirmation each time.
      </p>

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
        {reactions ? "Emoji → Access" : "Options"}
        <Required />
      </label>
      <div className="space-y-1.5 mb-3">
        {draft.options.map((o, i) => (
          <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-base-800 border border-white/10 text-sm">
            <span className="min-w-0 truncate">
              {o.emoji && <span className="mr-1.5">{o.emoji}</span>}
              {!reactions && <span className="mr-1.5">{o.label}</span>}
              <span className="text-neon-blue text-xs">{summary(o)}</span>
            </span>
            <button onClick={() => onChange({ options: draft.options.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-rose-400 shrink-0">
              ×
            </button>
          </div>
        ))}
        {draft.options.length === 0 && <span className="text-xs text-slate-500">Nothing added yet.</span>}
      </div>

      <div className="rounded-lg border border-white/10 p-3 mb-4">
        <div className={`grid grid-cols-1 ${reactions ? "" : "sm:grid-cols-2"} gap-2 mb-3`}>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Emoji{reactions ? "" : " (optional)"}</p>
            <EmojiPicker guildId={guildId} value={pick.emoji} onChange={(emoji) => setPick({ ...pick, emoji })} />
          </div>
          {!reactions && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Label</p>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                placeholder="Gamer"
                value={pick.label}
                onChange={(e) => setPick({ ...pick, label: e.target.value })}
              />
            </div>
          )}
        </div>
        <MultiPick label="Gives roles" prefix="@" items={roles} chosen={pick.roleIds} onChange={(roleIds) => setPick({ ...pick, roleIds })} />
        <MultiPick label="Unlocks channels" prefix="#" items={channels} chosen={pick.channelIds} onChange={(channelIds) => setPick({ ...pick, channelIds })} />
        <p className="text-xs text-slate-600 mb-3">
          Pick roles, channels, or both. Channel access works by giving the member their own view permission, so hide the channel from @everyone and make sure the
          bot can Manage Channels.
        </p>
        <button onClick={addOption} disabled={!canAdd} className="neon-button-sm disabled:opacity-50">
          Add
        </button>
      </div>
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
  const [notice, setNotice] = useState<{ kind: "pending" | "ok" | "warn"; text: string } | null>(null);

  // The bot posts (or re-posts) the Discord message a few seconds after a
  // save, so watch the panel until it has a message id and say what happened.
  async function watchPosting(source: "reaction" | "panel", id: string, verb: "Posted" | "Updated") {
    setNotice({ kind: "pending", text: "Saved — sending to Discord…" });
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const rows: Array<{ id: string; channelId: string; messageId: string | null }> =
          source === "reaction" ? await api.getReactionRolePanels(guildId) : await api.getRolePanels(guildId);
        const row = rows.find((r) => r.id === id);
        if (!row) return setNotice(null);
        if (row.messageId) {
          refresh();
          return setNotice({ kind: "ok", text: `${verb} in Discord ✓ — the message is live in ${channelLabel(row.channelId)}.` });
        }
      } catch {
        /* keep polling */
      }
    }
    setNotice({
      kind: "warn",
      text: "Saved, but it hasn't reached Discord yet. Check that Reaction Roles is enabled and the bot can view, send messages and add reactions in that channel.",
    });
  }

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
        savedEmbedId: d.savedEmbedId,
        options: d.options.map((o) => ({ emoji: o.emoji, roleIds: o.roleIds, channelIds: o.channelIds })),
      };
    }
    return {
      name: d.name,
      channelId: d.channelId ?? "",
      description: d.description,
      layout: d.layout,
      savedEmbedId: d.savedEmbedId,
      options: d.options.map((o) => ({ label: o.label, emoji: o.emoji || undefined, roleIds: o.roleIds, channelIds: o.channelIds })),
    };
  }

  function validate(d: PanelDraft): string | null {
    if (!d.name.trim()) return "Enter a panel name.";
    if (!d.channelId) return "Pick a channel to post this panel in.";
    if (d.options.length === 0) return "Add at least one option that gives a role or channel.";
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
      const done = editing;
      setEditing(null);
      refresh();
      void watchPosting(done.source, done.id, "Updated");
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
      const source = draft.layout === "REACTIONS" ? "reaction" : "panel";
      const created: { id: string } =
        source === "reaction" ? await api.addReactionRolePanel(guildId, payload as never) : await api.addRolePanel(guildId, payload as never);
      setDraft(EMPTY_DRAFT);
      setTab("active");
      refresh();
      void watchPosting(source, created.id, "Posted");
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
      {notice && (
        <div
          className={`max-w-lg mb-4 flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${
            notice.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : notice.kind === "warn"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
              : "border-neon-blue/30 bg-neon-blue/10 text-neon-blue"
          }`}
        >
          <span>
            {notice.kind === "pending" && <span className="inline-block animate-spin mr-2">⟳</span>}
            {notice.text}
          </span>
          {notice.kind !== "pending" && (
            <button onClick={() => setNotice(null)} className="text-xs opacity-70 hover:opacity-100 shrink-0">
              Dismiss
            </button>
          )}
        </div>
      )}
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
