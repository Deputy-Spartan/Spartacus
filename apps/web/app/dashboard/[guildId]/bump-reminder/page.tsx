"use client";

import { useEffect, useRef, useState } from "react";
import { BUMP_DEFAULTS, BUMP_PLACEHOLDERS, cleanBumpMessages, fillBumpStage, type BumpMessages, type BumpStage, type BumpStageMessage } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { MarkdownToolbar } from "../../../../components/ui/MarkdownToolbar";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { DiscordEmbed, DiscordMessage, extraEmbedProps } from "../../../../components/ui/DiscordPreview";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { api, type BumpReminderSettingsRow } from "../../../../lib/api";
import type { EmbedExtra } from "../../../../lib/embedExtra";

const MISSED_AFTER = [5, 10, 15, 30, 60, 90];
const SAMPLE_USER = "100000000000000002";
const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const field = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";

const STAGES: Array<{ id: BumpStage; tab: string; when: string }> = [
  { id: "bumped", tab: "✅ Bump Done", when: "Right after someone bumps. It replaces the last reminder, under Disboard's reply." },
  { id: "ready", tab: "⏰ Ready", when: "When the 2 hours are up. Posted fresh so the mention role gets pinged." },
  { id: "missed", tab: "⚠️ Missed", when: "When nobody bumps in time, then again for every 2 hours missed (up to a day)." },
];

