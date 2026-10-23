"use client";

import Link from "next/link";
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

const STATUS_STYLES: Record<SupportTicketStatus, string> = {
  DRAFT: "bg-slate-500/10 border-slate-500/30 text-slate-400",
  OPEN: "bg-neon-blue/10 border-neon-blue/40 text-neon-blue",
  CLAIMED: "bg-amber-500/10 border-amber-500/40 text-amber-400",
  CLOSED: "bg-slate-600/10 border-slate-600/30 text-slate-500",
};

function StatusPill({ status }: { status: SupportTicketStatus }) {
  return (
    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${STATUS_STYLES[status]}`}>
      {status.toLowerCase()}
    </span>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function TicketsTab({ guildId }: { guildId: string }) {
  const [view, setView] = useState<SupportTicketStatus | "ALL">("OPEN");
  const [rows, setRows] = useState<SupportTicketRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { displayName } = useMemberNames(guildId, rows.flatMap((r) => [r.userId, r.claimedById].filter(Boolean) as string[]));

  function refresh() {
    api.getSupportTickets(guildId, view === "ALL" ? undefined : view).then(setRows);
  }
  useEffect(refresh, [guildId, view]);

  const openCount = rows.filter((r) => r.status === "OPEN").length;
  const claimedCount = rows.filter((r) => r.status === "CLAIMED").length;
  const closedCount = rows.filter((r) => r.status === "CLOSED").length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Tickets opened from the DM intake flow. Claim/Close happens via the buttons on the ticket's channel in Discord — this list is read-only visibility
        for staff, with a full transcript kept even after the channel is deleted on close.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Open" value={openCount} />
        <StatCard label="Claimed" value={claimedCount} />
        <StatCard label="Closed" value={closedCount} />
        <StatCard label="Total Shown" value={rows.length} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["OPEN", "CLAIMED", "CLOSED", "ALL"] as const).map((v) => (
          <button
            key={v}
            onClick={() => {
              setView(v);
              setExpandedId(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
              view === v ? "bg-base-800 border-neon-blue/40 text-neon-blue" : "bg-base-950 border-white/10 text-slate-400 hover:text-slate-200"
            }`}
          >
            {v.toLowerCase()}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <NeonCard>
          <EmptyState
            icon="🎟️"
            title={`No ${view === "ALL" ? "" : view.toLowerCase()} tickets`}
            desc="Tickets land here once a member finishes a question chain in their DM."
          />
        </NeonCard>
      ) : (
        <div className="space-y-2.5">
          {rows.map((t) => (
            <NeonCard key={t.id} className="!p-0 overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium truncate">{displayName(t.userId)}</span>
                    {t.flow && <span className="text-xs text-slate-500 truncate">· {t.flow.label}</span>}
                    <StatusPill status={t.status} />
                  </div>
                  <p className="text-xs text-slate-500">
                    {timeAgo(t.createdAt)}
                    {t.claimedById ? ` · claimed by ${displayName(t.claimedById)}` : ""}
                    {t.transcript.length > 0 ? ` · ${t.transcript.length} message(s)` : ""}
                  </p>
                </div>
                <span className="text-slate-500 text-xs shrink-0">{expandedId === t.id ? "Hide ▲" : "View ▼"}</span>
              </button>

              {expandedId === t.id && (
                <div className="border-t border-white/5 px-4 py-3">
                  {t.answers.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Intake answers</p>
                      <div className="space-y-1.5">
                        {t.answers.map((a, i) => (
                          <div key={i} className="bg-base-950 border border-white/10 rounded-lg px-3 py-2 text-xs">
                            <p className="text-slate-500 mb-0.5">{a.prompt}</p>
                            <p className="text-slate-200">{a.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Transcript</p>
                  {t.transcript.length === 0 ? (
                    <p className="text-xs text-slate-500">No messages relayed yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                      {t.transcript.map((entry, i) => (
                        <div
                          key={i}
                          className={`rounded-lg px-3 py-2 text-xs ${
                            entry.from === "system"
                              ? "bg-base-950/60 border border-white/5 text-slate-500 italic"
                              : entry.from === "staff"
                              ? "bg-neon-blue/5 border border-neon-blue/15"
                              : "bg-base-800 border border-white/10"
                          }`}
                        >
                          {entry.from !== "system" && (
                            <div className="flex items-center justify-between mb-0.5">
                              <span className={entry.from === "staff" ? "text-neon-blue font-medium" : "text-slate-300 font-medium"}>
                                {entry.from === "staff" ? "Staff" : displayName(t.userId)}
                              </span>
                              <span className="text-slate-600">{new Date(entry.at).toLocaleString()}</span>
                            </div>
                          )}
                          <p className="whitespace-pre-wrap break-words text-slate-200">{entry.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {t.channelId && t.status !== "CLOSED" && <p className="text-xs text-slate-600 mt-3">Channel ID: {t.channelId}</p>}
                </div>
              )}
            </NeonCard>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface MessageFieldDef {
  key: keyof SupportSettingsRow;
  label: string;
  hint: string;
  placeholder: string;
  rows?: number;
}

const MESSAGE_FIELDS: MessageFieldDef[] = [
  {
    key: "introMessage",
    label: "Opening Message",
    hint: "Sent once this server is the one being asked about — right above the category buttons.",
    placeholder: "👋 Hey! What do you need help with in **{server}**?",
    rows: 3,
  },
  {
    key: "noFlowsMessage",
    label: "No Categories Configured Message",
    hint: "Sent instead of the category buttons if the module is enabled but no categories have been created yet (or none are enabled).",
    placeholder: "⚠️ Support requests aren't set up yet — an admin needs to add a category first.",
    rows: 2,
  },
  {
    key: "alreadyOpenMessage",
    label: "Already In Progress Message",
    hint: "Shown when a member picks a category but already has a request in progress (mid-questions, or an open ticket) — they're told to finish that one first.",
    placeholder: "You already have a support request in progress in your DMs — finish that one first.",
    rows: 2,
  },
  {
    key: "ticketOpenedMessage",
    label: "Ticket Opened Message",
    hint: "Sent the moment the question chain finishes and the ticket channel is created. Use {category} for the category name.",
    placeholder: "✅ Thanks — I've opened a support ticket for your **{category}** request. A staff member will reply here in this DM once they pick it up.",
    rows: 2,
  },
  {
    key: "ticketClaimedMessage",
    label: "Ticket Claimed Message",
    hint: "Sent when a staff member clicks Claim on the ticket channel.",
    placeholder: "🙋 A staff member has picked up your support ticket.",
    rows: 2,
  },
  {
    key: "ticketClosedMessage",
    label: "Ticket Closed Message",
    hint: "Sent when the ticket is closed, right before the channel is deleted.",
    placeholder: "🔒 Your support ticket has been closed. DM me again if you need anything else.",
    rows: 2,
  },
];

function SettingsTab({ guildId }: { guildId: string }) {
  const [settings, setSettings] = useState<SupportSettingsRow | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSupportSettings(guildId).then((s) => {
      setSettings(s);
      setDraft(Object.fromEntries(MESSAGE_FIELDS.map((f) => [f.key, (s[f.key] as string | null) ?? ""])));
    });
  }, [guildId]);

  async function save() {
    const payload = Object.fromEntries(MESSAGE_FIELDS.map((f) => [f.key, draft[f.key] || null]));
    const next = await api.setSupportSettings(guildId, payload);
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!settings) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-slate-400">
        Every reply this module sends outside of the category question chains themselves — customize each one for this server's tone, or leave any of
        them blank to use the default wording shown as a placeholder. Use <code className="text-neon-blue">{"{server}"}</code> and{" "}
        <code className="text-neon-blue">{"{user}"}</code> anywhere, plus <code className="text-neon-blue">{"{category}"}</code> on the Ticket Opened
        message.
      </p>

      <div className="text-xs text-slate-500 bg-base-800/60 border border-white/5 rounded-lg px-3 py-2.5">
        If a member shares more than one server with Support DM enabled, they're asked which server first. That prompt is account-wide — not something
        this server's settings can own — and is edited from{" "}
        <Link href={`/dashboard/${guildId}/bot-customization`} className="text-neon-blue hover:underline">
          Owner → Bot Customization
        </Link>
        . Everything below always plays right after, once this server has been chosen.
      </div>

      {MESSAGE_FIELDS.map((f) => (
        <NeonCard key={f.key}>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">{f.label}</label>
          <p className="text-xs text-slate-500 mb-2">{f.hint}</p>
          <textarea
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-1"
            rows={f.rows ?? 2}
            value={draft[f.key] ?? ""}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            placeholder={f.placeholder}
          />
          <p className="text-xs text-slate-600">Leave blank to use the default wording shown above.</p>
        </NeonCard>
      ))}

      <div className="flex items-center gap-3">
        <button onClick={save} className="neon-button">
          Save Settings
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved ✓</span>}
      </div>
    </div>
  );
}
