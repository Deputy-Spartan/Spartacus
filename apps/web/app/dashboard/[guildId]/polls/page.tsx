"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { EmojiPicker } from "../../../../components/ui/EmojiPicker";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { useBotAvatar } from "../../../../lib/useBotAvatar";
import { useMemberNames } from "../../../../lib/useMemberNames";
import { api, type PollRow, type PollInput, type PollDurationMode } from "../../../../lib/api";

type Tab = "active" | "past" | "create";

const COLOR_PRESETS = ["#00E5FF", "#5865F2", "#7CB88F", "#D8AE6B", "#C77B7B", "#B98AD1"];

// Default numbering for a new option: 1️⃣.."9️⃣, then 🔟 for ten. Discord has
// no single-emoji glyph for 11+ (keycap digits don't combine into one
// reaction), so past ten this falls back to 🇦 🇧 🇨... — still unique,
// still one click, just letters instead of numbers. Always just a default:
// every option's emoji can be changed with the picker next to it.
function defaultEmojiFor(position: number): string {
  if (position >= 1 && position <= 9) return `${position}⃣`;
  if (position === 10) return "🔟";
  return String.fromCodePoint(0x1f1e6 + ((position - 11) % 26)); // 11 -> 🇦, 12 -> 🇧, ...
}

