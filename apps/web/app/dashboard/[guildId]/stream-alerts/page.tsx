"use client";

import { useEffect, useRef, useState } from "react";
import { GO_LIVE_DEFAULTS, GO_LIVE_PLACEHOLDERS, LIVE_PLATFORMS, buildGoLiveMessage, platformInfo, type LivePlatform } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { DiscordButton, DiscordButtonRow, DiscordEmbed, DiscordMessage } from "../../../../components/ui/DiscordPreview";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { api, type LiveCheckResult, type RoleManagerMember, type StreamAlertSettingsRow, type StreamSubscription } from "../../../../lib/api";

const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
// A stand-in for the live stream's preview image.
const SAMPLE_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2140"/><stop offset="1" stop-color="#1b2d45"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><circle cx="58" cy="44" r="8" fill="#ef4444"/><text x="74" y="51" font-family="sans-serif" font-size="20" font-weight="700" fill="#fff">LIVE</text><text x="320" y="190" font-family="sans-serif" font-size="24" fill="#dbdee1" text-anchor="middle">The live stream shows here</text></svg>',
  );
const field = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hint = "text-xs text-slate-500";

function Step({ n, title, desc, children }: { n: number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <NeonCard>
      <div className="flex items-start gap-3 mb-4">
        <span className="flex-none w-7 h-7 rounded-full bg-neon-blue/20 text-neon-blue text-xs font-semibold flex items-center justify-center">{n}</span>
        <div>
          <p className="font-medium">{title}</p>
          <p className={hint}>{desc}</p>
        </div>
      </div>
      {children}
    </NeonCard>
  );
}

