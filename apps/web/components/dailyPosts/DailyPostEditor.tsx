"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DAILY_POST_LABELS,
  builtInDailyPosts,
  dailyPostTokenValues,
  dailyPostTokens,
  defaultDailyPostMessage,
  parsePostTime,
  zonedClock,
  type DailyPostItem,
} from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { ChannelSelect } from "../ui/ChannelSelect";
import { RoleSelect } from "../ui/RoleSelect";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { SaveStatus } from "../ui/SaveStatus";
import { SendTestButton } from "../ui/SendTestButton";
import { FormError } from "../ui/FormError";
import { useConfirm } from "../ui/ConfirmDialog";
import { MessageDesigner, TokenChips, toCreatorState, withTokens } from "../embedCreator/MessageDesigner";
import { EmbedCreatorPreview } from "../embedCreator/EmbedCreatorPreview";
import { DiscordLimitsCard } from "../embedCreator/DiscordLimitsCard";
import { checkDiscordLimits } from "../../lib/discordLimits";
import { allTimeZones, browserTimeZone, timeZoneLabel } from "../../lib/timeZones";
import { useAutoSave } from "../../lib/useAutoSave";
import {
  api,
  type DailyPostConfigRow,
  type DailyPostCreatorData,
  type DailyPostEntryRow,
  type DailyPostFeedKind,
  type EmbedCreatorPresetRow,
} from "../../lib/api";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeLabel(postTime: string): string {
  const minutes = parsePostTime(postTime);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function nextPostLabel(config: DailyPostConfigRow): string {
  if (!config.enabled) return "This feed is off, so nothing is scheduled.";
  if (!config.channelId) return "Pick a channel to start the schedule.";
  if (config.days.length === 0) return "Pick at least one day to post on.";
  const clock = zonedClock(config.timeZone);
  const at = `${timeLabel(config.postTime)} ${timeZoneLabel(config.timeZone)}`;
  for (let offset = 0; offset <= 7; offset++) {
    const weekday = (clock.weekday + offset) % 7;
    if (!config.days.includes(weekday)) continue;
    if (offset === 0 && (config.lastPostedOn === clock.date || clock.minutes >= parsePostTime(config.postTime))) continue;
    const day = offset === 0 ? "today" : offset === 1 ? "tomorrow" : DAY_NAMES[weekday];
    return `Next post: ${day} at ${at}.`;
  }
  return `Next post: ${DAY_NAMES[clock.weekday]} at ${at}.`;
}

// "Stay hungry, stay foolish. | Steve Jobs" on each line. Questions have no author.
function parseBulk(text: string, kind: DailyPostFeedKind): Array<{ text: string; author: string | null }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const bar = kind === "QUOTE" ? line.lastIndexOf("|") : -1;
      if (bar < 0) return { text: line, author: null };
      return { text: line.slice(0, bar).trim(), author: line.slice(bar + 1).trim() || null };
    })
    .filter((item) => item.text);
}

const labelClass = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const inputClass = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const dashedButton =
  "w-full py-3 rounded-xl border border-dashed border-white/15 text-slate-400 text-sm font-medium hover:border-neon-blue/50 hover:text-neon-blue transition-colors disabled:opacity-40 mb-6";

