"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { useMemberNames } from "../../../../lib/useMemberNames";
import {
  api,
  type ApplicationCounts,
  type ApplicationPanelLayout,
  type ApplicationPanelRow,
  type ApplicationQuestion,
  type ApplicationRow,
  type ApplicationSettingsRow,
  type ApplicationStatus,
  type ApplicationTypeRow,
} from "../../../../lib/api";

type Tab = "panels" | "types" | "submissions" | "settings";

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: "panels", label: "Panels", icon: "📋" },
  { key: "types", label: "Application Types", icon: "📁" },
  { key: "submissions", label: "Submissions", icon: "📥" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <NeonCard className="!p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-neon-blue">{value}</p>
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

function RoleChipPicker({ guildId, value, onChange }: { guildId: string; value: string[]; onChange: (ids: string[]) => void }) {
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    if (pick && !value.includes(pick)) {
      onChange([...value, pick]);
      setPick(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10 text-slate-300">
            @{id.slice(0, 8)}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} className="text-slate-500 hover:text-neon-blue">
              ×
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-slate-500">None selected.</span>}
      </div>
      <RoleSelect guildId={guildId} value={null} onChange={setPick} />
    </div>
  );
}

export default function ApplicationsPage({ params }: { params: { guildId: string } }) {
  const [tab, setTab] = useState<Tab>("panels");

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="APPLICATIONS"
        title="Applications"
        description="Members apply via a button/dropdown panel and modal form — submissions post to your review channel with Accept/Deny buttons."
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
      {tab === "submissions" && <SubmissionsTab guildId={params.guildId} />}
      {tab === "settings" && <SettingsTab guildId={params.guildId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function PanelsTab({ guildId, onGoToTypes }: { guildId: string; onGoToTypes: () => void }) {
  const confirm = useConfirm();
  const [panels, setPanels] = useState<ApplicationPanelRow[]>([]);
  const [types, setTypes] = useState<ApplicationTypeRow[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("Staff Applications");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [layout, setLayout] = useState<ApplicationPanelLayout>("BUTTONS");
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getApplicationPanels(guildId).then(setPanels);
    api.getApplicationTypes(guildId).then(setTypes);
  }
  useEffect(refresh, [guildId]);

  async function createPanel() {
    if (!channelId || typeIds.length === 0) {
      setError("Select a channel and at least one application type before posting.");
      return;
    }
    setError(null);
    await api.addApplicationPanel(guildId, { name, channelId, description, layout, typeIds });
    setShowForm(false);
    setName("Staff Applications");
    setChannelId(null);
    setDescription("");
    setTypeIds([]);
    setError(null);
    refresh();
  }

  async function togglePause(panel: ApplicationPanelRow) {
    await api.updateApplicationPanel(guildId, panel.id, { paused: !panel.paused });
    refresh();
  }

  async function remove(panel: ApplicationPanelRow) {
    if (!(await confirm(`Delete the "${panel.name}" panel? Its posted message will stop working.`))) return;
    await api.deleteApplicationPanel(guildId, panel.id);
    refresh();
  }

  const active = panels.filter((p) => !p.paused).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-400 max-w-2xl">
          Deploy application panels to your server — button grids or a dropdown. Members click to open the matching application form.
        </p>
        {types.length === 0 ? (
          <span className="text-xs text-amber-400 border border-amber-400/30 bg-amber-400/10 rounded-lg px-3 py-2 shrink-0">
            ⚠ Create an application type first
          </span>
        ) : (
          <button onClick={() => { setError(null); setShowForm(true); }} className="neon-button-sm shrink-0">
            + New panel
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Panels" value={panels.length} />
        <StatCard label="Active" value={active} />
        <StatCard label="Paused" value={panels.length - active} />
      </div>

      {showForm && (
        <NeonCard>
          <p className="font-medium mb-3">Create Panel</p>
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

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Post In Channel
            <Required />
          </label>
          <ChannelSelect guildId={guildId} value={channelId} onChange={setChannelId} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Layout</label>
          <select
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={layout}
            onChange={(e) => setLayout(e.target.value as ApplicationPanelLayout)}
          >
            <option value="BUTTONS">Button grid</option>
            <option value="DROPDOWN">Dropdown</option>
          </select>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Application Types Offered
            <Required />
          </label>
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

          <div className="flex gap-2">
            <button onClick={createPanel} disabled={!channelId || typeIds.length === 0} className="neon-button disabled:opacity-50">
              Post Panel
            </button>
            <button onClick={() => { setError(null); setShowForm(false); }} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Cancel
            </button>
          </div>
          <FormError message={error} />
        </NeonCard>
      )}

      <NeonCard>
        {panels.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No application panels yet"
            desc="A panel is the Discord message members click to apply. Wire up your application types first, then design a panel."
            action={
              types.length === 0 ? (
                <button onClick={onGoToTypes} className="neon-button">
                  Create your first application type
                </button>
              ) : (
                <button onClick={() => setShowForm(true)} className="neon-button">
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
                    #{p.channelId.slice(0, 6)} · {p.layout === "DROPDOWN" ? "Dropdown" : "Button grid"} · {p.typeIds.length} type(s)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => togglePause(p)} className="text-xs text-slate-500 hover:text-neon-blue">
                    {p.paused ? "Resume" : "Pause"}
                  </button>
                  <button onClick={() => remove(p)} className="text-slate-500 hover:text-rose-400 text-xs">
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
// Application Types
// ---------------------------------------------------------------------------

const EMPTY_TYPE: Partial<ApplicationTypeRow> = {
  name: "",
  emoji: "",
  description: "",
  reviewChannelId: null,
  staffRoleIds: [],
  questions: [],
  acceptMessage: "🎉 Your application for {type} was accepted!",
  denyMessage: "Your application for {type} was not accepted this time.",
  enabled: true,
};

function TypesTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [types, setTypes] = useState<ApplicationTypeRow[]>([]);
  const [panels, setPanels] = useState<ApplicationPanelRow[]>([]);
  const [editing, setEditing] = useState<Partial<ApplicationTypeRow> | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getApplicationTypes(guildId).then(setTypes);
    api.getApplicationPanels(guildId).then(setPanels);
  }
  useEffect(refresh, [guildId]);

  const inUse = new Set(panels.flatMap((p) => p.typeIds));

  function addQuestion() {
    if (!editing || !questionDraft.trim()) return;
    const q: ApplicationQuestion = { label: questionDraft.trim(), style: "SHORT", required: true };
    setEditing({ ...editing, questions: [...(editing.questions ?? []), q] });
    setQuestionDraft("");
  }

  function removeQuestion(index: number) {
    if (!editing) return;
    setEditing({ ...editing, questions: (editing.questions ?? []).filter((_, i) => i !== index) });
  }

  async function save() {
    if (!editing?.name || (editing.questions?.length ?? 0) === 0) {
      setError("Enter a name and add at least one question before saving.");
      return;
    }
    setError(null);
    if (editing.id) await api.updateApplicationType(guildId, editing.id, editing);
    else await api.addApplicationType(guildId, editing);
    setEditing(null);
    refresh();
  }

  async function remove(t: ApplicationTypeRow) {
    if (!(await confirm(`Delete the "${t.name}" application type? Any panel offering it will drop it as an option.`))) return;
    await api.deleteApplicationType(guildId, t.id);
    refresh();
  }

  async function toggleEnabled(t: ApplicationTypeRow) {
    await api.updateApplicationType(guildId, t.id, { enabled: !t.enabled });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-400 max-w-2xl">
          Application types define the questions asked, who reviews it, and the accept/deny messages sent back to the applicant.
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
                placeholder="📝"
              />
            </div>
          </div>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Description</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={editing.description ?? ""}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Review Channel</label>
          <ChannelSelect guildId={guildId} value={editing.reviewChannelId ?? null} onChange={(id) => setEditing({ ...editing, reviewChannelId: id })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Staff Roles Pinged</label>
          <RoleChipPicker guildId={guildId} value={editing.staffRoleIds ?? []} onChange={(ids) => setEditing({ ...editing, staffRoleIds: ids })} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Questions (unlimited)
            <Required />
          </label>
          <p className="text-xs text-slate-600 mb-2">
            Discord only allows 5 questions per popup, so applicants get one popup per 5 — answer the first 5, then the next popup opens
            automatically until they're done.
          </p>
          <div className="space-y-1.5 mb-2">
            {(editing.questions ?? []).map((q, i) => (
              <div key={i} className="flex items-center justify-between bg-base-950 border border-white/10 rounded-lg px-3 py-2 text-sm">
                <span>
                  <span className="text-slate-600 mr-1">{i + 1}.</span>
                  {q.label}
                </span>
                <button onClick={() => removeQuestion(i)} className="text-slate-500 hover:text-rose-400">
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            <input
              className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              placeholder="Question text"
              value={questionDraft}
              onChange={(e) => setQuestionDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addQuestion()}
            />
            <button onClick={addQuestion} disabled={!questionDraft.trim()} className="neon-button-sm disabled:opacity-50">
              Add
            </button>
          </div>

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Accept Message (DM)</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            rows={2}
            value={editing.acceptMessage ?? ""}
            onChange={(e) => setEditing({ ...editing, acceptMessage: e.target.value })}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Deny Message (DM)</label>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            rows={2}
            value={editing.denyMessage ?? ""}
            onChange={(e) => setEditing({ ...editing, denyMessage: e.target.value })}
          />
          <p className="text-xs text-slate-600 -mt-3 mb-4">Use {"{type}"} to reference the application type's name.</p>

          <div className="flex gap-2">
            <button onClick={save} disabled={!editing.name || (editing.questions?.length ?? 0) === 0} className="neon-button disabled:opacity-50">
              Save Type
            </button>
            <button onClick={() => { setError(null); setEditing(null); }} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
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
            title="No application types yet"
            desc="Create a type for each kind of application (Staff, Partner, Builder, etc.). Each type becomes a selectable option on every panel that references it."
            action={
              <button onClick={() => { setError(null); setEditing({ ...EMPTY_TYPE }); }} className="neon-button">
                Create your first application type
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
                    {t.questions.length} question(s) · {t.staffRoleIds.length} staff role(s)
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <ToggleSwitch enabled={t.enabled} onChange={() => toggleEnabled(t)} label="Enabled" />
                  <button onClick={() => setEditing(t)} className="text-xs text-slate-500 hover:text-neon-blue">
                    Edit
                  </button>
                  <button onClick={() => remove(t)} className="text-slate-500 hover:text-rose-400 text-xs">
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
// Submissions
// ---------------------------------------------------------------------------

function SubmissionsTab({ guildId }: { guildId: string }) {
  const [view, setView] = useState<ApplicationStatus | "ALL">("PENDING");
  const [counts, setCounts] = useState<ApplicationCounts | null>(null);
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [types, setTypes] = useState<ApplicationTypeRow[]>([]);
  const { displayName } = useMemberNames(guildId, rows.map((r) => r.userId));

  function refresh() {
    api.getApplicationCounts(guildId).then(setCounts);
    api.getApplications(guildId, view === "ALL" ? undefined : view).then(setRows);
    api.getApplicationTypes(guildId).then(setTypes);
  }
  useEffect(refresh, [guildId, view]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Browse submissions. Accept/Deny happens via the buttons on the review message posted in Discord.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Pending" value={counts?.pending ?? 0} />
        <StatCard label="Accepted" value={counts?.accepted ?? 0} />
        <StatCard label="Denied" value={counts?.denied ?? 0} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["PENDING", "ACCEPTED", "DENIED", "ALL"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
              view === v ? "bg-base-800 border-neon-blue/40 text-neon-blue" : "bg-base-950 border-white/10 text-slate-400 hover:text-slate-200"
            }`}
          >
            {v.toLowerCase()}
          </button>
        ))}
      </div>

      <NeonCard>
        {rows.length === 0 ? (
          <EmptyState icon="📥" title={`No ${view === "ALL" ? "" : view.toLowerCase()} submissions`} desc="Submissions land here as soon as a member applies." />
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((r) => {
              const type = types.find((t) => t.id === r.typeId);
              return (
                <div key={r.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">
                      {displayName(r.userId)} {type ? `· ${type.emoji ?? ""} ${type.name}` : ""}
                    </span>
                    <span className="text-xs text-slate-500">{r.status.toLowerCase()}</span>
                  </div>
                  <p className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</p>
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
// Settings
// ---------------------------------------------------------------------------

function SettingsTab({ guildId }: { guildId: string }) {
  const [settings, setSettings] = useState<ApplicationSettingsRow | null>(null);

  useEffect(() => {
    api.getApplicationSettings(guildId).then(setSettings);
  }, [guildId]);

  async function persist(next: ApplicationSettingsRow) {
    setSettings(next);
    await api.setApplicationSettings(guildId, next);
  }

  if (!settings) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-slate-400">Guild-wide application settings. Per-type overrides (review channel, staff roles, questions, …) live on each type.</p>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Default Log Channel</label>
        <p className="text-xs text-slate-500 mb-2">Used as a fallback review channel for any type that doesn't set its own.</p>
        <ChannelSelect guildId={guildId} value={settings.logChannelId} onChange={(id) => persist({ ...settings, logChannelId: id })} />
      </NeonCard>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Default Support Roles</label>
        <p className="text-xs text-slate-500 mb-2">Pinged on every submission in addition to each type's own staff roles.</p>
        <RoleChipPicker guildId={guildId} value={settings.supportRoleIds} onChange={(ids) => persist({ ...settings, supportRoleIds: ids })} />
      </NeonCard>
    </div>
  );
}
