"use client";

import { useEffect, useRef, useState } from "react";
import { GO_LIVE_DEFAULTS, GO_LIVE_PLACEHOLDERS, LIVE_PLATFORMS, buildGoLiveMessage, fillGoLiveExtra, platformInfo, type LivePlatform } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { MarkdownToolbar } from "../../../../components/ui/MarkdownToolbar";
import { EmbedExtraFields } from "../../../../components/ui/EmbedExtraFields";
import { EmojiPicker } from "../../../../components/ui/EmojiPicker";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { DiscordButton, DiscordButtonRow, DiscordEmbed, DiscordMessage } from "../../../../components/ui/DiscordPreview";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { api, type LiveCheckResult, type RoleManagerMember, type StreamAlertSettingsRow, type StreamSubscription } from "../../../../lib/api";
import type { EmbedExtra } from "../../../../lib/embedExtra";

const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const field = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hint = "text-xs text-slate-500";
const COLOR_PRESETS = ["#5865F2", "#9146FF", "#FF0000", "#53FC18", "#FE2C55", "#F1C40F", "#7B99BC", "#ED4245"];
// A stand-in for the live stream's preview image.
const SAMPLE_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2140"/><stop offset="1" stop-color="#1b2d45"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><circle cx="58" cy="44" r="8" fill="#ef4444"/><text x="74" y="51" font-family="sans-serif" font-size="20" font-weight="700" fill="#fff">LIVE</text><text x="320" y="190" font-family="sans-serif" font-size="24" fill="#dbdee1" text-anchor="middle">The live stream shows here</text></svg>',
  );

const STEPS = [
  { label: "Where Alerts Go", hint: "Channel and ping role" },
  { label: "Message Text", hint: "The line above the embed" },
  { label: "Embed", hint: "Title, text, color, images" },
  { label: "Watch Button", hint: "Its text and emoji" },
  { label: "While Live", hint: "Live role, keep updated" },
  { label: "When It Ends", hint: "Summary, delete or keep" },
  { label: "Manual & Discord", hint: "/golive and /golive setup" },
] as const;

type Tab = "active" | "settings" | "guide";