const ago = (iso?: string | null) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function GoingLivePage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [settings, setSettings] = useState<StreamAlertSettingsRow | null>(null);
  const [keys, setKeys] = useState<{ TWITCH: boolean; KICK: boolean }>({ TWITCH: true, KICK: true });
  const [subs, setSubs] = useState<StreamSubscription[]>([]);
  const [previewPlatform, setPreviewPlatform] = useState<LivePlatform>("twitch");

  // New streamer form
  const [platform, setPlatform] = useState<LivePlatform>("twitch");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [site, setSite] = useState("");
  const [member, setMember] = useState<RoleManagerMember | null>(null);
  const [memberQ, setMemberQ] = useState("");
  const [memberResults, setMemberResults] = useState<RoleManagerMember[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  function refresh() {
    api.getStreamSubscriptions(guildId).then(setSubs).catch(() => null);
  }
  useEffect(() => {
    api.getStreamAlertSettings(guildId).then((r) => {
      setSettings(r.settings);
      setKeys(r.keys);
    });
    refresh();
  }, [guildId]);

  useEffect(() => {
    const q = memberQ.trim();
    if (q.length < 2) return setMemberResults([]);
    const t = setTimeout(() => api.searchRoleMembers(guildId, q).then(setMemberResults).catch(() => setMemberResults([])), 300);
    return () => clearTimeout(t);
  }, [memberQ, guildId]);

  const autoSave = useAutoSave(settings, async () => {
    if (settings) await api.setStreamAlertSettings(guildId, settings);
  });
  const update = (patch: Partial<StreamAlertSettingsRow>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  async function addStreamer() {
    setAddError(null);
    try {
      await api.addStreamSubscription(guildId, {
        platform,
        channelName: handle,
        displayName: displayName || null,
        platformName: platform === "other" ? site || null : null,
        discordUserId: member?.id ?? null,
      });
      setHandle("");
      setDisplayName("");
      setSite("");
      setMember(null);
      setMemberQ("");
      refresh();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Couldn't add them.");
    }
  }

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

  if (!settings) return <p className="text-slate-400">Loading…</p>;

  const plat = platformInfo(platform);
  const missingKey = plat.needsKey && !keys[plat.needsKey];
  const sample = buildGoLiveMessage(settings, {
    name: "BustyBunz",
    platform: previewPlatform,
    platformName: "Facebook",
    title: "Ranked grind to Champion 🏆",
    game: "Rainbow Six Siege",
    viewers: 127,
    url: platformInfo(previewPlatform).url("bustybunz"),
    roleId: settings.pingRoleId,
    userId: null,
  });

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="STREAM_ALERTS"
        title="Going Live"
        description="Posts an alert when your streamers go live on Twitch, YouTube, Kick or TikTok, keeps it updated while they stream, and turns it into a summary when they're done."
      />
      <div className="flex justify-end mb-2">
        <SaveStatus status={autoSave} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,1fr)] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <Step n={1} title="Where Alerts Go" desc="The channel alerts post in, and who gets pinged.">
            <label className={label}>Alert Channel</label>
            <ChannelSelect guildId={guildId} value={settings.defaultChannelId ?? null} onChange={(id) => update({ defaultChannelId: id || null })} kind="text" />
            <label className={`${label} mt-4`}>Ping Role (optional)</label>
            <RoleSelect guildId={guildId} value={settings.pingRoleId ?? null} onChange={(id) => update({ pingRoleId: id || null })} placeholder="No ping" />
            <p className={`${hint} mt-1`}>Put {"{role}"} in the message text to ping it. The default message already does.</p>
          </Step>

          <Step n={2} title="Streamers" desc="Who to watch. Spartacus checks every 2 minutes and posts as soon as they go live.">
            <div className="space-y-2 mb-4">
              {subs.length === 0 && <p className={hint}>Nobody yet. Add your first streamer below.</p>}
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
                            {s.isLive ? <span className="text-rose-400">🔴 Live for {ago(s.liveStartedAt)}{s.peakViewers ? ` · peak ${s.peakViewers}` : ""}</span> : p.auto ? "⚫ Offline" : "Announced with /golive"}
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

            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-sm font-medium mb-2">Add a Streamer</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {LIVE_PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatform(p.id)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${platform === p.id ? "border-white/30 text-white" : "border-white/10 text-slate-400 hover:text-white"}`}
                    style={platform === p.id ? { background: `${p.color}22`, borderColor: `${p.color}88` } : undefined}
                  >
                    {p.emoji} {p.id === "other" ? "Other" : p.name}
                    {p.beta ? " (beta)" : ""}
                  </button>
                ))}
              </div>
              {missingKey && (
                <p className="text-xs text-amber-300 mb-3">
                  ⚠️ {plat.name} needs its app keys on the bot ({plat.needsKey}_CLIENT_ID and {plat.needsKey}_CLIENT_SECRET in Render) before it can check. You can add streamers now; they start working once the keys are in.
                </p>
              )}
              {platform === "tiktok" && <p className="text-xs text-slate-400 mb-3">TikTok doesn't share live status officially, so this check can miss streams. Streamers can always run /golive start as a backup.</p>}
              {platform === "other" && <p className="text-xs text-slate-400 mb-3">For Facebook, Trovo, Rumble, X and anything else. Spartacus can't check these by itself, so the streamer runs /golive start when they go live.</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className={label}>{platform === "other" ? "Stream Link" : "Channel"}</label>
                  <input className={field} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={plat.handleHint} />
                </div>
                <div>
                  <label className={label}>Name to Show (optional)</label>
                  <input className={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Their channel name" maxLength={80} />
                </div>
                {platform === "other" && (
                  <div>
                    <label className={label}>Site</label>
                    <input className={field} value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g. Facebook" maxLength={40} />
                  </div>
                )}
                <div className={platform === "other" ? "" : "sm:col-span-2"}>
                  <label className={label}>Their Discord Account (optional)</label>
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
                      {memberResults.length > 0 && (
                        <div className="absolute z-20 mt-1 w-full rounded-lg border border-white/10 bg-base-900 shadow-xl max-h-48 overflow-y-auto">
                          {memberResults.map((m) => (
                            <button key={m.id} type="button" onClick={() => { setMember(m); setMemberResults([]); }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5">
                              {m.displayName} <span className="text-xs text-slate-500">@{m.username}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <p className={`${hint} mt-1`}>Linking lets them use /golive, gets them the live role, and makes {"{user}"} mention them.</p>
                </div>
              </div>
              <button onClick={addStreamer} disabled={!handle.trim()} className="neon-button-sm mt-3 disabled:opacity-50">
                Add Streamer
              </button>
              {addError && <p className="text-xs text-rose-400 mt-2">{addError}</p>}
            </div>
          </Step>

          <Step n={3} title="The Alert" desc="What the post says. Leave a box empty to use the default shown.">
            <label className={label}>Message Text</label>
            <textarea ref={contentRef} className={`${field} min-h-14`} value={settings.contentTemplate ?? ""} placeholder={GO_LIVE_DEFAULTS.content} onChange={(e) => update({ contentTemplate: e.target.value })} />
            <PlaceholderExamples items={GO_LIVE_PLACEHOLDERS} inputRef={contentRef} value={settings.contentTemplate ?? ""} onChange={(v) => update({ contentTemplate: v })} />
            <label className={label}>Embed Title</label>
            <input ref={titleRef} className={field} value={settings.embedTitle ?? ""} placeholder={GO_LIVE_DEFAULTS.title} onChange={(e) => update({ embedTitle: e.target.value })} />
            <PlaceholderExamples items={GO_LIVE_PLACEHOLDERS} inputRef={titleRef} value={settings.embedTitle ?? ""} onChange={(v) => update({ embedTitle: v })} />
            <label className={label}>Embed Text</label>
            <textarea ref={descRef} className={`${field} min-h-16`} value={settings.embedDescription ?? ""} placeholder={GO_LIVE_DEFAULTS.description} onChange={(e) => update({ embedDescription: e.target.value })} />
            <PlaceholderExamples items={GO_LIVE_PLACEHOLDERS} inputRef={descRef} value={settings.embedDescription ?? ""} onChange={(v) => update({ embedDescription: v })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Button Text</label>
                <input className={field} value={settings.buttonLabel ?? ""} placeholder={GO_LIVE_DEFAULTS.button} onChange={(e) => update({ buttonLabel: e.target.value })} maxLength={80} />
              </div>
              <div>
                <label className={label}>Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" className="h-9 w-11 rounded bg-transparent" value={settings.embedColor || platformInfo(previewPlatform).color} onChange={(e) => update({ embedColor: e.target.value })} />
                  <button type="button" onClick={() => update({ embedColor: null })} className={`text-xs ${settings.embedColor ? "text-neon-blue" : "text-slate-500"}`}>
                    {settings.embedColor ? "Use each platform's color" : "Using each platform's color"}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 mt-4">
              <div>
                <p className="text-sm">Show the Stream Preview Image</p>
                <p className={hint}>The big thumbnail of what they're streaming.</p>
              </div>
              <ToggleSwitch enabled={settings.showThumbnail !== false} onChange={(v) => update({ showThumbnail: v })} label="Show stream preview" />
            </div>
          </Step>

          <Step n={4} title="While Live and After" desc="What happens during and after the stream.">
            <label className={label}>Live Role (optional)</label>
            <RoleSelect guildId={guildId} value={settings.liveRoleId ?? null} onChange={(id) => update({ liveRoleId: id || null })} placeholder="None" />
            <p className={`${hint} mt-1 mb-4`}>Given to a linked streamer while they're live, like “🔴 Live Now”. Turn on “Display role members separately” in Discord to show them at the top.</p>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-sm">Keep the Alert Updated</p>
                <p className={hint}>Refreshes viewers, title and game on the post every 2 minutes.</p>
              </div>
              <ToggleSwitch enabled={settings.updateWhileLive !== false} onChange={(v) => update({ updateWhileLive: v })} label="Keep updated" />
            </div>
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
                  {m === 0 ? "Always post" : m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`} (if their stream drops and comes back)
                </option>
              ))}
            </select>
          </Step>

          <Step n={5} title="Manual Go Live" desc="For any platform, and a backup for TikTok.">
            <div className="text-sm text-slate-300 space-y-1.5">
              <p>
                <code className="text-neon-blue">/golive start</code> platform, link, and an optional title. It posts the same alert.
              </p>
              <p>
                <code className="text-neon-blue">/golive end</code> turns it into the summary.
              </p>
            </div>
            <p className={`${hint} mt-2 mb-3`}>Staff and linked streamers can always use it. Pick a role to let others announce their own streams too.</p>
            <label className={label}>Streamer Role (optional)</label>
            <RoleSelect guildId={guildId} value={settings.selfServeRoleId ?? null} onChange={(id) => update({ selfServeRoleId: id || null })} placeholder="Staff and linked streamers only" />
          </Step>
        </div>

        <div className="xl:sticky xl:top-4">
          <NeonCard>
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
                author={sample.author.name}
                title={sample.title}
                description={sample.description}
                fields={sample.fields}
                imageUrl={sample.image ? SAMPLE_IMAGE : null}
                footer={sample.footer}
                timestamp
              />
              <DiscordButtonRow>
                <DiscordButton label={sample.button.label} style="link" />
              </DiscordButtonRow>
            </DiscordMessage>
            <p className={`${hint} mt-3`}>Sample streamer. In Discord the image is their live stream, and the avatar shows next to the name.</p>
          </NeonCard>
        </div>
      </div>
    </div>
  );
}
