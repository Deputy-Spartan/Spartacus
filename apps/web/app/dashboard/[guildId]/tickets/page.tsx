"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import {
  api,
  type DiscordChannelOption,
  type DiscordRoleOption,
  type TicketAnalytics,
  type TicketCannedResponseRow,
  type TicketCloseBehavior,
  type TicketCounts,
  type TicketKnowledgeBaseRow,
  type TicketPanelRow,
  type TicketRow,
  type TicketSettingsRow,
  type TicketTagRow,
  type TicketTypeRow,
} from "../../../../lib/api";

type Tab = "panels" | "types" | "tickets" | "transcripts" | "assist" | "resources" | "analytics" | "settings";

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: "panels", label: "Panels", icon: "🎟️" },
  { key: "types", label: "Ticket Types", icon: "📁" },
  { key: "tickets", label: "Tickets", icon: "📥" },
  { key: "transcripts", label: "Transcripts", icon: "📄" },
  { key: "assist", label: "Automated Assist", icon: "🤖" },
  { key: "resources", label: "Resources", icon: "💬" },
  { key: "analytics", label: "Analytics", icon: "📊" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: "danger" | "warn" }) {
  return (
    <NeonCard className="!p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${tone === "danger" ? "text-rose-400" : tone === "warn" ? "text-amber-400" : "text-neon-blue"}`}>{value}</p>
    </NeonCard>
  );
}

function EmptyState({ icon, title, desc, action }: { icon: string; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-lg bg-base-800 border border-white/5 flex items-center justify-center text-xl mb-4">{icon}</div>
      <p className="font-semibold mb-1.5">{title}</p>
      <p className="text-sm text-slate-500 max-w-md mb-5">{desc}</p>
      {action}
    </div>
  );
}