const ago = (iso?: string | null) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function GoingLivePage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const [tab, setTab] = useState<Tab>("active");
  const [settings, setSettings] = useState<StreamAlertSettingsRow | null>(null);
  const [keys, setKeys] = useState<{ TWITCH: boolean; KICK: boolean }>({ TWITCH: true, KICK: true });
  const [subs, setSubs] = useState<StreamSubscription[]>([]);

  const refresh = () => api.getStreamSubscriptions(guildId).then(setSubs).catch(() => null);
  useEffect(() => {
    api.getStreamAlertSettings(guildId).then((r) => {
      setSettings(r.settings);
      setKeys(r.keys);
    });
    refresh();
  }, [guildId]);

  const autoSave = useAutoSave(settings, async () => {
    if (settings) await api.setStreamAlertSettings(guildId, settings);
  });
  const update = (patch: Partial<StreamAlertSettingsRow>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  if (!settings) return <p className="text-slate-400">Loading…</p>;
  const live = subs.filter((s) => s.isLive);

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="STREAM_ALERTS"
        title="Going Live"
        description="Posts an alert when your streamers go live on Twitch, YouTube, Kick or TikTok, keeps it updated while they stream, and turns it into a summary when they're done."
      />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {(
          [
            ["active", `🔴 Active${live.length ? ` · ${live.length} live` : ""}`],
            ["settings", "⚙️ Settings"],
            ["guide", "📖 Guide"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${tab === k ? "bg-neon-blue/15 border-neon-blue/40 text-white" : "border-white/10 text-slate-400 hover:text-white"}`}
          >
            {l}
          </button>
        ))}
        <SaveStatus status={autoSave} />
      </div>

      {!settings.defaultChannelId && tab !== "guide" && (
        <div className="mb-4 max-w-3xl rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Pick an alert channel first: Settings → Where Alerts Go. Or run <code>/golive setup</code> in Discord to do it all step by step.
        </div>
      )}

      {tab === "active" && <ActiveTab guildId={guildId} subs={subs} keys={keys} refresh={refresh} hasChannel={!!settings.defaultChannelId} />}
      {tab === "settings" && <SettingsTab guildId={guildId} settings={settings} update={update} />}
      {tab === "guide" && <GuideTab onSettings={() => setTab("settings")} />}
    </div>
  );
}

// ---- Active ----

function ActiveTab({ guildId, subs, keys, refresh, hasChannel }: { guildId: string; subs: StreamSubscription[]; keys: { TWITCH: boolean; KICK: boolean }; refresh: () => void; hasChannel: boolean }) {
  const confirm = useConfirm();
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});
  const live = subs.filter((s) => s.isLive);

  async function check(s: StreamSubscription) {
    setNotes((n) => ({ ...n, [s.id]: { ok: true, text: "Checking…" } }));
    try {
      const r: LiveCheckResult = await api.checkStreamSubscription(guildId, s.id);
      const text = r.error
        ? r.error
        : r.live
          ? `🔴 Live now: ${r.title ?? "(no title)"}${r.game ? ` · ${r.game}` : ""}${r.viewers != null ? ` · ${r.viewers} watching` : ""}`
          : `⚫ Not live right now${r.name ? ` (found ${r.name})` : ""}. The alert posts when they go live.`;
      setNotes((n) => ({ ...n, [s.id]: { ok: !r.error, text } }));
      refresh();
    } catch (err) {
      setNotes((n) => ({ ...n, [s.id]: { ok: false, text: err instanceof Error ? err.message : "Check failed." } }));
    }
  }
  async function test(s: StreamSubscription) {
    try {
      await api.testStreamSubscription(guildId, s.id);
      setNotes((n) => ({ ...n, [s.id]: { ok: true, text: "🧪 Sent a test alert (no ping) to the alert channel." } }));
    } catch (err) {
      setNotes((n) => ({ ...n, [s.id]: { ok: false, text: err instanceof Error ? err.message : "Couldn't send it." } }));
    }
  }
  async function remove(s: StreamSubscription) {
    if (!(await confirm(`Stop following ${s.displayName || s.channelName}?`))) return;
    await api.deleteStreamSubscription(guildId, s.id).catch(() => null);
    refresh();
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <NeonCard>
          <p className="font-medium mb-3">Live Right Now</p>
          {live.length === 0 ? (
            <p className={hint}>Nobody is live. When a streamer goes live, they show here with how long they've been on.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {live.map((s) => {
                const p = platformInfo(s.platform);
                return (
                  <div key={s.id} className="rounded-lg border p-3" style={{ borderColor: `${p.color}66`, background: `${p.color}12` }}>
                    <div className="flex items-center gap-2.5">
                      {s.lastAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.lastAvatar} alt="" className="h-9 w-9 rounded-full ring-2 ring-rose-500" />
                      ) : (
                        <span className="h-9 w-9 rounded-full bg-white/5 flex items-center justify-center">{p.emoji}</span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{s.displayName || s.channelName}</p>
                        <p className="text-xs text-rose-300">
                          🔴 {p.name} · {ago(s.liveStartedAt)}
                          {s.peakViewers ? ` · peak ${s.peakViewers}` : ""}
                        </p>
                      </div>
                    </div>
                    {s.lastTitle && <p className="text-xs text-slate-300 mt-2 line-clamp-2">{s.lastTitle}</p>}
                    {s.lastGame && <p className="text-[11px] text-slate-500 mt-0.5">{s.lastGame}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-1">Streamers</p>
          <p className={`${hint} mb-3`}>Spartacus checks these every 2 minutes. Check now tells you whether it can find them, and Send test posts a sample alert without pinging.</p>
          <div className="space-y-2">
            {subs.length === 0 && <p className={hint}>Nobody yet. Add your first streamer on the right.</p>}
            {subs.map((s) => {
              const p = platformInfo(s.platform);
              return (
                <div key={s.id} className="rounded-lg border border-white/10 bg-base-950 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {s.lastAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.lastAvatar} alt="" className="h-8 w-8 rounded-full" />
                      ) : (
                        <span className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center">{p.emoji}</span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm truncate">
                          <b>{s.displayName || s.channelName}</b>{" "}
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${p.color}22`, color: p.color }}>
                            {p.emoji} {s.platform === "other" ? s.platformName || "Other" : p.name}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {s.isLive ? <span className="text-rose-400">🔴 Live for {ago(s.liveStartedAt)}</span> : p.auto ? "⚫ Offline" : "Announced with /golive"}
                          {s.discordUserId ? " · 🔗 linked to their Discord" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      {p.auto && (
                        <button onClick={() => check(s)} className="text-slate-400 hover:text-neon-blue">
                          Check now
                        </button>
                      )}
                      <button onClick={() => test(s)} className="text-slate-400 hover:text-neon-blue">
                        Send test
                      </button>
                      <button onClick={() => remove(s)} className="text-slate-500 hover:text-rose-400">
                        Remove
                      </button>
                    </div>
                  </div>
                  {s.lastError && !notes[s.id] && <p className="text-xs text-amber-300 mt-2">⚠️ Last check: {s.lastError}</p>}
                  {notes[s.id] && <p className={`text-xs mt-2 ${notes[s.id].ok ? "text-slate-300" : "text-rose-400"}`}>{notes[s.id].text}</p>}
                </div>
              );
            })}
          </div>
        </NeonCard>
      </div>

      <AddStreamer guildId={guildId} keys={keys} onAdded={refresh} hasChannel={hasChannel} />
    </div>
  );
}