// Presets plus a raw <input type=color> for any custom RGB value — shared
// by the Embed Color and Result Bar Color fields.
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {COLOR_PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full border-2 ${value.toLowerCase() === c.toLowerCase() ? "border-white" : "border-transparent"}`}
          style={{ background: c }}
          title={c}
        />
      ))}
      <label className="relative w-6 h-6 rounded-full border-2 border-dashed border-white/20 cursor-pointer overflow-hidden shrink-0" title="Custom color">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#00e5ff"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute -top-1 -left-1 w-8 h-8 cursor-pointer"
        />
      </label>
      <span className="text-xs font-mono text-slate-500">{value}</span>
    </div>
  );
}

interface Option {
  label: string;
  emoji: string;
}

interface Draft {
  question: string;
  channelId: string | null;
  options: Option[];
  color: string;
  barColor: string;
  isPrivate: boolean;
  allowWriteIn: boolean;
  durationMode: PollDurationMode;
  hours: string;
  minutes: string;
}

const EMPTY_DRAFT: Draft = {
  question: "",
  channelId: null,
  options: [
    { label: "", emoji: defaultEmojiFor(1) },
    { label: "", emoji: defaultEmojiFor(2) },
  ],
  color: "#00E5FF",
  barColor: "#00E5FF",
  isPrivate: false,
  allowWriteIn: false,
  durationMode: "MANUAL",
  hours: "24",
  minutes: "0",
};

export default function PollsPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="POLLS"
        title="Polls"
        description="Posts a colored embed with whichever emoji options you define, tracks votes live as members react, and can hide the running tally until the poll ends. Closes on a timer or only when you stop it."
      />
      <PollsTabs guildId={guildId} />
    </div>
  );
}

function PollsTabs({ guildId }: { guildId: string }) {
  const [tab, setTab] = useState<Tab>("active");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [draftKey, setDraftKey] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

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
          Active Polls
        </button>
        <button
          onClick={() => setTab("past")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "past" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Past Polls
        </button>
        <button
          onClick={() => {
            setDraft(EMPTY_DRAFT);
            setDraftKey((k) => k + 1);
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

      {tab === "active" && (
        <PollsList
          guildId={guildId}
          refreshKey={refreshKey}
          filter="active"
          onGoCreate={() => {
            setDraft(EMPTY_DRAFT);
            setDraftKey((k) => k + 1);
            setTab("create");
          }}
        />
      )}
      {tab === "past" && (
        <PollsList
          guildId={guildId}
          refreshKey={refreshKey}
          filter="past"
          onGoCreate={() => {
            setDraft(EMPTY_DRAFT);
            setDraftKey((k) => k + 1);
            setTab("create");
          }}
        />
      )}
      {tab === "create" && (
        <CreateWizard
          key={draftKey}
          guildId={guildId}
          draft={draft}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
          onCreated={() => {
            setTab("active");
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active / Past Polls
// ---------------------------------------------------------------------------

function PollsList({
  guildId,
  refreshKey,
  filter,
  onGoCreate,
}: {
  guildId: string;
  refreshKey: number;
  filter: "active" | "past";
  onGoCreate: () => void;
}) {
  const confirm = useConfirm();
  const [allRows, setAllRows] = useState<PollRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = allRows ? allRows.filter((r) => (filter === "active" ? !r.closed : r.closed)) : null;
  const { displayName } = useMemberNames(guildId, rows?.flatMap((r) => [...r.votes.map((v) => v.userId), ...r.writeIns.map((w) => w.userId)]) ?? []);

  function refresh() {
    api.getPolls(guildId).then(setAllRows);
  }
  useEffect(refresh, [guildId, refreshKey]);

  async function stop(poll: PollRow) {
    if (!(await confirm(`Stop "${poll.question}" now? This reveals the final results immediately.`))) return;
    setError(null);
    try {
      await api.stopPoll(guildId, poll.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop poll");
    }
  }

  async function remove(poll: PollRow) {
    if (!(await confirm(`Delete "${poll.question}"? This removes it (and its votes/write-ins) from the dashboard — delete the Discord message yourself if you want it gone too.`)))
      return;
    setError(null);
    try {
      await api.deletePoll(guildId, poll.id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete poll");
    }
  }

  if (rows === null) return <p className="text-sm text-slate-500">Loading…</p>;

  if (rows.length === 0) {
    return (
      <NeonCard>
        <div className="text-center py-10">
          <p className="text-sm text-slate-400 mb-1">{filter === "active" ? "No active polls." : "No past polls yet."}</p>
          <p className="text-xs text-slate-600 mb-4">
            {filter === "active" ? "Create one to get live, reaction-based voting in any channel." : "Closed polls will show up here."}
          </p>
          {filter === "active" && (
            <button onClick={onGoCreate} className="neon-button-sm">
              + Create New
            </button>
          )}
        </div>
      </NeonCard>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</p>}
      {rows.map((p) => {
        const counts = p.emojis.map((e) => p.votes.filter((v) => v.emoji === e).length);
        const total = counts.reduce((a, b) => a + b, 0);
        const statusLabel = p.closed ? "Closed" : p.durationMode === "TIMER" ? "Open · timer" : "Open · manual stop";
        const statusColor = p.closed ? "text-slate-500" : "text-emerald-400";

        return (
          <NeonCard key={p.id}>
            <div className="flex items-center justify-between gap-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                <p className="font-medium truncate">{p.question}</p>
                <p className="text-xs text-slate-500">
                  <span className={statusColor}>{statusLabel}</span> · {total} vote{total === 1 ? "" : "s"}
                  {p.allowWriteIn ? ` · ${p.writeIns.length} write-in(s)` : ""}
                  {p.isPrivate && !p.closed ? " · 🔒 hidden" : ""}
                </p>
              </button>
              <div className="flex items-center gap-3 shrink-0">
                {!p.closed && (
                  <button onClick={() => stop(p)} className="text-xs text-amber-400 hover:text-amber-300">
                    Stop Now
                  </button>
                )}
                <button onClick={() => remove(p)} className="text-xs text-slate-500 hover:text-rose-400">
                  Remove
                </button>
              </div>
            </div>

            {expanded === p.id && (
              <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                <div className="space-y-1.5">
                  {p.options.map((opt, i) => {
                    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
                    const hidden = p.isPrivate && !p.closed;
                    return (
                      <div key={i} className="text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span>
                            {p.emojis[i]} {opt}
                          </span>
                          <span className="text-xs text-slate-500">{hidden ? "🔒 hidden" : `${counts[i]} (${pct}%)`}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-base-800 overflow-hidden">
                          {!hidden && <div className="h-full" style={{ width: `${pct}%`, background: p.barColor || "#00E5FF" }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {p.allowWriteIn && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Write-in answers ({p.writeIns.length})</p>
                    {p.writeIns.length === 0 ? (
                      <p className="text-xs text-slate-600">None submitted yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {p.writeIns.map((w) => (
                          <div key={w.id} className="bg-base-950 border border-white/10 rounded-lg px-3 py-2 text-xs">
                            <span className="text-neon-blue">{displayName(w.userId)}:</span> {w.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </NeonCard>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create — 3-step wizard (Question → Options → Settings)
// ---------------------------------------------------------------------------

function CreateWizard({
  guildId,
  draft,
  onChange,
  onCreated,
}: {
  guildId: string;
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function validateStep(n: number): string | null {
    if (n === 1) {
      if (!draft.question.trim()) return "Enter a question.";
      if (!draft.channelId) return "Pick a channel to post this poll in.";
    }
    if (n === 2) {
      const filled = draft.options.filter((o) => o.label.trim());
      if (filled.length < 2) return "Add at least 2 options with a label.";
      const emojis = filled.map((o) => o.emoji);
      if (new Set(emojis).size !== emojis.length) return "Each option needs a different emoji.";
    }
    return null;
  }

  function goStep(n: number) {
    if (n > step) {
      const err = validateStep(step);
      if (err) return setError(err);
    }
    setError(null);
    setStep(n);
  }

  function addOption() {
    onChange({ options: [...draft.options, { label: "", emoji: defaultEmojiFor(draft.options.length + 1) }] });
  }
  function updateOption(i: number, patch: Partial<Option>) {
    const next = [...draft.options];
    next[i] = { ...next[i], ...patch };
    onChange({ options: next });
  }
  function removeOption(i: number) {
    onChange({ options: draft.options.filter((_, idx) => idx !== i) });
  }

  async function create() {
    const err = validateStep(2) || validateStep(1);
    if (err) return setError(err);
    setError(null);
    setCreating(true);
    try {
      const filled = draft.options.filter((o) => o.label.trim());
      const payload: PollInput = {
        channelId: draft.channelId!,
        question: draft.question.trim(),
        options: filled.map((o) => o.label.trim()),
        emojis: filled.map((o) => o.emoji),
        color: draft.color,
        barColor: draft.barColor,
        isPrivate: draft.isPrivate,
        allowWriteIn: draft.allowWriteIn,
        durationMode: draft.durationMode,
        hours: Number(draft.hours) || 0,
        minutes: Number(draft.minutes) || 0,
      };
      await api.addPoll(guildId, payload);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create poll");
    }
    setCreating(false);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="min-w-0">
        <NeonCard>
          <div className="flex gap-1 mb-4">
            {(["1. Question", "2. Options", "3. Settings"] as const).map((label, i) => (
              <button
                key={label}
                onClick={() => goStep(i + 1)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  step === i + 1
                    ? "bg-neon-blue/10 border-neon-blue/40 text-neon-blue"
                    : step > i + 1
                    ? "bg-base-800 border-white/10 text-emerald-400"
                    : "bg-base-950 border-white/10 text-slate-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {step === 1 && (
            <>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Question</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
                placeholder="Best patch this season?"
                value={draft.question}
                onChange={(e) => onChange({ question: e.target.value })}
              />
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Post In Channel</label>
              <ChannelSelect guildId={guildId} value={draft.channelId} onChange={(id) => onChange({ channelId: id })} kind="text" />
              <div className="flex justify-end mt-4">
                <button onClick={() => goStep(2)} className="neon-button-sm">
                  Next: Options →
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-xs text-slate-500 mb-3">Add each option with its own reaction emoji — members click the reaction to vote.</p>
              <div className="space-y-2 mb-3">
                {draft.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2 bg-base-950 border border-white/10 rounded-lg p-2">
                    <EmojiPicker guildId={guildId} value={o.emoji} onChange={(emoji) => updateOption(i, { emoji })} />
                    <input
                      className="flex-1 bg-base-900 border border-white/10 rounded-lg p-2 text-sm"
                      placeholder="Option label"
                      value={o.label}
                      onChange={(e) => updateOption(i, { label: e.target.value })}
                    />
                    <button onClick={() => removeOption(i)} className="text-slate-500 hover:text-rose-400 text-sm px-1" disabled={draft.options.length <= 2}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={addOption} disabled={draft.options.length >= 20} className="neon-button-sm disabled:opacity-50">
                + Add option
              </button>

              <div className="mt-5 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Allow write-in answers</p>
                    <p className="text-xs text-slate-500">
                      Adds a "✍️ Write In" button — clicking it opens a pop-up form right there in the channel to collect a typed answer, if none of the
                      options fit. Answers show up back here on the Active &amp; Past Polls tab.
                    </p>
                  </div>
                  <ToggleSwitch enabled={draft.allowWriteIn} onChange={(v) => onChange({ allowWriteIn: v })} />
                </div>
              </div>

              <div className="flex justify-between mt-4">
                <button onClick={() => goStep(1)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
                  ← Back
                </button>
                <button onClick={() => goStep(3)} className="neon-button-sm">
                  Next: Settings →
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-1">Embed Color</label>
                  <p className="text-[11px] text-slate-600 mb-2">The left border accent on the real Discord message.</p>
                  <ColorPicker value={draft.color} onChange={(c) => onChange({ color: c })} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500 block mb-1">Result Bar Color</label>
                  <p className="text-[11px] text-slate-600 mb-2">
                    Only the dashboard's own bars — Discord embeds can't color plain text, so the live message's bars are fixed block characters.
                  </p>
                  <ColorPicker value={draft.barColor} onChange={(c) => onChange({ barColor: c })} />
                </div>
              </div>

              <div className="flex items-center justify-between mb-4 bg-base-950 border border-white/10 rounded-lg px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Hide results until it ends</p>
                  <p className="text-xs text-slate-500">The embed's tally stays locked — live reaction counts on the message are still natively visible on Discord, that part can't be hidden.</p>
                </div>
                <ToggleSwitch enabled={draft.isPrivate} onChange={(v) => onChange({ isPrivate: v })} />
              </div>

              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Duration</label>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => onChange({ durationMode: "TIMER" })}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border ${
                    draft.durationMode === "TIMER" ? "bg-neon-blue/10 border-neon-blue/40 text-neon-blue" : "bg-base-950 border-white/10 text-slate-400"
                  }`}
                >
                  ⏱ Timer
                </button>
                <button
                  onClick={() => onChange({ durationMode: "MANUAL" })}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border ${
                    draft.durationMode === "MANUAL" ? "bg-neon-blue/10 border-neon-blue/40 text-neon-blue" : "bg-base-950 border-white/10 text-slate-400"
                  }`}
                >
                  🖐 Manual stop only
                </button>
              </div>
              {draft.durationMode === "TIMER" && (
                <div className="flex gap-3 mb-2">
                  <div className="flex-1">
                    <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Hours</label>
                    <input
                      className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                      value={draft.hours}
                      onChange={(e) => onChange({ hours: e.target.value })}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Minutes</label>
                    <input
                      className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
                      value={draft.minutes}
                      onChange={(e) => onChange({ minutes: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-between mt-4">
                <button onClick={() => goStep(2)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
                  ← Back
                </button>
                <button onClick={create} disabled={creating} className="neon-button disabled:opacity-50">
                  {creating ? "Posting…" : "Post Poll"}
                </button>
              </div>
            </>
          )}

          {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}
        </NeonCard>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Live preview
        </p>
        <PollPreview draft={draft} />
      </div>
    </div>
  );
}

function PollPreview({ draft }: { draft: Draft }) {
  const avatarUrl = useBotAvatar();
  const filled = draft.options.filter((o) => o.label.trim());
  const demoVotes = filled.map((_, i) => (i === 0 ? 5 : i === 1 ? 3 : 1));
  const total = demoVotes.reduce((a, b) => a + b, 0) || 1;

  const footer = draft.durationMode === "TIMER" ? `⏱ Ends in ${draft.hours || 0}h ${draft.minutes || 0}m` : "🖐 Open until a staff member stops it";

  return (
    <div className="rounded-lg bg-[#313338] p-4 font-sans">
      <div className="flex gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-full bg-neon-gradient flex items-center justify-center text-sm font-bold text-base-950">S</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[#f2f3f5] font-medium text-sm">Spartacus</span>
            <span className="bg-[#5865f2] text-white text-[10px] px-1 rounded">BOT</span>
            <span className="text-[#949ba4] text-xs">Today at 7:40 PM</span>
          </div>

          <div className="mt-2 rounded bg-[#2b2d31] border-l-4 p-3 max-w-sm" style={{ borderColor: draft.color }}>
            <p className="text-[#f2f3f5] font-semibold text-sm mb-2.5">🗳️ {draft.question || "Your question here"}</p>
            {filled.length === 0 && <p className="text-[#949ba4] text-xs italic">Add some options to see them here.</p>}
            {filled.map((o, i) => {
              const pct = draft.isPrivate ? null : Math.round((demoVotes[i] / total) * 100);
              return (
                <div key={i} className="mb-2 text-xs">
                  <div className="flex items-center justify-between mb-1 text-[#dbdee1]">
                    <span>
                      {o.emoji} {o.label}
                    </span>
                    <span className="text-[#949ba4]">{draft.isPrivate ? "🔒" : `${pct}%`}</span>
                  </div>
                  <div className="h-2.5 rounded bg-[#1e1f22] overflow-hidden">
                    {!draft.isPrivate && <div className="h-full" style={{ width: `${pct}%`, background: draft.barColor }} />}
                  </div>
                </div>
              );
            })}
            <p className="text-[#949ba4] text-[10.5px] mt-2">
              {draft.isPrivate ? "🔒 Results hidden · " : ""}
              {footer}
              {draft.allowWriteIn ? " · Click ✍️ Write In below to submit your own answer" : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {filled.map((o, i) => (
              <span key={i} className="bg-[#2b2d31] border border-[#3f4248] rounded-full px-2 py-0.5 text-xs text-[#dbdee1]">
                {o.emoji} {demoVotes[i]}
              </span>
            ))}
          </div>
          {draft.allowWriteIn && (
            <div className="mt-1.5">
              <span className="bg-[#4e5058] text-[#f2f3f5] text-xs px-2.5 py-1.5 rounded inline-block">✍️ Write In</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
