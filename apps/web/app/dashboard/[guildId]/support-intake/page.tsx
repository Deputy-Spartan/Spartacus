"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { useMemberNames } from "../../../../lib/useMemberNames";
import {
  api,
  type SupportFlowRow,
  type SupportQuestionMode,
  type SupportQuestionRow,
  type SupportSettingsRow,
  type SupportTicketRow,
  type SupportTicketStatus,
} from "../../../../lib/api";

type Tab = "flows" | "tickets" | "settings";

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: "flows", label: "DM Categories", icon: "📨" },
  { key: "tickets", label: "Tickets", icon: "🎟️" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];

const COLOR_PRESETS = ["#5865F2", "#22c55e", "#ef4444", "#f59e0b", "#a855f7", "#00e5ff"];

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

export default function SupportIntakePage({ params }: { params: { guildId: string } }) {
  const [tab, setTab] = useState<Tab>("flows");

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="SUPPORT_INTAKE"
        title="Support DM"
        description="Members DM Spartacus and pick what they need help with — each category asks its own chain of questions, then a private ticket opens for staff. Staff replies in the ticket relay straight back to the member's DM."
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

      {tab === "flows" && <FlowsTab guildId={params.guildId} />}
      {tab === "tickets" && <TicketsTab guildId={params.guildId} />}
      {tab === "settings" && <SettingsTab guildId={params.guildId} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DM Categories (flows)
// ---------------------------------------------------------------------------

function FlowsTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [flows, setFlows] = useState<SupportFlowRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function refresh() {
    api.getSupportFlows(guildId).then(setFlows);
  }
  useEffect(refresh, [guildId]);

  async function addFlow() {
    const row = await api.addSupportFlow(guildId, { label: "New Category" });
    setFlows((prev) => [...prev, row]);
    setExpandedId(row.id);
  }

  async function removeFlow(flow: SupportFlowRow) {
    if (!(await confirm(`Delete the "${flow.label}" category? Members will no longer see it as a DM option.`))) return;
    await api.deleteSupportFlow(guildId, flow.id);
    refresh();
  }

  async function toggleEnabled(flow: SupportFlowRow) {
    await api.updateSupportFlow(guildId, flow.id, { enabled: !flow.enabled });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-400 max-w-2xl">
          Each category becomes a button a member sees when they DM the bot. Give it a destination category + support role, then build its question chain —
          add as many questions as you need, each one free-text or multiple-choice.
        </p>
        <button onClick={addFlow} className="neon-button-sm shrink-0">
          + New category
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Categories" value={flows.length} />
        <StatCard label="Enabled" value={flows.filter((f) => f.enabled).length} />
        <StatCard label="Total Questions" value={flows.reduce((n, f) => n + f.questions.length, 0)} />
      </div>

      {flows.length === 0 ? (
        <NeonCard>
          <EmptyState
            icon="📨"
            title="No DM categories yet"
            desc="Create a category for each kind of support request (Bug Report, Billing, General, …). Members pick one when they DM the bot."
            action={
              <button onClick={addFlow} className="neon-button">
                Create your first category
              </button>
            }
          />
        </NeonCard>
      ) : (
        <div className="space-y-3">
          {flows.map((flow) => (
            <FlowCard
              key={flow.id}
              guildId={guildId}
              flow={flow}
              expanded={expandedId === flow.id}
              onToggleExpand={() => setExpandedId(expandedId === flow.id ? null : flow.id)}
              onToggleEnabled={() => toggleEnabled(flow)}
              onRemove={() => removeFlow(flow)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FlowCard({
  guildId,
  flow,
  expanded,
  onToggleExpand,
  onToggleEnabled,
  onRemove,
  onChanged,
}: {
  guildId: string;
  flow: SupportFlowRow;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: () => void;
  onRemove: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [label, setLabel] = useState(flow.label);
  const [color, setColor] = useState(flow.color ?? "#5865F2");
  const [categoryId, setCategoryId] = useState<string | null>(flow.categoryId);
  const [roleId, setRoleId] = useState<string | null>(flow.roleId);
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    setLabel(flow.label);
    setColor(flow.color ?? "#5865F2");
    setCategoryId(flow.categoryId);
    setRoleId(flow.roleId);
  }, [flow.id, flow.label, flow.color, flow.categoryId, flow.roleId]);

  async function saveMeta() {
    setSavingMeta(true);
    await api.updateSupportFlow(guildId, flow.id, { label, color, categoryId, roleId });
    setSavingMeta(false);
    onChanged();
  }

  async function addQuestion() {
    await api.addSupportQuestion(guildId, flow.id, { prompt: "New question", mode: "TEXT", choices: [] });
    onChanged();
  }

  async function updateQuestion(q: SupportQuestionRow, patch: Partial<SupportQuestionRow>) {
    await api.updateSupportQuestion(guildId, flow.id, q.id, patch);
    onChanged();
  }

  async function removeQuestion(q: SupportQuestionRow) {
    if (!(await confirm(`Delete the question "${q.prompt}"?`))) return;
    await api.deleteSupportQuestion(guildId, flow.id, q.id);
    onChanged();
  }

  async function move(q: SupportQuestionRow, dir: -1 | 1) {
    const sorted = [...flow.questions].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = sorted.findIndex((x) => x.id === q.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    await api.reorderSupportQuestions(guildId, flow.id, sorted.map((s) => s.id));
    onChanged();
  }

  const sortedQuestions = [...flow.questions].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <NeonCard>
      <div className="flex items-center justify-between gap-3">
        <button onClick={onToggleExpand} className="flex items-center gap-2 text-left flex-1 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: flow.color ?? "#5865F2" }} />
          <div className="min-w-0">
            <p className="font-medium truncate">
              {flow.label} {!flow.enabled && <span className="text-xs text-amber-400 ml-1">(disabled)</span>}
            </p>
            <p className="text-xs text-slate-500">{flow.questions.length} question(s)</p>
          </div>
          <span className="text-slate-500 ml-2">{expanded ? "▲" : "▼"}</span>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          <ToggleSwitch enabled={flow.enabled} onChange={onToggleEnabled} label="Enabled" />
          <button onClick={onRemove} className="text-slate-500 hover:text-rose-400 text-xs">
            Remove
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
                Button Label
                <Required />
              </label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={saveMeta}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Color</label>
              <div className="flex gap-2 items-center">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setColor(c);
                      api.updateSupportFlow(guildId, flow.id, { color: c }).then(onChanged);
                    }}
                    className={`w-6 h-6 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Ticket Category</label>
              <ChannelSelect
                guildId={guildId}
                kind="category"
                value={categoryId}
                onChange={(id) => {
                  setCategoryId(id);
                  api.updateSupportFlow(guildId, flow.id, { categoryId: id }).then(onChanged);
                }}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Support Role Pinged</label>
              <RoleSelect
                guildId={guildId}
                value={roleId}
                onChange={(id) => {
                  setRoleId(id);
                  api.updateSupportFlow(guildId, flow.id, { roleId: id }).then(onChanged);
                }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs uppercase tracking-wide text-slate-500">
                Questions (asked one at a time, in order)
                <Required />
              </label>
              <button onClick={addQuestion} className="neon-button-sm">
                + Add question
              </button>
            </div>

            {sortedQuestions.length === 0 ? (
              <p className="text-xs text-slate-500">No questions yet — add at least one so this category can finish into a ticket.</p>
            ) : (
              <div className="space-y-2">
                {sortedQuestions.map((q, i) => (
                  <QuestionRow
                    key={q.id}
                    index={i}
                    question={q}
                    onUpdate={(patch) => updateQuestion(q, patch)}
                    onRemove={() => removeQuestion(q)}
                    onMoveUp={i > 0 ? () => move(q, -1) : undefined}
                    onMoveDown={i < sortedQuestions.length - 1 ? () => move(q, 1) : undefined}
                  />
                ))}
              </div>
            )}
          </div>

          {savingMeta && <p className="text-xs text-slate-500">Saving…</p>}
        </div>
      )}
    </NeonCard>
  );
}

function QuestionRow({
  index,
  question,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  index: number;
  question: SupportQuestionRow;
  onUpdate: (patch: Partial<SupportQuestionRow>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [choiceDraft, setChoiceDraft] = useState("");

  useEffect(() => setPrompt(question.prompt), [question.id, question.prompt]);

  function addChoice() {
    if (!choiceDraft.trim()) return;
    onUpdate({ choices: [...question.choices, choiceDraft.trim()] });
    setChoiceDraft("");
  }

  function removeChoice(i: number) {
    onUpdate({ choices: question.choices.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="bg-base-950 border border-white/10 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <span className="text-xs text-slate-600 pt-2.5 shrink-0">{index + 1}.</span>
        <input
          className="flex-1 bg-base-900 border border-white/10 rounded-lg p-2 text-sm"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={() => prompt.trim() && prompt !== question.prompt && onUpdate({ prompt: prompt.trim() })}
        />
        <select
          className="bg-base-900 border border-white/10 rounded-lg p-2 text-sm shrink-0"
          value={question.mode}
          onChange={(e) => onUpdate({ mode: e.target.value as SupportQuestionMode })}
        >
          <option value="TEXT">Free text</option>
          <option value="CHOICE">Multiple choice</option>
        </select>
        <div className="flex flex-col gap-0.5 shrink-0">
          <button onClick={onMoveUp} disabled={!onMoveUp} className="text-slate-500 hover:text-neon-blue disabled:opacity-30 text-xs leading-none">
            ▲
          </button>
          <button onClick={onMoveDown} disabled={!onMoveDown} className="text-slate-500 hover:text-neon-blue disabled:opacity-30 text-xs leading-none">
            ▼
          </button>
        </div>
        <button onClick={onRemove} className="text-slate-500 hover:text-rose-400 text-sm shrink-0 pt-1">
          ×
        </button>
      </div>

      {question.mode === "CHOICE" && (
        <div className="mt-2.5 pl-5">
          <p className="text-xs text-slate-600 mb-1.5">Answer options (shown as buttons, up to 25):</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {question.choices.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-base-800 border border-white/10 text-slate-300">
                {c}
                <button onClick={() => removeChoice(i)} className="text-slate-500 hover:text-neon-blue">
                  ×
                </button>
              </span>
            ))}
            {question.choices.length === 0 && <span className="text-xs text-slate-600">No options added yet.</span>}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-base-900 border border-white/10 rounded-lg p-2 text-xs"
              placeholder="Option text"
              value={choiceDraft}
              onChange={(e) => setChoiceDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addChoice()}
            />
            <button onClick={addChoice} disabled={!choiceDraft.trim()} className="neon-button-sm disabled:opacity-50">
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

function TicketsTab({ guildId }: { guildId: string }) {
  const [view, setView] = useState<SupportTicketStatus | "ALL">("OPEN");
  const [rows, setRows] = useState<SupportTicketRow[]>([]);
  const { displayName } = useMemberNames(guildId, rows.map((r) => r.userId));

  function refresh() {
    api.getSupportTickets(guildId, view === "ALL" ? undefined : view).then(setRows);
  }
  useEffect(refresh, [guildId, view]);

  const openCount = rows.filter((r) => r.status === "OPEN").length;
  const claimedCount = rows.filter((r) => r.status === "CLAIMED").length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Tickets opened from the DM intake flow. Claim/Close happens via the buttons on the ticket's channel in Discord — this list is read-only visibility
        for staff.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Open" value={openCount} />
        <StatCard label="Claimed" value={claimedCount} />
        <StatCard label="Total Shown" value={rows.length} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["OPEN", "CLAIMED", "CLOSED", "ALL"] as const).map((v) => (
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
          <EmptyState
            icon="🎟️"
            title={`No ${view === "ALL" ? "" : view.toLowerCase()} tickets`}
            desc="Tickets land here once a member finishes a question chain in their DM."
          />
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((t) => (
              <div key={t.id} className="py-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">
                    {displayName(t.userId)} {t.flow ? `· ${t.flow.label}` : ""}
                  </span>
                  <span className="text-xs text-slate-500">{t.status.toLowerCase()}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {new Date(t.createdAt).toLocaleString()}
                  {t.channelId ? ` · channel ${t.channelId}` : ""}
                  {t.claimedById ? ` · claimed by ${displayName(t.claimedById)}` : ""}
                </p>
              </div>
            ))}
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
  const [settings, setSettings] = useState<SupportSettingsRow | null>(null);
  const [intro, setIntro] = useState("");
  const [noFlows, setNoFlows] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSupportSettings(guildId).then((s) => {
      setSettings(s);
      setIntro(s.introMessage ?? "");
      setNoFlows(s.noFlowsMessage ?? "");
    });
  }, [guildId]);

  async function save() {
    const next = await api.setSupportSettings(guildId, { introMessage: intro || null, noFlowsMessage: noFlows || null });
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!settings) return <p className="text-slate-400">Loading…</p>;

  const introPlaceholder = "👋 Hey! What do you need help with in **{server}**?";

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-slate-400">
        These two messages are guild-wide, not per-category — they're sent before the member has picked a category, so there's nothing to personalize per
        flow yet.
      </p>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Opening Message</label>
        <p className="text-xs text-slate-500 mb-2">
          Sent the moment a member DMs the bot for the first time, right above the category buttons. Use <code className="text-neon-blue">{"{server}"}</code>{" "}
          and <code className="text-neon-blue">{"{user}"}</code> to personalize it.
        </p>
        <textarea
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-1"
          rows={3}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          placeholder={introPlaceholder}
        />
        <p className="text-xs text-slate-600">Leave blank to use the default wording shown above.</p>
      </NeonCard>

      <NeonCard>
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">No Categories Configured Message</label>
        <p className="text-xs text-slate-500 mb-2">
          Sent instead of the category buttons if the module is enabled but no categories have been created yet (or none are enabled).
        </p>
        <textarea
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-1"
          rows={2}
          value={noFlows}
          onChange={(e) => setNoFlows(e.target.value)}
          placeholder="⚠️ Support requests aren't set up yet — an admin needs to add a category first."
        />
        <p className="text-xs text-slate-600">Leave blank to use the default wording shown above.</p>
      </NeonCard>

      <div className="flex items-center gap-3">
        <button onClick={save} className="neon-button">
          Save Settings
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved ✓</span>}
      </div>
    </div>
  );
}