function AddStreamer({ guildId, keys, onAdded, hasChannel }: { guildId: string; keys: { TWITCH: boolean; KICK: boolean }; onAdded: () => void; hasChannel: boolean }) {
  const [platform, setPlatform] = useState<LivePlatform>("twitch");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [site, setSite] = useState("");
  const [member, setMember] = useState<RoleManagerMember | null>(null);
  const [memberQ, setMemberQ] = useState("");
  const [results, setResults] = useState<RoleManagerMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const q = memberQ.trim();
    if (q.length < 2) return setResults([]);
    const t = setTimeout(() => api.searchRoleMembers(guildId, q).then(setResults).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [memberQ, guildId]);

  async function add() {
    setError(null);
    setDone(null);
    try {
      await api.addStreamSubscription(guildId, { platform, channelName: handle, displayName: displayName || null, platformName: platform === "other" ? site || null : null, discordUserId: member?.id ?? null });
      setDone(`Added ${displayName || handle}.`);
      setHandle("");
      setDisplayName("");
      setSite("");
      setMember(null);
      setMemberQ("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add them.");
    }
  }

  const plat = platformInfo(platform);
  const missingKey = plat.needsKey && !keys[plat.needsKey];
  return (
    <NeonCard className="xl:sticky xl:top-4">
      <p className="font-medium mb-3">Add a Streamer</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {LIVE_PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlatform(p.id)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${platform === p.id ? "text-white" : "border-white/10 text-slate-400 hover:text-white"}`}
            style={platform === p.id ? { background: `${p.color}22`, borderColor: `${p.color}88` } : undefined}
          >
            {p.emoji} {p.id === "other" ? "Other" : p.name}
            {p.beta ? " (beta)" : ""}
          </button>
        ))}
      </div>
      {missingKey && <p className="text-xs text-amber-300 mb-3">⚠️ {plat.name} needs {plat.needsKey}_CLIENT_ID and {plat.needsKey}_CLIENT_SECRET on the bot (in Render) before it can check. You can add streamers now.</p>}
      {platform === "tiktok" && <p className="text-xs text-slate-400 mb-3">TikTok doesn't share live status officially, so this can miss streams. /golive start always works as a backup.</p>}
      {platform === "other" && <p className="text-xs text-slate-400 mb-3">For Facebook, Trovo, Rumble, X and anything else. The streamer runs /golive start when they go live.</p>}
      <label className={label}>{platform === "other" ? "Stream Link" : "Channel"}</label>
      <input className={field} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={plat.handleHint} />
      <label className={`${label} mt-3`}>Name to Show (optional)</label>
      <input className={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Their channel name" maxLength={80} />
      {platform === "other" && (
        <>
          <label className={`${label} mt-3`}>Site</label>
          <input className={field} value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g. Facebook" maxLength={40} />
        </>
      )}
      <label className={`${label} mt-3`}>Their Discord Account (optional)</label>
      {member ? (
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-base-950 px-2.5 py-2 text-sm">
          <span>{member.displayName}</span>
          <button onClick={() => setMember(null)} className="text-xs text-slate-500 hover:text-rose-400">
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          <input className={field} value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Search members" />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-white/10 bg-base-900 shadow-xl max-h-48 overflow-y-auto">
              {results.map((m) => (
                <button key={m.id} type="button" onClick={() => { setMember(m); setResults([]); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5">
                  {m.displayName} <span className="text-xs text-slate-500">@{m.username}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <p className={`${hint} mt-1`}>Linking gives them the live role, lets them use /golive, and makes {"{user}"} mention them.</p>
      <button onClick={add} disabled={!handle.trim() || !hasChannel} className="neon-button-sm mt-4 disabled:opacity-50">
        Add Streamer
      </button>
      {!hasChannel && <p className={`${hint} mt-2`}>Pick an alert channel in Settings first.</p>}
      {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      {done && <p className="text-xs text-emerald-400 mt-2">{done}</p>}
    </NeonCard>
  );
}

// ---- Settings ----

function SettingsTab({ guildId, settings, update }: { guildId: string; settings: StreamAlertSettingsRow; update: (p: Partial<StreamAlertSettingsRow>) => void }) {
  const [step, setStep] = useState(0);
  const [previewPlatform, setPreviewPlatform] = useState<LivePlatform>("twitch");
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLInputElement>(null);
  const last = STEPS.length - 1;

  const info = {
    name: "BustyBunz",
    platform: previewPlatform,
    platformName: "Facebook",
    title: "Ranked grind to Champion 🏆",
    game: "Rainbow Six Siege",
    viewers: 127,
    url: platformInfo(previewPlatform).url("bustybunz"),
    roleId: settings.pingRoleId,
    userId: null,
  };
  const sample = buildGoLiveMessage(settings, info);
  const extra = fillGoLiveExtra(settings.embedExtra, info);

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="hidden lg:flex lg:flex-col lg:gap-1 lg:w-[210px] lg:flex-none">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStep(i)}
            className={`flex items-center gap-2.5 text-left px-3 py-2 rounded-lg border text-xs transition-colors ${i === step ? "bg-neon-blue/15 border-neon-blue/40 text-white" : "border-white/5 text-slate-400 hover:text-white hover:border-white/15"}`}
          >
            <span className={`flex-none w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${i < step ? "bg-emerald-500/20 text-emerald-400" : i === step ? "bg-neon-blue/30 text-white" : "bg-white/5 text-slate-500"}`}>{i < step ? "✓" : i + 1}</span>
            <span>
              <span className="block font-medium">{s.label}</span>
              <span className="block text-[10px] text-slate-500 font-normal">{s.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 lg:hidden w-full">
        {STEPS.map((s, i) => (
          <button key={s.label} type="button" onClick={() => setStep(i)} aria-label={`Step ${i + 1}: ${s.label}`} className={`flex-none w-7 h-7 rounded-full text-[11px] font-semibold border ${i === step ? "bg-neon-blue/25 border-neon-blue/60 text-white" : i < step ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : "border-white/10 text-slate-500"}`}>
            {i < step ? "✓" : i + 1}
          </button>
        ))}
      </div>

      <div className="flex-1 w-full min-w-0 grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)] gap-4 items-start">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 mb-3">
            Step {step + 1} of {STEPS.length} — {STEPS[step].label}
          </p>
          <NeonCard>
            {step === 0 && (
              <>
                <label className={label}>Alert Channel</label>
                <ChannelSelect guildId={guildId} value={settings.defaultChannelId ?? null} onChange={(id) => update({ defaultChannelId: id || null })} kind="text" />
                <p className={`${hint} mt-1 mb-4`}>Every alert posts here.</p>
                <label className={label}>Ping Role (optional)</label>
                <RoleSelect guildId={guildId} value={settings.pingRoleId ?? null} onChange={(id) => update({ pingRoleId: id || null })} placeholder="No ping" />
                <p className={`${hint} mt-1`}>It only pings if {"{role}"} is in the message text (step 2). The default already has it.</p>
              </>
            )}
            {step === 1 && (
              <>
                <label className={label}>Message Text</label>
                <MarkdownToolbar guildId={guildId} textareaRef={contentRef} value={settings.contentTemplate ?? ""} onChange={(v) => update({ contentTemplate: v })} />
                <textarea ref={contentRef} className={`${field} min-h-20`} value={settings.contentTemplate ?? ""} placeholder={GO_LIVE_DEFAULTS.content} onChange={(e) => update({ contentTemplate: e.target.value })} />
                <PlaceholderExamples items={GO_LIVE_PLACEHOLDERS} inputRef={contentRef} value={settings.contentTemplate ?? ""} onChange={(v) => update({ contentTemplate: v })} />
                <p className={hint}>Shown above the embed. Leave it empty to use the default. The 😀 button adds emojis.</p>
              </>
            )}
            {step === 2 && (
              <>
                <label className={label}>Embed Title</label>
                <input ref={titleRef} className={field} value={settings.embedTitle ?? ""} placeholder={GO_LIVE_DEFAULTS.title} onChange={(e) => update({ embedTitle: e.target.value })} maxLength={256} />
                <PlaceholderExamples items={GO_LIVE_PLACEHOLDERS} inputRef={titleRef} value={settings.embedTitle ?? ""} onChange={(v) => update({ embedTitle: v })} />
                <label className={label}>Embed Text</label>
                <MarkdownToolbar guildId={guildId} textareaRef={descRef} value={settings.embedDescription ?? ""} onChange={(v) => update({ embedDescription: v })} />
                <textarea ref={descRef} className={`${field} min-h-24`} value={settings.embedDescription ?? ""} placeholder={GO_LIVE_DEFAULTS.description} onChange={(e) => update({ embedDescription: e.target.value })} />
                <PlaceholderExamples items={GO_LIVE_PLACEHOLDERS} inputRef={descRef} value={settings.embedDescription ?? ""} onChange={(v) => update({ embedDescription: v })} />
                <label className={label}>Embed Color</label>
                <div className="flex items-center gap-2 mb-2">
                  <input type="color" className="h-9 w-11 rounded-lg border border-white/10 bg-base-950 cursor-pointer" value={settings.embedColor || platformInfo(previewPlatform).color} onChange={(e) => update({ embedColor: e.target.value })} />
                  <button type="button" onClick={() => update({ embedColor: null })} className={`text-xs px-2.5 py-1.5 rounded-lg border ${settings.embedColor ? "border-white/10 text-slate-400 hover:text-white" : "border-neon-blue/40 bg-neon-blue/10 text-white"}`}>
                    🌈 Each platform's color
                  </button>
                </div>
                <div className="flex gap-1.5 mb-4">
                  {COLOR_PRESETS.map((c) => (
                    <button key={c} type="button" title={c} onClick={() => update({ embedColor: c })} className="w-[18px] h-[18px] rounded border border-white/10 hover:scale-110 transition-transform" style={{ background: c }} />
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3 mb-4 pt-3 border-t border-white/5">
                  <div>
                    <p className="text-sm">Show the Stream Preview Image</p>
                    <p className={hint}>The big picture of what they're streaming.</p>
                  </div>
                  <ToggleSwitch enabled={settings.showThumbnail !== false} onChange={(v) => update({ showThumbnail: v })} label="Show stream preview" />
                </div>
                <EmbedExtraFields guildId={guildId} value={(settings.embedExtra ?? {}) as EmbedExtra} onChange={(v) => update({ embedExtra: v })} />
                <p className={`${hint} mt-2`}>Extras replace the matching default part (author, images, footer) and add fields. Placeholders work in them too.</p>
              </>
            )}
            {step === 3 && (
              <>
                <label className={label}>Button Text</label>
                <input ref={buttonRef} className={field} value={settings.buttonLabel ?? ""} placeholder={GO_LIVE_DEFAULTS.button} onChange={(e) => update({ buttonLabel: e.target.value })} maxLength={80} />
                <PlaceholderExamples items={GO_LIVE_PLACEHOLDERS.filter((p) => ["{name}", "{platform}"].includes(p.token))} inputRef={buttonRef} value={settings.buttonLabel ?? ""} onChange={(v) => update({ buttonLabel: v })} />
                <label className={label}>Button Emoji (optional)</label>
                <EmojiPicker guildId={guildId} value={settings.buttonEmoji ?? ""} onChange={(v) => update({ buttonEmoji: v || null })} placeholder="No emoji" />
                <p className={`${hint} mt-2`}>The button opens their stream. It's always there, under the embed.</p>
              </>
            )}
            {step === 4 && (
              <>
                <label className={label}>Live Role (optional)</label>
                <RoleSelect guildId={guildId} value={settings.liveRoleId ?? null} onChange={(id) => update({ liveRoleId: id || null })} placeholder="None" />
                <p className={`${hint} mt-1 mb-4`}>Given to a linked streamer while they're live, like “🔴 Live Now”. Turn on “Display role members separately” in Discord to show them at the top of the member list.</p>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm">Keep the Alert Updated</p>
                    <p className={hint}>Refreshes viewers, title and game on the post every 2 minutes.</p>
                  </div>
                  <ToggleSwitch enabled={settings.updateWhileLive !== false} onChange={(v) => update({ updateWhileLive: v })} label="Keep updated" />
                </div>
              </>
            )}
            {step === 5 && (
              <>
                <label className={label}>When the Stream Ends</label>
                <select className={field} value={settings.endAction ?? "EDIT"} onChange={(e) => update({ endAction: e.target.value as StreamAlertSettingsRow["endAction"] })}>
                  <option value="EDIT">Change it to a summary (how long, peak viewers)</option>
                  <option value="DELETE">Delete the alert</option>
                  <option value="KEEP">Leave it as it is</option>
                </select>
                <label className={`${label} mt-4`}>Don't Post Again Within</label>
                <select className={field} value={settings.cooldownMinutes ?? 30} onChange={(e) => update({ cooldownMinutes: Number(e.target.value) })}>
                  {[0, 10, 30, 60, 120, 360].map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? "Always post a new one" : m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}
                    </option>
                  ))}
                </select>
                <p className={`${hint} mt-1`}>If their stream drops and comes back within this time, Spartacus reuses the same alert instead of pinging again.</p>
              </>
            )}
            {step === 6 && (
              <>
                <div className="text-sm text-slate-300 space-y-2">
                  <p>
                    <code className="text-neon-blue">/golive start</code> platform, link and an optional title. Posts the same alert, for any site.
                  </p>
                  <p>
                    <code className="text-neon-blue">/golive end</code> turns it into the summary.
                  </p>
                  <p>
                    <code className="text-neon-blue">/golive setup</code> walks staff through all of these settings in Discord, one question at a time.
                  </p>
                </div>
                <label className={`${label} mt-4`}>Streamer Role (optional)</label>
                <RoleSelect guildId={guildId} value={settings.selfServeRoleId ?? null} onChange={(id) => update({ selfServeRoleId: id || null })} placeholder="Staff and linked streamers only" />
                <p className={`${hint} mt-1`}>Staff and linked streamers can always use /golive start. This role lets others announce their own streams too.</p>
              </>
            )}
          </NeonCard>
          <div className="flex items-center justify-between mt-4 gap-3">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="text-xs font-medium px-4 py-2 rounded-lg border border-white/10 text-slate-400 hover:text-white disabled:opacity-30">
              ← Back
            </button>
            {step < last ? (
              <button type="button" onClick={() => setStep((s) => Math.min(last, s + 1))} className="text-xs font-medium px-4 py-2 rounded-lg bg-neon-blue/15 border border-neon-blue/40 text-white hover:bg-neon-blue/25">
                Next →
              </button>
            ) : (
              <span className="text-xs text-emerald-400">✓ That's every step — you're all set.</span>
            )}
          </div>
        </div>

        <NeonCard className="2xl:sticky 2xl:top-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <p className="font-medium">Preview</p>
            <div className="flex gap-1">
              {LIVE_PLATFORMS.map((p) => (
                <button key={p.id} type="button" title={p.name} onClick={() => setPreviewPlatform(p.id)} className={`text-sm px-1.5 py-0.5 rounded ${previewPlatform === p.id ? "bg-white/10" : "opacity-60 hover:opacity-100"}`}>
                  {p.emoji}
                </button>
              ))}
            </div>
          </div>
          <DiscordMessage content={sample.content || null}>
            <DiscordEmbed
              color={sample.color}
              author={extra.authorName || sample.author.name}
              authorIconUrl={extra.authorIconUrl}
              title={sample.title}
              description={sample.description}
              fields={[...sample.fields, ...(extra.fields ?? [])]}
              thumbnailUrl={extra.thumbnailUrl}
              imageUrl={extra.imageUrl || (sample.image ? SAMPLE_IMAGE : null)}
              footer={extra.footerText || sample.footer}
              footerIconUrl={extra.footerIconUrl}
              timestamp
            />
            <DiscordButtonRow>
              <DiscordButton label={sample.button.label} emoji={sample.button.emoji} style="link" />
            </DiscordButtonRow>
          </DiscordMessage>
          <p className={`${hint} mt-3`}>Sample streamer. In Discord the image is their live stream and their avatar shows in the corner.</p>
        </NeonCard>
      </div>
    </div>
  );
}

// ---- Guide ----

function GuideTab({ onSettings }: { onSettings: () => void }) {
  const card = (title: string, children: React.ReactNode) => (
    <NeonCard>
      <p className="font-medium mb-2">{title}</p>
      <div className="text-sm text-slate-300 space-y-1.5">{children}</div>
    </NeonCard>
  );
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
      {card(
        "Set it up on the dashboard",
        <>
          <p>1. Settings → <b>Where Alerts Go</b>: pick the alert channel and a ping role.</p>
          <p>2. Active → <b>Add a Streamer</b>: pick the platform and paste their channel name or link. Link their Discord account for the live role.</p>
          <p>3. Settings → <b>Message Text</b>, <b>Embed</b> and <b>Watch Button</b>: make it yours. The preview shows each platform.</p>
          <p>4. Settings → <b>While Live</b> and <b>When It Ends</b>.</p>
          <p>5. Active → <b>Send test</b> to see a sample alert in Discord.</p>
          <button onClick={onSettings} className="neon-button-sm mt-2">
            Open Settings
          </button>
        </>,
      )}
      {card(
        "Or set it up in Discord",
        <>
          <p>
            Run <code className="text-neon-blue">/golive setup</code> (needs Manage Server). Spartacus asks the same questions as the dashboard, one at a time, in a private message: the channel, ping role, streamers, message, color, live role, updates, what happens at the end, repeat alerts and who can use /golive.
          </p>
          <p>Pick from menus, press buttons, or fill in a short form for names and text. At the end you check your answers and press Save, or Save and send a test.</p>
        </>,
      )}
      {card(
        "Platforms",
        <>
          <p>🟣 <b>Twitch</b> and 🟢 <b>Kick</b>: checked with their official APIs. They need their free app keys on the bot (TWITCH_ / KICK_CLIENT_ID and CLIENT_SECRET in Render). Active warns you if one is missing.</p>
          <p>🔴 <b>YouTube</b>: checked from the channel's live page. No key needed. Use the @handle.</p>
          <p>🎵 <b>TikTok</b> (beta): TikTok doesn't share live status officially, so checks can miss. /golive start always works.</p>
          <p>📺 <b>Other</b>: Facebook, Trovo, Rumble, X and the rest. The streamer runs /golive start.</p>
        </>,
      )}
      {card(
        "Commands",
        <>
          <p>
            <code className="text-neon-blue">/golive start</code> platform, link, title: announce a stream by hand.
          </p>
          <p>
            <code className="text-neon-blue">/golive end</code>: mark it as over (turns the alert into the summary).
          </p>
          <p>
            <code className="text-neon-blue">/golive setup</code>: the step-by-step setup (staff).
          </p>
          <p className="text-slate-500 text-xs">Staff, linked streamers and the streamer role (Settings → Manual & Discord) can use /golive start and end.</p>
        </>,
      )}
      {card(
        "Good to know",
        <>
          <p>• Checks run every 2 minutes, so an alert can take up to 2 minutes after they go live.</p>
          <p>• A stream has to look offline twice in a row before it ends, so a hiccup doesn't end it early.</p>
          <p>• If a site has a bad moment, the stream stays live and Active shows the last check's message.</p>
          <p>• Test alerts never ping anyone.</p>
        </>,
      )}
    </div>
  );
}