// One feed's whole settings tab: where and when it posts, what the post
// looks like (the same editor as the Embed Creator), and its list.
export function DailyPostEditor({ guildId, kind }: { guildId: string; kind: DailyPostFeedKind }) {
  const confirm = useConfirm();
  const isQuote = kind === "QUOTE";
  const noun = isQuote ? "quote" : "question";
  const label = DAILY_POST_LABELS[kind];
  const tokens = useMemo(() => dailyPostTokens(kind), [kind]);
  const zones = useMemo(() => allTimeZones(), []);

  const [config, setConfig] = useState<DailyPostConfigRow | null>(null);
  const [message, setMessage] = useState<DailyPostCreatorData | null>(null);
  const [entries, setEntries] = useState<DailyPostEntryRow[]>([]);
  const [builtInCount, setBuiltInCount] = useState(0);
  const [presets, setPresets] = useState<EmbedCreatorPresetRow[]>([]);

  const [newText, setNewText] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [adding, setAdding] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editAuthor, setEditAuthor] = useState("");

  useEffect(() => {
    api.getDailyPostFeed(guildId, kind).then((feed) => {
      setConfig(feed.config);
      setMessage(feed.config.creatorData ?? (defaultDailyPostMessage(kind) as unknown as DailyPostCreatorData));
      setEntries(feed.entries);
      setBuiltInCount(feed.builtInCount);
    });
    api.getEmbedCreatorPresets(guildId).then(setPresets);
  }, [guildId, kind]);

  const saveValue = useMemo(() => (config && message ? { ...config, creatorData: message } : null), [config, message]);
  async function save() {
    if (!saveValue) return;
    const saved = await api.saveDailyPostConfig(guildId, kind, saveValue);
    // Only what the server decides comes back in; the rest stays as typed.
    setConfig((c) => (c ? { ...c, lastPostedOn: saved.lastPostedOn, postCount: saved.postCount } : c));
  }
  const status = useAutoSave(saveValue, save);

  if (!config || !message) return <p className="text-slate-400">Loading…</p>;

  const patch = (next: Partial<DailyPostConfigRow>) => setConfig({ ...config, ...next });

  async function resetMessage() {
    if (!(await confirm(`Replace this message with the default ${label} design? Your current text, embeds and buttons will be lost.`, { confirmLabel: "Use Default" }))) return;
    setMessage(defaultDailyPostMessage(kind) as unknown as DailyPostCreatorData);
    patch({ savedEmbedId: null });
  }

  // ---- the list ----
  async function addEntries() {
    const items = bulk ? parseBulk(bulkText, kind) : [{ text: newText.trim(), author: isQuote ? newAuthor.trim() || null : null }];
    if (items.length === 0 || !items[0].text) return setListError(`Type a ${noun} first.`);
    setListError(null);
    setAdding(true);
    try {
      const feed = await api.addDailyPostEntries(guildId, kind, items);
      setEntries(feed.entries);
      setNewText("");
      setNewAuthor("");
      setBulkText("");
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Couldn't add that.");
    } finally {
      setAdding(false);
    }
  }
  async function removeEntry(id: string) {
    if (!(await confirm(`Remove this ${noun} from your list?`))) return;
    await api.deleteDailyPostEntry(guildId, kind, id);
    setEntries((list) => list.filter((e) => e.id !== id));
  }
  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    const row = await api.updateDailyPostEntry(guildId, kind, id, { text: editText, author: isQuote ? editAuthor : null });
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, text: row.text, author: row.author } : e)));
    setEditingId(null);
  }
  async function resetList() {
    if (!(await confirm(`Start the list over? Every ${noun} can come up again, including ones that already posted.`, { confirmLabel: "Start Over" }))) return;
    const feed = await api.resetDailyPostList(guildId, kind);
    setEntries(feed.entries);
  }

  // Sending uses what's saved, so anything still waiting on autosave goes first.
  async function send(test: boolean) {
    await save();
    await api.sendDailyPost(guildId, kind, test);
    if (!test) {
      const feed = await api.getDailyPostFeed(guildId, kind);
      setEntries(feed.entries);
      setConfig((c) => (c ? { ...c, lastPostedOn: feed.config.lastPostedOn, postCount: feed.config.postCount } : c));
    }
  }

  const savedPreset = config.savedEmbedId ? presets.find((p) => p.id === config.savedEmbedId) ?? null : null;
  const state = savedPreset ? { ...toCreatorState(message), ...savedPreset.data } : toCreatorState(message);
  const limits = checkDiscordLimits(state);

  const sample: DailyPostItem = entries[0] ?? (config.useBuiltIn ? builtInDailyPosts(kind)[0] : null) ?? { text: isQuote ? "Your quote shows here." : "Your question shows here.", author: "Author" };
  const sampleTokens = dailyPostTokenValues(kind, sample, { date: zonedClock(config.timeZone).longDate, number: config.postCount + 1, server: "Your Server" });
  const unusedCustom = entries.filter((e) => !e.usedAt).length;
  const nothingToPost = entries.length === 0 && !config.useBuiltIn;

  return (
    <div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,1fr)] gap-5 items-start">
        <div className="min-w-0">
          <NeonCard className="mb-4">
            <div className="flex items-center justify-between gap-4 pb-3 mb-4 border-b border-white/5">
              <div>
                <p className="font-medium">Post a {label}</p>
                <p className="text-xs text-slate-500">
                  This switch is only for {isQuote ? "quotes" : "questions"}. The module switch at the top of the page turns both feeds off at once.
                </p>
              </div>
              <ToggleSwitch enabled={config.enabled} onChange={(v) => patch({ enabled: v })} label={`Post a ${label}`} />
            </div>

            <label className={labelClass}>Channel</label>
            <ChannelSelect guildId={guildId} value={config.channelId} onChange={(id) => patch({ channelId: id || null })} />
            <p className="text-xs text-slate-600 -mt-2 mb-4">
              {isQuote ? "Questions" : "Quotes"} have their own channel on the other tab. Pick the same channel there to post both in one place.
            </p>

            <label className={labelClass}>Ping Role (optional)</label>
            <RoleSelect guildId={guildId} value={config.pingRoleId} onChange={(id) => patch({ pingRoleId: id || null })} placeholder="No ping" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className={labelClass}>Post Time</label>
                <input type="time" className={inputClass} value={config.postTime} onChange={(e) => patch({ postTime: e.target.value || "09:00" })} />
              </div>
              <div>
                <label className={labelClass}>Time Zone</label>
                <select className={inputClass} value={config.timeZone} onChange={(e) => patch({ timeZone: e.target.value })}>
                  {!zones.some((z) => z.zone === config.timeZone) && <option value={config.timeZone}>{config.timeZone}</option>}
                  {zones.map((z) => (
                    <option key={z.zone} value={z.zone}>
                      {z.label}
                    </option>
                  ))}
                </select>
                {config.timeZone !== browserTimeZone() && (
                  <button type="button" onClick={() => patch({ timeZone: browserTimeZone() })} className="text-[11px] text-neon-blue hover:underline mt-1.5">
                    Use my time zone ({timeZoneLabel(browserTimeZone())})
                  </button>
                )}
              </div>
            </div>

            <label className={labelClass}>Days</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {DAYS.map((d, i) => {
                const on = config.days.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patch({ days: on ? config.days.filter((x) => x !== i) : [...config.days, i].sort() })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${on ? "border-neon-blue/60 bg-neon-blue/10 text-neon-blue" : "border-white/10 text-slate-500 hover:text-slate-300"}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mb-4">{nextPostLabel(config)}</p>

            <div className="flex items-center justify-between py-2.5 border-t border-white/5">
              <div>
                <p className="text-sm font-medium">Open a thread under each post</p>
                <p className="text-xs text-slate-500">{isQuote ? "Gives members a place to react to the quote." : "Keeps everyone's answers together, under the question."}</p>
              </div>
              <ToggleSwitch enabled={config.createThread} onChange={(v) => patch({ createThread: v })} label="Open a thread under each post" />
            </div>
          </NeonCard>

          <TokenChips tokens={tokens} note={isQuote ? "{quote} is replaced with the day's quote." : "{question} is replaced with the day's question."} />

          <MessageDesigner
            guildId={guildId}
            value={message}
            onChange={setMessage}
            savedEmbedId={config.savedEmbedId}
            onSavedEmbedChange={(id) => patch({ savedEmbedId: id })}
            onReset={resetMessage}
            savedEmbedNote={`Placeholders like ${isQuote ? "{quote}" : "{question}"} work inside it too.`}
          >
            <div className="flex items-center mt-4">
              <button type="button" onClick={() => save()} className="neon-button">
                Save
              </button>
              <SaveStatus status={status} />
            </div>
          </MessageDesigner>
        </div>

        <div className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <NeonCard>
            <p className="font-medium mb-3">Live Preview</p>
            <EmbedCreatorPreview guildId={guildId} state={withTokens(state, sampleTokens)} />
            {savedPreset && <p className="text-xs text-slate-500 mt-2">Showing the saved embed "{savedPreset.name}". That's what will post.</p>}
            <p className="text-xs text-slate-600 mt-2">The preview fills in an example {noun}. Each day's post uses the next one from your list.</p>

            <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
              <SendTestButton onSend={() => send(true)} disabled={!config.channelId || nothingToPost || limits.hasErrors} successMessage="Sent. Check the channel." />
              <SendTestButton
                onSend={() => send(false)}
                disabled={!config.channelId || nothingToPost || limits.hasErrors}
                label="Post Now"
                successMessage="Posted. It counts as today's post."
              />
              <p className="text-xs text-slate-600">
                Send Test posts a marked example and doesn't use up a {noun}. Post Now sends the real thing and counts as today's post, so the schedule won't send another one today.
              </p>
            </div>
          </NeonCard>
          <DiscordLimitsCard report={limits} />
        </div>
      </div>

      <NeonCard className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <p className="font-medium">
            Your {isQuote ? "Quotes" : "Questions"} ({entries.length})
          </p>
          <button type="button" onClick={resetList} className="text-[11px] text-slate-500 hover:text-neon-blue">
            Start the list over
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Nothing repeats until every {noun} has posted once. {entries.length > 0 ? `${unusedCustom} of your ${entries.length} ${unusedCustom === 1 && entries.length === 1 ? noun : `${noun}s`} haven't posted yet.` : ""}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Include the built-in list</p>
              <p className="text-xs text-slate-500">
                {builtInCount} ready-made {noun}s, mixed in with yours.
              </p>
            </div>
            <ToggleSwitch enabled={config.useBuiltIn} onChange={(v) => patch({ useBuiltIn: v })} label="Include the built-in list" />
          </div>
          <div className="rounded-lg border border-white/5 px-3 py-2.5">
            <label className="text-sm font-medium block mb-1.5">Posting order</label>
            <select className={inputClass} value={config.order} onChange={(e) => patch({ order: e.target.value as DailyPostConfigRow["order"] })}>
              <option value="RANDOM">Random</option>
              <option value="IN_ORDER">In order, yours first{config.useBuiltIn ? ", then the built-in list" : ""}</option>
            </select>
          </div>
        </div>
        {nothingToPost && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 mb-4">
            There's nothing to post yet. Add a {noun} below, or turn the built-in list on.
          </p>
        )}

        <div className="rounded-lg border border-white/5 p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">{bulk ? `Add several ${noun}s` : `Add a ${noun}`}</p>
            <button type="button" onClick={() => setBulk(!bulk)} className="text-[11px] text-neon-blue hover:underline">
              {bulk ? "Add one at a time" : "Add several at once"}
            </button>
          </div>
          {bulk ? (
            <>
              <textarea
                className={`${inputClass} min-h-32 font-mono text-xs`}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={isQuote ? "Stay hungry, stay foolish. | Steve Jobs\nFall seven times, stand up eight. | Japanese proverb" : "What's your go-to comfort food?\nWhat game are you playing this week?"}
              />
              <p className="text-xs text-slate-600 mt-1.5 mb-3">One per line.{isQuote ? " Put who said it after a | at the end of the line. Leave it off if you don't know." : ""}</p>
            </>
          ) : (
            <div className={`grid grid-cols-1 ${isQuote ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""} gap-2 mb-3`}>
              <textarea className={inputClass} rows={2} value={newText} onChange={(e) => setNewText(e.target.value)} placeholder={isQuote ? "The quote" : "The question"} maxLength={1500} />
              {isQuote && <input className={`${inputClass} self-start`} value={newAuthor} onChange={(e) => setNewAuthor(e.target.value)} placeholder="Who said it (optional)" maxLength={150} />}
            </div>
          )}
          <button type="button" onClick={addEntries} disabled={adding} className="neon-button-sm disabled:opacity-40">
            {adding ? "Adding…" : bulk ? "Add All" : `Add ${isQuote ? "Quote" : "Question"}`}
          </button>
          <FormError message={listError} />
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">
            You haven't added any {noun}s yet. {config.useBuiltIn ? "The built-in list covers you until you do." : ""}
          </p>
        ) : (
          <div className="divide-y divide-white/5 max-h-[28rem] overflow-y-auto">
            {entries.map((e) =>
              editingId === e.id ? (
                <div key={e.id} className="py-2.5 space-y-2">
                  <textarea className={inputClass} rows={2} value={editText} onChange={(ev) => setEditText(ev.target.value)} maxLength={1500} />
                  {isQuote && <input className={inputClass} value={editAuthor} onChange={(ev) => setEditAuthor(ev.target.value)} placeholder="Who said it (optional)" maxLength={150} />}
                  <div className="flex gap-3">
                    <button type="button" onClick={() => saveEdit(e.id)} className="text-neon-blue hover:underline text-xs">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-300 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div key={e.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap break-words">{e.text}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isQuote ? `${e.author || "No author listed"} · ` : ""}
                      {e.usedAt ? `Posted ${new Date(e.usedAt).toLocaleDateString()}` : "Not posted yet"}
                    </p>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(e.id);
                        setEditText(e.text);
                        setEditAuthor(e.author ?? "");
                      }}
                      className="text-slate-500 hover:text-neon-blue text-xs"
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => removeEntry(e.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                      Remove
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </NeonCard>
    </div>
  );
}