const ago = (ms: number) => {
  const m = Math.round(Math.abs(ms) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export default function BumpReminderPage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<BumpReminderSettingsRow | null>(null);
  const [messages, setMessages] = useState<BumpMessages | null>(null);
  const [saved, setSaved] = useState(false);
  const [bumper, setBumper] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [stage, setStage] = useState<BumpStage>("bumped");
  const [lastBumpInput, setLastBumpInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function sendNow() {
    setSending(true);
    setSendNote(null);
    try {
      const iso = lastBumpInput ? new Date(lastBumpInput).toISOString() : null;
      const r = await api.sendBumpStatusNow(params.guildId, iso);
      const s = await api.getBumpReminderSettings(params.guildId);
      setSettings(s);
      setLastBumpInput("");
      const names: Record<string, string> = { bumped: "Bump Done", ready: "Ready", missed: "Missed" };
      setSendNote({ ok: true, text: `Sent the ${names[r.stage ?? ""] ?? ""} message to the bump channel.` });
    } catch (err) {
      setSendNote({ ok: false, text: err instanceof Error ? err.message : "Couldn't send it." });
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    api.getBumpReminderSettings(params.guildId).then((s) => {
      setSettings(s);
      setMessages(cleanBumpMessages(s.bumpMessages));
    });
  }, [params.guildId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const id = settings?.lastBumpedById;
    if (!id) return setBumper(null);
    api
      .getDiscordMembers(params.guildId, [id])
      .then(([m]) => setBumper(m ? m.nickname || m.username : null))
      .catch(() => setBumper(null));
  }, [params.guildId, settings?.lastBumpedById]);

  async function update(patch: Partial<BumpReminderSettingsRow>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    await api.updateBumpReminderSettings(params.guildId, patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const autoSave = useAutoSave(messages, () => api.updateBumpReminderSettings(params.guildId, { bumpMessages: messages ?? undefined }));
  const setStageMessage = (s: BumpStage, patch: Partial<BumpStageMessage>) => setMessages((m) => (m ? { ...m, [s]: { ...m[s], ...patch } } : m));

  const ready = settings?.nextReminderAt ? new Date(settings.nextReminderAt).getTime() : null;
  const missedOn = settings?.missedAlertEnabled ?? true;
  const missedAfter = settings?.missedAfterMin ?? 30;

  // Where things stand right now.
  let status: { text: string; tone: string } = { text: "Waiting for the first bump. Run /bump on Disboard to start.", tone: "text-slate-400" };
  if (ready && now < ready) status = { text: `Bumped. The next bump is ready in ${ago(ready - now)}.`, tone: "text-emerald-400" };
  else if (ready && missedOn && now >= ready + missedAfter * 60_000) status = { text: `Bump missed. It's been ready for ${ago(now - ready)}.`, tone: "text-rose-400" };
  else if (ready) status = { text: `Ready to bump now (for ${ago(now - ready)}).`, tone: "text-amber-300" };

  const current = messages?.[stage] ?? BUMP_DEFAULTS[stage];
  const stageInfo = STAGES.find((s) => s.id === stage)!;
  const stageOn = stage === "bumped" ? current.enabled : stage === "missed" ? missedOn : true;

  // The preview fills placeholders with your server's role and a sample time.
  const sampleNext = stage === "bumped" ? now + 2 * 60 * 60 * 1000 : now - (stage === "missed" ? missedAfter : 12) * 60_000;
  const filled = fillBumpStage(current, {
    userId: SAMPLE_USER,
    roleId: settings?.mentionRoleId,
    nextAt: new Date(sampleNext),
    serverName: "your server",
    missed: 1,
    count: (settings?.bumpCount ?? 0) || 1,
  });
  const names = { users: { [SAMPLE_USER]: bumper ?? "BustyBunz" } };

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="BUMP_REMINDER"
        title="Bump Reminder"
        description="Watches for Disboard's 'Bump done!' confirmation and keeps one live message in the channel: bump done with a countdown, ready to bump, and bump missed."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start mb-4">
        <NeonCard>
          <p className="font-medium mb-2">Status</p>
          <p className={`text-sm ${status.tone}`}>{status.text}</p>
          {settings?.lastBumpAt && (
            <p className="text-xs text-slate-500 mt-2">
              Last bump: {new Date(settings.lastBumpAt).toLocaleString()}
              {bumper ? ` by ${bumper}` : ""}
            </p>
          )}
          {ready && <p className="text-xs text-slate-500 mt-1">Next bump ready: {new Date(ready).toLocaleString()}</p>}
          {!!settings?.bumpCount && <p className="text-xs text-slate-500 mt-1">Bumps counted: {settings.bumpCount}</p>}
          {!!settings?.missedAlerts && <p className="text-xs text-rose-400/80 mt-1">Missed in a row: {settings.missedAlerts}</p>}

          <div className="mt-4 pt-4 border-t border-white/5">
            <label className={label}>Last Bump Was At (optional)</label>
            <input
              type="datetime-local"
              className={field}
              value={lastBumpInput}
              max={new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              onChange={(e) => setLastBumpInput(e.target.value)}
            />
            <p className="text-xs text-slate-600 mt-1 mb-3">
              Set this if someone bumped while Spartacus wasn't watching, so the countdown matches Disboard. Leave it empty to use the bump Spartacus saw last.
            </p>
            <button onClick={sendNow} disabled={sending || !settings?.channelId} className="neon-button-sm disabled:opacity-50">
              {sending ? "Sending…" : "📨 Send Now"}
            </button>
            {!settings?.channelId && <p className="text-xs text-slate-500 mt-2">Pick a bump channel first.</p>}
            {sendNote && <p className={`text-xs mt-2 ${sendNote.ok ? "text-emerald-400" : "text-rose-400"}`}>{sendNote.text}</p>}
            <p className="text-xs text-slate-600 mt-2">Posts the current stage's message with fresh live timers, replacing the old one. It doesn't ping.</p>
          </div>
        </NeonCard>

        <NeonCard>
          <label className={label}>Bump Channel</label>
          <ChannelSelect
            guildId={params.guildId}
            value={settings?.channelId ?? null}
            onChange={(id) => update({ channelId: id || null })}
            kind="text"
            placeholder="Off — not posting anywhere"
          />
          <label className={`${label} mt-4`}>Mention Role (optional)</label>
          <RoleSelect
            guildId={params.guildId}
            value={settings?.mentionRoleId ?? null}
            onChange={(id) => update({ mentionRoleId: id || null })}
            placeholder="No role pinged"
          />
          <p className="text-xs text-slate-600 mt-1">Put {"{role}"} in a message's text to ping it.</p>
          {saved && <p className="text-xs text-emerald-400 mt-2">Saved ✓</p>}
        </NeonCard>

        <NeonCard>
          <p className="font-medium">🔔 DM reminders</p>
          <p className="text-xs text-slate-500 mt-1">
            A DM shows up as a phone notification, so you hear about it at work. Anyone can tap <b>DM me when it's ready</b> under the bump message in Discord to get one
            every time the bump is ready (and when it's missed). Tap it again to stop.
          </p>
          <div className="mt-3 divide-y divide-white/5 text-sm">
            {(settings?.dmUsers ?? []).length === 0 && <p className="py-2 text-slate-500">Nobody yet. Tap the button in Discord to add yourself.</p>}
            {(settings?.dmUsers ?? []).map((u) => (
              <div key={u.id} className="flex items-center justify-between py-1.5">
                <span>{u.name}</span>
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-rose-400"
                  onClick={async () => {
                    setSettings((prev) => (prev ? { ...prev, dmUsers: (prev.dmUsers ?? []).filter((x) => x.id !== u.id) } : prev));
                    await api.updateBumpReminderSettings(params.guildId, { removeDmUserId: u.id });
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-2">Missed alerts repeat every 2 hours for a day, then every 6 hours until someone bumps.</p>
        </NeonCard>
      </div>

      <NeonCard>
        <div className="flex items-center justify-between gap-3 mb-1">
          <p className="font-medium">Bump Message</p>
          <SaveStatus status={autoSave} />
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Spartacus keeps one message in the bump channel and changes it at each stage. It edits the message when it can, and posts it fresh when it needs to ping
          or move below Disboard's reply. {"{next}"} and {"{ready}"} are live timers that count in Discord by themselves.
        </p>

        <div className="flex gap-1 mb-5 border-b border-white/5">
          {STAGES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStage(s.id)}
              className={[
                "px-4 py-2 text-sm border-b-2 transition-colors",
                stage === s.id ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
              ].join(" ")}
            >
              {s.tab}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div>
            <p className="text-xs text-slate-400 mb-4">{stageInfo.when}</p>

            {stage === "bumped" && (
              <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-white/5">
                <div>
                  <p className="text-sm">Post “Bump done” after each bump</p>
                  <p className="text-xs text-slate-500">Off: the last reminder is just removed after a bump.</p>
                </div>
                <ToggleSwitch enabled={current.enabled} onChange={(v) => setStageMessage("bumped", { enabled: v })} label="Post bump done message" />
              </div>
            )}
            {stage === "missed" && (
              <div className="mb-4 pb-4 border-b border-white/5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm">Missed Bump Alert</p>
                    <p className="text-xs text-slate-500">Posts when nobody bumps in time.</p>
                  </div>
                  <ToggleSwitch enabled={missedOn} onChange={(v) => update({ missedAlertEnabled: v })} label="Missed bump alert" />
                </div>
                {missedOn && (
                  <div className="mt-3">
                    <label className={label}>Alert When Nobody Bumps Within</label>
                    <select className={field} value={missedAfter} onChange={(e) => update({ missedAfterMin: Number(e.target.value) })}>
                      {MISSED_AFTER.map((m) => (
                        <option key={m} value={m}>
                          {m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : "1 hour 30 minutes"} after it's ready
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {stageOn && messages && (
              <StageFields key={stage} guildId={params.guildId} stage={stage} value={current} onChange={(p) => setStageMessage(stage, p)} />
            )}
          </div>

          <div className="lg:sticky lg:top-4">
            <p className={label}>Preview</p>
            {stageOn ? (
              <DiscordMessage content={filled.content || null} names={names}>
                {filled.embedEnabled && (
                  <DiscordEmbed
                    names={names}
                    color={filled.color}
                    title={filled.title || null}
                    description={filled.description || null}
                    {...extraEmbedProps(filled.extra)}
                    timestamp={filled.extra.timestamp}
                  />
                )}
              </DiscordMessage>
            ) : (
              <p className="text-sm text-slate-500">This stage is switched off.</p>
            )}
            <p className="text-xs text-slate-600 mt-2">
              Sample bumper: {bumper ?? "BustyBunz"}. In Discord the times count live, e.g. “in 1 hour 59 minutes”.
            </p>
            <button
              type="button"
              onClick={() => setStageMessage(stage, { ...BUMP_DEFAULTS[stage], extra: { ...BUMP_DEFAULTS[stage].extra } })}
              className="text-xs text-slate-500 hover:text-neon-blue mt-3"
            >
              Reset this stage to the default
            </button>
          </div>
        </div>
      </NeonCard>
    </div>
  );
}

function StageFields({ guildId, stage, value, onChange }: { guildId: string; stage: BumpStage; value: BumpStageMessage; onChange: (p: Partial<BumpStageMessage>) => void }) {
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const tokens = BUMP_PLACEHOLDERS.filter((p) => !p.stages || p.stages.includes(stage));

  return (
    <div>
      <label className={label}>Message Text</label>
      <MarkdownToolbar guildId={guildId} textareaRef={contentRef} value={value.content} onChange={(v) => onChange({ content: v })} />
      <textarea ref={contentRef} className={`${field} min-h-16`} value={value.content} onChange={(e) => onChange({ content: e.target.value })} placeholder="Optional with an embed" />
      <PlaceholderExamples items={tokens} inputRef={contentRef} value={value.content} onChange={(v) => onChange({ content: v })} />

      <div className="flex items-center justify-between gap-3 mb-4 pt-2 border-t border-white/5">
        <span className="text-sm text-slate-300 pt-2">Use an embed</span>
        <ToggleSwitch enabled={value.embedEnabled} onChange={(v) => onChange({ embedEnabled: v })} label="Use an embed" />
      </div>

      {value.embedEnabled && (
        <>
          <label className={label}>Embed Title</label>
          <input ref={titleRef} className={field} value={value.title} maxLength={256} onChange={(e) => onChange({ title: e.target.value })} />
          <PlaceholderExamples items={tokens} inputRef={titleRef} value={value.title} onChange={(v) => onChange({ title: v })} />

          <label className={label}>Embed Description</label>
          <MarkdownToolbar guildId={guildId} textareaRef={descRef} value={value.description} onChange={(v) => onChange({ description: v })} />
          <textarea ref={descRef} className={`${field} min-h-28`} value={value.description} onChange={(e) => onChange({ description: e.target.value })} />
          <PlaceholderExamples items={tokens} inputRef={descRef} value={value.description} onChange={(v) => onChange({ description: v })} />

          <label className={label}>Embed Color</label>
          <div className="flex items-center gap-2 mb-4">
            <input type="color" className="h-9 w-12 rounded bg-transparent" value={value.color} onChange={(e) => onChange({ color: e.target.value })} />
            <input className={`${field} max-w-32 font-mono`} value={value.color} onChange={(e) => onChange({ color: e.target.value })} />
          </div>

          <EmbedExtraFields guildId={guildId} value={value.extra as EmbedExtra} onChange={(next) => onChange({ extra: next })} />
          <p className="text-xs text-slate-600 mt-2">Placeholders work in the author, footer and fields too.</p>
        </>
      )}
    </div>
  );
}