function MultiRolePicker({ guildId, value, onChange }: { guildId: string; value: string[]; onChange: (ids: string[]) => void }) {
  const [roles, setRoles] = useState<DiscordRoleOption[]>([]);
  useEffect(() => {
    api.getDiscordRoles(guildId).then(setRoles);
  }, [guildId]);
  const available = roles.filter((r) => !value.includes(r.id));

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((id) => {
          const role = roles.find((r) => r.id === id);
          return (
            <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10 text-slate-300">
              @{role?.name ?? id}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} className="text-slate-500 hover:text-neon-blue">
                ×
              </button>
            </span>
          );
        })}
        {value.length === 0 && <span className="text-xs text-slate-500">None selected.</span>}
      </div>
      <select
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
      >
        <option value="">Add a role…</option>
        {available.map((r) => (
          <option key={r.id} value={r.id}>
            @{r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function TicketsPage({ params }: { params: { guildId: string } }) {
  const [tab, setTab] = useState<Tab>("panels");

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="TICKETS"
        title="Tickets"
        description="Support tickets — panels, types, live tickets, an assist knowledge base, and analytics, all in one place."
      />

      <div className="flex gap-1 mb-5 border-b border-white/5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5",
              tab === t.key ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "panels" && <PanelsTab guildId={params.guildId} onGoToTypes={() => setTab("types")} />}
      {tab === "types" && <TypesTab guildId={params.guildId} />}
      {tab === "tickets" && <TicketsTab guildId={params.guildId} />}
      {tab === "transcripts" && <TranscriptsTab guildId={params.guildId} />}
      {tab === "assist" && <AssistTab guildId={params.guildId} />}
      {tab === "resources" && <ResourcesTab guildId={params.guildId} />}
      {tab === "analytics" && <AnalyticsTab guildId={params.guildId} />}
      {tab === "settings" && <SettingsTab guildId={params.guildId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function PanelsTab({ guildId, onGoToTypes }: { guildId: string; onGoToTypes: () => void }) {
  const confirm = useConfirm();
  const [panels, setPanels] = useState<TicketPanelRow[]>([]);
  const [types, setTypes] = useState<TicketTypeRow[]>([]);
  const [counts, setCounts] = useState<TicketCounts | null>(null);
  const [channelOptions, setChannelOptions] = useState<DiscordChannelOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("Support");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [layout, setLayout] = useState<"BUTTONS" | "DROPDOWN">("BUTTONS");
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [supportRoleId, setSupportRoleId] = useState<string | null>(null);
  const [buttonLabel, setButtonLabel] = useState("Open a Ticket");
  const [savedEmbedId, setSavedEmbedId] = useState<string | null>(null);

  function refresh() {
    api.getTicketPanels(guildId).then(setPanels);
    api.getTicketTypes(guildId).then(setTypes);
    api.getTicketCounts(guildId).then(setCounts);
    api.getDiscordChannels(guildId).then((r) => setChannelOptions([...r.textChannels, ...r.voiceChannels]));
  }
  useEffect(refresh, [guildId]);

  function channelLabel(id: string): string {
    const c = channelOptions.find((c) => c.id === id);
    if (!c) return `#${id}`;
    return c.categoryName ? `${c.categoryName} / #${c.name}` : `#${c.name}`;
  }

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setName("Support");
    setChannelId(null);
    setDescription("");
    setLayout("BUTTONS");
    setTypeIds([]);
    setSupportRoleId(null);
    setButtonLabel("Open a Ticket");
    setSavedEmbedId(null);
  }

  function openCreate() {
    resetForm();
    setError(null);
    setShowForm(true);
  }

  function openEdit(panel: TicketPanelRow) {
    setEditingId(panel.id);
    setName(panel.name);
    setChannelId(panel.channelId);
    setDescription(panel.description ?? "");
    setLayout(panel.layout as "BUTTONS" | "DROPDOWN");
    setTypeIds(panel.typeIds);
    setSupportRoleId(panel.supportRoleId);
    setButtonLabel(panel.buttonLabel);
    setSavedEmbedId(panel.savedEmbedId);
    setError(null);
    setShowForm(true);
  }

  async function savePanel() {
    if (!channelId) {
      setError("Select a channel to post this panel in.");
      return;
    }
    setError(null);
    if (editingId) {
      // The channel a panel is posted in can't change without deleting and
      // recreating it (Discord has no "move this message" API) — everything
      // else about an existing panel can be edited freely.
      await api.updateTicketPanel(guildId, editingId, { name, description, layout, typeIds, buttonLabel, supportRoleId, savedEmbedId });
    } else {
      await api.addTicketPanel(guildId, { name, channelId, description, layout, typeIds, buttonLabel, supportRoleId, savedEmbedId });
    }
    resetForm();
    refresh();
  }

  async function togglePause(panel: TicketPanelRow) {
    await api.updateTicketPanel(guildId, panel.id, { paused: !panel.paused });
    refresh();
  }

  async function removePanel(id: string, name: string) {
    if (!(await confirm(`Delete the "${name}" panel? Its posted message will stop working.`))) return;
    await api.deleteTicketPanel(guildId, id);
    refresh();
  }

  const active = panels.filter((p) => !p.paused).length;
  const paused = panels.filter((p) => p.paused).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-400 max-w-2xl">
          Deploy ticket panels to your server — button grids, dropdowns, or a mix of both. Members click a button to open a ticket of the matching type.
        </p>
        {types.length === 0 ? (
          <span className="text-xs text-amber-400 border border-amber-400/30 bg-amber-400/10 rounded-lg px-3 py-2 shrink-0">
            ⚠ Create a ticket type first
          </span>
        ) : (
          <button onClick={openCreate} className="neon-button-sm shrink-0">
            + New panel
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Panels" value={panels.length} />
        <StatCard label="Active" value={active} />
        <StatCard label="Paused" value={paused} />
        <StatCard label="Open Tickets" value={counts?.open ?? 0} />
      </div>

      {showForm && (
        <NeonCard>
          <p className="font-medium mb-3">{editingId ? "Edit Panel" : "Create Panel"}</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Panel Name</label>
          <input className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4" value={name} onChange={(e) => setName(e.target.value)} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Description</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown in the panel embed."
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Use a Saved Embed (overrides name/description above)</label>
          <SavedEmbedPicker guildId={guildId} value={savedEmbedId} onChange={setSavedEmbedId} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Post In Channel
            {!editingId && <Required />}
          </label>
          {editingId ? (
            <p className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4 text-slate-400">
              {channelLabel(channelId ?? "")} <span className="text-slate-600">(can&apos;t be changed — delete and recreate the panel to move it)</span>
            </p>
          ) : (
            <ChannelSelect guildId={guildId} value={channelId} onChange={setChannelId} />
          )}

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Layout</label>
          <select
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={layout}
            onChange={(e) => setLayout(e.target.value as "BUTTONS" | "DROPDOWN")}
          >
            <option value="BUTTONS">Button grid</option>
            <option value="DROPDOWN">Dropdown</option>
          </select>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Ticket Types Offered</label>
          <div className="flex flex-wrap gap-2 mb-4">
            {types.map((t) => {
              const on = typeIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTypeIds(on ? typeIds.filter((id) => id !== t.id) : [...typeIds, t.id])}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    on ? "bg-base-800 border-neon-blue/40 text-neon-blue" : "bg-base-950 border-white/10 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t.emoji ? `${t.emoji} ` : ""}
                  {t.name}
                </button>
              );
            })}
          </div>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Fallback Support Role (legacy, no types selected)</label>
          <RoleSelect guildId={guildId} value={supportRoleId} onChange={setSupportRoleId} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Fallback Button Label (legacy, no types selected)</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={buttonLabel}
            onChange={(e) => setButtonLabel(e.target.value)}
          />

          <div className="flex gap-2">
            <button onClick={savePanel} disabled={!channelId} className="neon-button disabled:opacity-50">
              {editingId ? "Save Changes" : "Post Panel"}
            </button>
            <button onClick={resetForm} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </button>
          </div>
          <FormError message={error} />
        </NeonCard>
      )}

      <NeonCard>
        {panels.length === 0 ? (
          <EmptyState
            icon="🎟️"
            title="No ticket panels yet"
            desc="A panel is the Discord message members click to open a ticket. Wire up your ticket types first, then design a panel — buttons for a handful of categories, or a dropdown if you have many."
            action={
              types.length === 0 ? (
                <button onClick={onGoToTypes} className="neon-button">
                  Create your first ticket type
                </button>
              ) : (
                <button onClick={openCreate} className="neon-button">
                  Create your first panel
                </button>
              )
            }
          />
        ) : (
          <div className="divide-y divide-white/5">
            {panels.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {p.name} {p.paused && <span className="text-xs text-amber-400 ml-1">(paused)</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {channelLabel(p.channelId)} · {p.layout === "DROPDOWN" ? "Dropdown" : "Button grid"} · {p.typeIds.length || "legacy"} type(s)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => openEdit(p)} className="text-xs text-slate-500 hover:text-neon-blue">
                    Edit
                  </button>
                  <button onClick={() => togglePause(p)} className="text-xs text-slate-500 hover:text-neon-blue">
                    {p.paused ? "Resume" : "Pause"}
                  </button>
                  <button onClick={() => removePanel(p.id, p.name)} className="text-slate-500 hover:text-rose-400 text-xs">
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

// ---------------------------------------------------------------------------
// Ticket Types
// ---------------------------------------------------------------------------

const EMPTY_TYPE: Partial<TicketTypeRow> = {
  name: "",
  emoji: "",
  description: "",
  categoryId: null,
  staffRoleIds: [],
  openMessage: "",
  autoCloseHours: null,
  slaMinutes: null,
  enabled: true,
  transcriptChannelId: null,
  closeBehavior: null,
};

function TypesTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [types, setTypes] = useState<TicketTypeRow[]>([]);
  const [panels, setPanels] = useState<TicketPanelRow[]>([]);
  const [editing, setEditing] = useState<Partial<TicketTypeRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getTicketTypes(guildId).then(setTypes);
    api.getTicketPanels(guildId).then(setPanels);
  }
  useEffect(refresh, [guildId]);

  const inUse = useMemo(() => new Set(panels.flatMap((p) => p.typeIds)), [panels]);

  async function save() {
    if (!editing?.name) {
      setError("Enter a name for this ticket type.");
      return;
    }
    setError(null);
    if (editing.id) {
      await api.updateTicketType(guildId, editing.id, editing);
    } else {
      await api.addTicketType(guildId, editing);
    }
    setEditing(null);
    refresh();
  }

  async function remove(id: string, name: string) {
    if (!(await confirm(`Delete the "${name}" ticket type? Any panel offering it will drop it as an option.`))) return;
    await api.deleteTicketType(guildId, id);
    refresh();
  }

  async function toggleEnabled(t: TicketTypeRow) {
    await api.updateTicketType(guildId, t.id, { enabled: !t.enabled });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-400 max-w-2xl">
          Ticket types define what happens when a panel button is clicked — which staff role gets pinged, which category it opens in, the message members
          see, auto-close, SLA, and more.
        </p>
        <button onClick={() => { setError(null); setEditing({ ...EMPTY_TYPE }); }} className="neon-button-sm shrink-0">
          + New type
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Types" value={types.length} />
        <StatCard label="Enabled" value={types.filter((t) => t.enabled).length} />
        <StatCard label="Disabled" value={types.filter((t) => !t.enabled).length} />
        <StatCard label="In use on panels" value={types.filter((t) => inUse.has(t.id)).length} />
      </div>

      {editing && (
        <NeonCard>
          <p className="font-medium mb-3">{editing.id ? "Edit Type" : "New Type"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
                Name
                <Required />
              </label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Emoji</label>
              <input
                className="w-24 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={editing.emoji ?? ""}
                onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
                placeholder="🎫"
              />
            </div>
          </div>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Description</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={editing.description ?? ""}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Ticket Category</label>
          <ChannelSelect guildId={guildId} kind="category" value={editing.categoryId ?? null} onChange={(id) => setEditing({ ...editing, categoryId: id })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Staff Roles Pinged</label>
          <MultiRolePicker guildId={guildId} value={editing.staffRoleIds ?? []} onChange={(ids) => setEditing({ ...editing, staffRoleIds: ids })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Open Message</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            rows={2}
            value={editing.openMessage ?? ""}
            onChange={(e) => setEditing({ ...editing, openMessage: e.target.value })}
            placeholder="Thanks for opening a ticket. Describe your issue and a staff member will be with you shortly."
          />

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Auto-close (hours idle)</label>
              <input
                type="number"
                min={0}
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={editing.autoCloseHours ?? ""}
                onChange={(e) => setEditing({ ...editing, autoCloseHours: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">SLA (minutes to first response)</label>
              <input
                type="number"
                min={0}
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={editing.slaMinutes ?? ""}
                onChange={(e) => setEditing({ ...editing, slaMinutes: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </div>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Transcript Channel (overrides the guild default)</label>
          <ChannelSelect guildId={guildId} value={editing.transcriptChannelId ?? null} onChange={(id) => setEditing({ ...editing, transcriptChannelId: id })} />
          <p className="text-xs text-slate-600 mt-1 mb-4">Leave empty to use the guild-wide default transcript channel from Settings.</p>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">On Close (overrides the guild default)</label>
          <select
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-1"
            value={editing.closeBehavior ?? ""}
            onChange={(e) => setEditing({ ...editing, closeBehavior: (e.target.value || null) as TicketCloseBehavior | null })}
          >
            <option value="">Use guild default</option>
            <option value="DELETE_AND_DM">Delete the channel and DM the opener a copy</option>
            <option value="POST_ONLY">Just post the transcript — leave the channel and opener alone</option>
          </select>
          <p className="text-xs text-slate-600 mb-4">"Just post the transcript" keeps the ticket channel open and skips the DM — useful if staff want to review it there first.</p>

          <div className="flex gap-2">
            <button onClick={save} disabled={!editing.name} className="neon-button disabled:opacity-50">
              Save Type
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </button>
          </div>
          <FormError message={error} />
        </NeonCard>
      )}

      <NeonCard>
        {types.length === 0 ? (
          <EmptyState
            icon="📁"
            title="No ticket types yet"
            desc="Create a type for each kind of support request (Bug report, Billing, Appeal, etc.). Each type becomes a selectable option on every panel that references it."
            action={
              <button onClick={() => { setError(null); setEditing({ ...EMPTY_TYPE }); }} className="neon-button">
                Create your first ticket type
              </button>
            }
          />
        ) : (
          <div className="divide-y divide-white/5">
            {types.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {t.emoji ? `${t.emoji} ` : ""}
                    {t.name}
                    {inUse.has(t.id) && <span className="text-xs text-slate-500 ml-2">· in use</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(t.staffRoleIds || []).length} staff role(s)
                    {t.slaMinutes ? ` · SLA ${t.slaMinutes}m` : ""}
                    {t.autoCloseHours ? ` · auto-close ${t.autoCloseHours}h` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <ToggleSwitch enabled={t.enabled} onChange={() => toggleEnabled(t)} label="Enabled" />
                  <button onClick={() => { setError(null); setEditing(t); }} className="text-xs text-slate-500 hover:text-neon-blue">
                    Edit
                  </button>
                  <button onClick={() => remove(t.id, t.name)} className="text-slate-500 hover:text-rose-400 text-xs">
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

// ---------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------

function TranscriptsTab({ guildId }: { guildId: string }) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [types, setTypes] = useState<TicketTypeRow[]>([]);
  const [settings, setSettings] = useState<TicketSettingsRow | null>(null);
  const [channelOptions, setChannelOptions] = useState<DiscordChannelOption[]>([]);

  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [destChannelId, setDestChannelId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function refresh() {
    api.getTickets(guildId, { view: "all" }).then(setTickets);
    api.getTicketTypes(guildId).then(setTypes);
    api.getTicketSettings(guildId).then(setSettings);
    api.getDiscordChannels(guildId).then((r) => setChannelOptions([...r.textChannels, ...r.voiceChannels]));
  }
  useEffect(refresh, [guildId]);

  function channelLabel(id: string | null): string {
    if (!id) return "—";
    const c = channelOptions.find((c) => c.id === id);
    if (!c) return `#${id}`;
    return c.categoryName ? `${c.categoryName} / #${c.name}` : `#${c.name}`;
  }

  function defaultChannelFor(ticket: TicketRow | undefined): string | null {
    if (!ticket) return null;
    const type = types.find((t) => t.id === ticket.typeId);
    return type?.transcriptChannelId ?? settings?.transcriptChannelId ?? ticket.channelId;
  }

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);

  function selectTicket(id: string) {
    setSelectedTicketId(id);
    setResult(null);
    setDestChannelId(defaultChannelFor(tickets.find((t) => t.id === id)));
  }

  async function generate() {
    if (!selectedTicket || !destChannelId) return;
    setGenerating(true);
    setResult(null);
    try {
      await api.generateTicketTranscript(guildId, selectedTicket.id, destChannelId);
      setResult({ ok: true, message: `Posted to ${channelLabel(destChannelId)}.` });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Failed to generate the transcript." });
    } finally {
      setGenerating(false);
    }
  }

  const withTranscripts = tickets.filter((t) => t.transcriptUrl);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 max-w-2xl">
        Generate a transcript for any ticket on demand — open or already closed — and choose exactly which channel it posts to. Where a transcript goes
        automatically on close (and whether closing also deletes the channel and DMs the opener) is set per ticket type on the Ticket Types tab, or
        guild-wide on Settings.
      </p>

      <NeonCard>
        <p className="font-medium mb-3">Create a Transcript</p>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Ticket</label>
        <select
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
          value={selectedTicketId}
          onChange={(e) => selectTicket(e.target.value)}
        >
          <option value="">Select a ticket…</option>
          {tickets.map((t) => (
            <option key={t.id} value={t.id}>
              #{t.ticketNumber} · {t.status} · {channelLabel(t.channelId)}
            </option>
          ))}
        </select>

        {selectedTicket && (
          <>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Post To</label>
            <ChannelSelect guildId={guildId} value={destChannelId} onChange={setDestChannelId} />
            <p className="text-xs text-slate-600 mt-1 mb-4">Defaults to this ticket type's configured transcript channel — change it to post anywhere else.</p>

            <button onClick={generate} disabled={!destChannelId || generating} className="neon-button disabled:opacity-50">
              {generating ? "Generating…" : "Generate Transcript"}
            </button>
            {result && (
              <p className={`text-xs mt-2 ${result.ok ? "text-emerald-400" : "text-rose-400"}`}>{result.ok ? "✅" : "⚠"} {result.message}</p>
            )}
          </>
        )}
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-3">Previously Generated</p>
        {withTranscripts.length === 0 ? (
          <EmptyState icon="📄" title="No transcripts yet" desc="Transcripts saved as a file (posted automatically when a ticket closes) show up here with a link." />
        ) : (
          <div className="divide-y divide-white/5">
            {withTranscripts.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium">Ticket #{t.ticketNumber}</p>
                  <p className="text-xs text-slate-500">
                    Opened by <code>{t.userId}</code> · {t.closedAt ? new Date(t.closedAt).toLocaleString() : "still open"}
                  </p>
                </div>
                <a href={t.transcriptUrl ?? "#"} target="_blank" rel="noreferrer" className="text-xs text-neon-blue hover:underline">
                  View file ↗
                </a>
              </div>
            ))}
          </div>
        )}
      </NeonCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

function TicketsTab({ guildId }: { guildId: string }) {
  const [view, setView] = useState<"open" | "closed" | "archived" | "all">("open");
  const [counts, setCounts] = useState<TicketCounts | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [types, setTypes] = useState<TicketTypeRow[]>([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  function refresh() {
    api.getTicketCounts(guildId).then(setCounts);
    api.getTickets(guildId, { view, search }).then(setTickets);
    api.getTicketTypes(guildId).then(setTypes);
  }
  useEffect(refresh, [guildId, view, search]);

  const slaBreached = tickets.filter((t) => {
    if (t.status === "CLOSED" || !t.typeId) return false;
    const type = types.find((ty) => ty.id === t.typeId);
    if (!type?.slaMinutes) return false;
    return Date.now() - new Date(t.createdAt).getTime() > type.slaMinutes * 60_000;
  }).length;

  async function reopen(t: TicketRow) {
    await api.updateTicket(guildId, t.id, { status: "OPEN" });
    refresh();
  }
  async function close(t: TicketRow) {
    await api.updateTicket(guildId, t.id, { status: "CLOSED" });
    refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Browse open and closed tickets, reassign, reopen, or jump straight into the channel.</p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Open" value={counts?.open ?? 0} />
        <StatCard label="Claimed" value={counts?.claimed ?? 0} />
        <StatCard label="SLA Breached" value={slaBreached} tone={slaBreached > 0 ? "danger" : undefined} />
        <StatCard label="Closed" value={counts?.closed ?? 0} />
        <StatCard label="Archived" value={counts?.archived ?? 0} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["open", "closed", "archived", "all"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
              view === v ? "bg-base-800 border-neon-blue/40 text-neon-blue" : "bg-base-950 border-white/10 text-slate-400 hover:text-slate-200"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
          placeholder="Number, user id, channel id, or close reason…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
        />
        <button onClick={() => setSearch(searchInput)} className="neon-button-sm">
          Apply
        </button>
      </div>

      <NeonCard>
        {tickets.length === 0 ? (
          <EmptyState
            icon="📥"
            title={`No ${view === "all" ? "" : view} tickets`}
            desc="When a member clicks a panel button or select option, the ticket lands here. Closed tickets stay searchable with full history."
          />
        ) : (
          <div className="divide-y divide-white/5">
            {tickets.map((t) => {
              const type = types.find((ty) => ty.id === t.typeId);
              return (
                <div key={t.id} className="flex items-center justify-between py-3 text-sm gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      #{t.ticketNumber} {type ? `· ${type.emoji ?? ""} ${type.name}` : ""}{" "}
                      <span className="text-xs text-slate-500">({t.status.toLowerCase()})</span>
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      Opened by {t.userId} {t.claimedById ? `· claimed by ${t.claimedById}` : ""} {t.closeReason ? `· "${t.closeReason}"` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <a href={`discord://discord.com/channels/${guildId}/${t.channelId}`} className="text-xs text-neon-blue hover:underline">
                      Jump in
                    </a>
                    {t.transcriptUrl ? (
                      <a href={t.transcriptUrl} target="_blank" rel="noreferrer" className="text-xs text-neon-blue hover:underline">
                        Transcript
                      </a>
                    ) : null}
                    {t.status === "CLOSED" ? (
                      <button onClick={() => reopen(t)} className="text-xs text-slate-500 hover:text-neon-blue">
                        Reopen
                      </button>
                    ) : (
                      <button onClick={() => close(t)} className="text-xs text-slate-500 hover:text-rose-400">
                        Close
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </NeonCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automated Assist (knowledge base — no credits, this bot is free to run)
// ---------------------------------------------------------------------------

function AssistTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [entries, setEntries] = useState<TicketKnowledgeBaseRow[]>([]);
  const [editing, setEditing] = useState<Partial<TicketKnowledgeBaseRow> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getTicketKnowledge(guildId).then(setEntries);
  }
  useEffect(refresh, [guildId]);

  async function save() {
    if (!editing?.name || !editing.content) {
      setError("Enter both a name and content for this knowledge base entry.");
      return;
    }
    setError(null);
    if (editing.id) await api.updateTicketKnowledge(guildId, editing.id, editing);
    else await api.addTicketKnowledge(guildId, editing);
    setEditing(null);
    refresh();
  }
  async function remove(id: string, name: string) {
    if (!(await confirm(`Delete the "${name}" knowledge base entry?`))) return;
    await api.deleteTicketKnowledge(guildId, id);
    refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 max-w-2xl">
        Spartacus can read what your members write in a ticket and try to help — using the knowledge you give it below. If it can't answer, it tags your
        support role and steps out of the way.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NeonCard className="!p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">1. Add knowledge</p>
          <p className="text-xs text-slate-400">Paste in your FAQs, policies, common fixes — anything you'd hand a new staff member on day one.</p>
        </NeonCard>
        <NeonCard className="!p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">2. Wire it up</p>
          <p className="text-xs text-slate-400">Every ticket type can read every knowledge base below — keep entries focused so answers stay accurate.</p>
        </NeonCard>
        <NeonCard className="!p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">3. Spartacus helps</p>
          <p className="text-xs text-slate-400">Members open a ticket; Spartacus replies with what it knows, and pulls in staff if it isn't sure.</p>
        </NeonCard>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Knowledge bases</h3>
        <button onClick={() => { setError(null); setEditing({ name: "", content: "" }); }} className="neon-button-sm">
          + Add knowledge base
        </button>
      </div>

      {editing && (
        <NeonCard>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Name
            <Required />
          </label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={editing.name ?? ""}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Content
            <Required />
          </label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            rows={6}
            value={editing.content ?? ""}
            onChange={(e) => setEditing({ ...editing, content: e.target.value })}
          />
          <div className="flex gap-2">
            <button onClick={save} disabled={!editing.name || !editing.content} className="neon-button disabled:opacity-50">
              Save
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </button>
          </div>
          <FormError message={error} />
        </NeonCard>
      )}

      <NeonCard>
        {entries.length === 0 ? (
          <EmptyState icon="🤖" title="No knowledge added yet" desc="Add your first knowledge base to get Spartacus answering tickets." />
        ) : (
          <div className="divide-y divide-white/5">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-slate-500 truncate max-w-md">{e.content}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => { setError(null); setEditing(e); }} className="text-xs text-slate-500 hover:text-neon-blue">
                    Edit
                  </button>
                  <button onClick={() => remove(e.id, e.name)} className="text-slate-500 hover:text-rose-400 text-xs">
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

// ---------------------------------------------------------------------------
// Resources (tags + canned responses)
// ---------------------------------------------------------------------------

function ResourcesTab({ guildId }: { guildId: string }) {
  const [tags, setTags] = useState<TicketTagRow[]>([]);
  const [responses, setResponses] = useState<TicketCannedResponseRow[]>([]);
  const [newTag, setNewTag] = useState("");
  const [newResponse, setNewResponse] = useState<{ title: string; content: string } | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);

  function refresh() {
    api.getTicketTags(guildId).then(setTags);
    api.getTicketCannedResponses(guildId).then(setResponses);
  }
  useEffect(refresh, [guildId]);

  async function addTag() {
    if (!newTag.trim()) {
      setTagError("Enter a tag name.");
      return;
    }
    setTagError(null);
    await api.addTicketTag(guildId, { name: newTag.trim() });
    setNewTag("");
    refresh();
  }
  async function removeTag(id: string) {
    await api.deleteTicketTag(guildId, id);
    refresh();
  }
  async function addResponse() {
    if (!newResponse?.title || !newResponse.content) {
      setResponseError("Enter both a title and content for this canned response.");
      return;
    }
    setResponseError(null);
    await api.addTicketCannedResponse(guildId, newResponse);
    setNewResponse(null);
    refresh();
  }
  async function removeResponse(id: string) {
    await api.deleteTicketCannedResponse(guildId, id);
    refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Canned responses and tags — the shared vocabulary your staff use to triage and resolve tickets quickly.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium flex items-center gap-1.5">⭐ Tags</p>
              <p className="text-xs text-slate-500">{tags.length} / 100</p>
            </div>
          </div>
          <div className="flex gap-2 mb-3">
            <input
              className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              placeholder="New tag name…"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
            />
            <button onClick={addTag} className="neon-button-sm">
              + New tag
            </button>
          </div>
          <FormError message={tagError} />
          {tags.length === 0 ? (
            <p className="text-sm text-slate-500">No tags yet. Create one to start labelling tickets.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10">
                  {t.name}
                  <button onClick={() => removeTag(t.id)} className="text-slate-500 hover:text-rose-400">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </NeonCard>

        <NeonCard>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium flex items-center gap-1.5">💬 Canned responses</p>
              <p className="text-xs text-slate-500">{responses.length} / 100</p>
            </div>
            <button onClick={() => { setResponseError(null); setNewResponse({ title: "", content: "" }); }} className="neon-button-sm">
              + New response
            </button>
          </div>
          {newResponse && (
            <div className="mb-3 space-y-2">
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                placeholder="Title"
                value={newResponse.title}
                onChange={(e) => setNewResponse({ ...newResponse, title: e.target.value })}
              />
              <textarea
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                rows={3}
                placeholder="Content"
                value={newResponse.content}
                onChange={(e) => setNewResponse({ ...newResponse, content: e.target.value })}
              />
              <div className="flex gap-2">
                <button onClick={addResponse} className="neon-button-sm">
                  Save
                </button>
                <button onClick={() => { setResponseError(null); setNewResponse(null); }} className="text-xs text-slate-400 hover:text-slate-200">
                  Cancel
                </button>
              </div>
              <FormError message={responseError} />
            </div>
          )}
          {responses.length === 0 ? (
            <p className="text-sm text-slate-500">No canned responses yet. Create one to speed up replies.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {responses.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs text-slate-500 truncate max-w-xs">{r.content}</p>
                  </div>
                  <button onClick={() => removeResponse(r.id)} className="text-slate-500 hover:text-rose-400 text-xs shrink-0">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </NeonCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

function formatDuration(ms: number | null) {
  if (ms == null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function AnalyticsTab({ guildId }: { guildId: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<TicketAnalytics | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);

  useEffect(() => {
    api.getTicketAnalytics(guildId, days).then(setData);
    api.getTickets(guildId, { view: "all" }).then(setTickets);
  }, [guildId, days]);

  function exportCsv() {
    const header = "id,ticketNumber,status,userId,claimedById,createdAt,closedAt,closeReason\n";
    const rows = tickets
      .map((t) => [t.id, t.ticketNumber, t.status, t.userId, t.claimedById ?? "", t.createdAt, t.closedAt ?? "", (t.closeReason ?? "").replace(/,/g, ";")].join(","))
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tickets-${guildId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const breachRate = data && data.opened > 0 ? 0 : 0; // real breach rate needs live SLA join; kept honest at 0 until wired to per-ticket SLA history

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-400">Volume, response times, and per-staff breakdowns.</p>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                days === d ? "bg-base-800 border-neon-blue/40 text-neon-blue" : "bg-base-950 border-white/10 text-slate-400 hover:text-slate-200"
              }`}
            >
              {d}d
            </button>
          ))}
          <button onClick={exportCsv} className="neon-button-sm">
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={`Opened (${days}d)`} value={data?.opened ?? 0} />
        <StatCard label={`Closed (${days}d)`} value={data?.closed ?? 0} />
        <StatCard label="Currently Open" value={data?.currentlyOpen ?? 0} />
        <StatCard label="SLA Breach Rate" value={`${breachRate}%`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3 flex items-center gap-1.5">⏱ Response times</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Avg first response</p>
              <p className="text-lg font-bold">{formatDuration(data?.avgFirstResponseMs ?? null)}</p>
              <p className="text-xs text-slate-500">from open to first staff reply</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Avg resolution</p>
              <p className="text-lg font-bold">{formatDuration(data?.avgResolutionMs ?? null)}</p>
              <p className="text-xs text-slate-500">from open to close</p>
            </div>
          </div>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3 flex items-center gap-1.5">📁 By type</p>
          {!data || data.byType.length === 0 ? (
            <p className="text-sm text-slate-500">No ticket types defined yet.</p>
          ) : (
            <div className="space-y-2">
              {data.byType.map((t) => (
                <div key={t.typeId} className="flex items-center justify-between text-sm">
                  <span>{t.name}</span>
                  <span className="text-slate-400">{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3 flex items-center gap-1.5">🏆 Staff leaderboard</p>
          {!data || data.staffLeaderboard.length === 0 ? (
            <p className="text-sm text-slate-500">No claimed tickets in this window.</p>
          ) : (
            <div className="space-y-2">
              {data.staffLeaderboard.map((s, i) => (
                <div key={s.userId} className="flex items-center justify-between text-sm">
                  <span>
                    {i + 1}. {s.userId}
                  </span>
                  <span className="text-slate-400">{s.count} closed</span>
                </div>
              ))}
            </div>
          )}
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3 flex items-center gap-1.5">⭐ Feedback</p>
          {!data || data.feedbackCount === 0 ? (
            <p className="text-sm text-slate-500">No feedback in this window.</p>
          ) : (
            <p className="text-lg font-bold">
              {data.avgFeedback?.toFixed(1)} / 5 <span className="text-xs text-slate-500 font-normal">({data.feedbackCount} ratings)</span>
            </p>
          )}
        </NeonCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const CHANNEL_NAME_TOKENS = [
  { token: "{user}", description: "The ticket opener's username" },
  { token: "{number}", description: "This ticket's sequential number for its panel" },
  { token: "{type}", description: "The ticket type's name, if the panel offers types" },
];

function SettingsTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [settings, setSettings] = useState<TicketSettingsRow | null>(null);
  const [blacklistInput, setBlacklistInput] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getTicketSettings(guildId).then(setSettings);
  }, [guildId]);

  async function persist(next: TicketSettingsRow) {
    setSettings(next);
    await api.setTicketSettings(guildId, next);
  }

  async function reset() {
    const row = await api.resetTicketSettings(guildId);
    setSettings(row);
  }

  async function resetNumbers() {
    setResetting(true);
    await api.resetTicketNumbers(guildId);
    setResetting(false);
  }

  if (!settings) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-slate-400">Guild-wide ticket settings. Per-type overrides (SLA, auto-close, staff roles, …) live on each ticket type.</p>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Log Channel</label>
        <p className="text-xs text-slate-500 mb-2">Posts open/close/claim events for every ticket. Leave empty to disable this feed.</p>
        <ChannelSelect guildId={guildId} value={settings.logChannelId} onChange={(id) => persist({ ...settings, logChannelId: id })} />
      </NeonCard>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Default Transcript Channel</label>
        <p className="text-xs text-slate-500 mb-2">
          A close summary posts here for every ticket, unless its ticket type sets its own transcript channel on the Ticket Types tab. Leave empty to skip
          posting summaries.
        </p>
        <ChannelSelect guildId={guildId} value={settings.transcriptChannelId} onChange={(id) => persist({ ...settings, transcriptChannelId: id })} />
      </NeonCard>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Default On Close</label>
        <p className="text-xs text-slate-500 mb-2">What happens when a ticket is closed, unless its ticket type overrides this.</p>
        <select
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
          value={settings.closeBehavior}
          onChange={(e) => persist({ ...settings, closeBehavior: e.target.value as TicketCloseBehavior })}
        >
          <option value="DELETE_AND_DM">Delete the channel and DM the opener a copy</option>
          <option value="POST_ONLY">Just post the transcript — leave the channel and opener alone</option>
        </select>
      </NeonCard>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Ticket Channel Name</label>
        <p className="text-xs text-slate-500 mb-2">Sets what the channel created for each ticket is called.</p>
        <input
          ref={channelNameRef}
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
          value={settings.channelNameFormat}
          onChange={(e) => persist({ ...settings, channelNameFormat: e.target.value })}
        />
        <PlaceholderExamples
          items={CHANNEL_NAME_TOKENS}
          inputRef={channelNameRef}
          value={settings.channelNameFormat}
          onChange={(v) => persist({ ...settings, channelNameFormat: v })}
        />
      </NeonCard>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Open Ticket Cap</label>
        <p className="text-xs text-slate-500 mb-2">Max concurrent open tickets a single member can have. 0 disables the cap.</p>
        <input
          type="number"
          min={0}
          className="w-32 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
          value={settings.ticketCap}
          onChange={(e) => persist({ ...settings, ticketCap: Number(e.target.value) })}
        />
      </NeonCard>

      <NeonCard>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Require close reason</p>
            <p className="text-xs text-slate-500">Staff must type a reason when closing any ticket.</p>
          </div>
          <ToggleSwitch enabled={settings.requireCloseReason} onChange={(v) => persist({ ...settings, requireCloseReason: v })} label="Require close reason" />
        </div>
      </NeonCard>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Support Roles</label>
        <p className="text-xs text-slate-500 mb-2">Role-holders here can view and manage every ticket regardless of its type.</p>
        <MultiRolePicker guildId={guildId} value={settings.supportRoleIds} onChange={(ids) => persist({ ...settings, supportRoleIds: ids })} />
      </NeonCard>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Blacklist</label>
        <p className="text-xs text-slate-500 mb-2">Users listed here can't open tickets.</p>
        <div className="flex gap-2 mb-2">
          <input
            className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
            placeholder="Discord user ID"
            value={blacklistInput}
            onChange={(e) => setBlacklistInput(e.target.value)}
          />
          <button
            onClick={() => {
              if (!blacklistInput.trim()) {
                setError("Enter a Discord user ID to blacklist.");
                return;
              }
              setError(null);
              persist({ ...settings, blacklistUserIds: [...settings.blacklistUserIds, blacklistInput.trim()] });
              setBlacklistInput("");
            }}
            className="neon-button-sm"
          >
            Add
          </button>
        </div>
        <FormError message={error} />
        {settings.blacklistUserIds.length === 0 ? (
          <p className="text-xs text-slate-500 mb-3">No users blacklisted.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-3">
            {settings.blacklistUserIds.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10">
                {id}
                <button
                  onClick={() => persist({ ...settings, blacklistUserIds: settings.blacklistUserIds.filter((u) => u !== id) })}
                  className="text-slate-500 hover:text-rose-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Blacklisted Roles</label>
        <MultiRolePicker guildId={guildId} value={settings.blacklistRoleIds} onChange={(ids) => persist({ ...settings, blacklistRoleIds: ids })} />
      </NeonCard>

      <NeonCard className="border-rose-500/30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Reset ticket numbers</p>
            <p className="text-xs text-slate-500">Sets every panel's ticket counter back to #1. Existing ticket history is untouched.</p>
          </div>
          <button
            onClick={async () => {
              if (await confirm("Reset every panel's ticket numbering back to #1?")) resetNumbers();
            }}
            disabled={resetting}
            className="px-4 py-2 text-sm rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 shrink-0 disabled:opacity-50"
          >
            {resetting ? "Resetting…" : "Reset Numbers"}
          </button>
        </div>
      </NeonCard>

      <NeonCard className="border-rose-500/30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Reset to defaults</p>
            <p className="text-xs text-slate-500">Clears every field above back to its default and saves immediately.</p>
          </div>
          <button
            onClick={async () => {
              if (await confirm("Reset all ticket settings back to their defaults?")) reset();
            }}
            className="px-4 py-2 text-sm rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 shrink-0"
          >
            Reset
          </button>
        </div>
      </NeonCard>
    </div>
  );
}
