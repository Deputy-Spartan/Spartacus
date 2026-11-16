"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CHAT_RANKS, CHECKLIST_MAX, DAY_NAMES, STREAM_GROWTH_DEFAULTS, platformInfo } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { api, type StreamGrowthConfigRow, type StreamGrowthData } from "../../../../lib/api";

const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const field = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hint = "text-xs text-slate-500";
const button = "text-sm px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50";
const warn = "text-xs text-amber-200";

type Tab = "countdown" | "friends" | "board" | "votw" | "games" | "accounts" | "checklist" | "ranks" | "clips";
const TABS: Array<[Tab, string]> = [
  ["countdown", "⏰ Countdown"],
  ["friends", "🤝 Friends & raids"],
  ["board", "📺 Live board & recap"],
  ["votw", "⭐ Viewer of the Week"],
  ["games", "🎮 Game nights"],
  ["accounts", "🔑 Accounts & title"],
  ["checklist", "📋 Checklist"],
  ["ranks", "🎖️ Chat ranks"],
  ["clips", "🎬 Clip links"],
];

type Update = (p: Partial<StreamGrowthConfigRow>) => void;

// A small "press it, see what happened" button.
function ActionButton({ text, run }: { text: string; run: () => Promise<string | void> }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex items-center gap-3">
      <button
        className={button}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            setMsg((await run()) || "Done.");
          } catch (e) {
            setMsg(e instanceof Error ? e.message : "That didn't work.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {text}
      </button>
      {msg && <span className={hint}>{msg}</span>}
    </span>
  );
}

function Header({ title, text, on, set, toggleLabel }: { title: string; text: string; on?: boolean; set?: (v: boolean) => void; toggleLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div>
        <p className="font-medium">{title}</p>
        <p className={hint}>{text}</p>
      </div>
      {set && <ToggleSwitch enabled={!!on} onChange={set} label={toggleLabel ?? title} />}
    </div>
  );
}

export default function StreamGrowthPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const [tab, setTab] = useState<Tab>("countdown");
  const [data, setData] = useState<StreamGrowthData | null>(null);
  const [config, setConfig] = useState<StreamGrowthConfigRow | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = () =>
    api.getStreamGrowth(guildId).then((d) => {
      setData(d);
      setConfig((c) => c ?? { ...STREAM_GROWTH_DEFAULTS, ...d.config });
    });
  useEffect(() => {
    reload().catch(() => null);
    // Back from connecting Twitch or Kick.
    const q = new URLSearchParams(window.location.search);
    if (q.get("connected")) {
      setTab("accounts");
      setBanner({ ok: true, text: `${q.get("connected") === "kick" ? "Kick" : "Twitch"} is connected.` });
    } else if (q.get("connectError")) {
      setTab("accounts");
      setBanner({ ok: false, text: q.get("connectError") ?? "Connecting didn't work." });
    }
    if (q.get("connected") || q.get("connectError")) window.history.replaceState(null, "", window.location.pathname);
  }, [guildId]);

  const autoSave = useAutoSave(config, async () => {
    if (config) await api.saveStreamGrowth(guildId, config);
  });
  const update: Update = (p) => setConfig((c) => (c ? { ...c, ...p } : c));

  if (!config || !data) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="STREAM_GROWTH"
        title="Stream Growth"
        description="Get people to your streams and keep them coming back: countdown pings, friends to raid, a who's-live board, recaps, Viewer of the Week, game nights, title updates and chat ranks."
      />
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {TABS.map(([k, l]) => (
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
      {banner && (
        <div className={`mb-4 max-w-3xl rounded-lg border p-3 text-xs ${banner.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
          {banner.ok ? "✅" : "⚠️"} {banner.text}
        </div>
      )}
      <div className="space-y-4 max-w-3xl">
        {tab === "countdown" && <CountdownTab guildId={guildId} config={config} update={update} data={data} />}
        {tab === "friends" && <FriendsTab guildId={guildId} config={config} update={update} data={data} setData={setData} />}
        {tab === "board" && <BoardTab guildId={guildId} config={config} update={update} />}
        {tab === "votw" && <VotwTab guildId={guildId} config={config} update={update} data={data} />}
        {tab === "games" && <GamesTab guildId={guildId} config={config} update={update} data={data} reload={reload} />}
        {tab === "accounts" && <AccountsTab guildId={guildId} data={data} reload={reload} />}
        {tab === "checklist" && <ChecklistTab config={config} update={update} />}
        {tab === "ranks" && <RanksTab guildId={guildId} data={data} reload={reload} />}
        {tab === "clips" && <ClipsTab guildId={guildId} config={config} update={update} />}
      </div>
    </div>
  );
}

// ---- Countdown ----
function CountdownTab({ guildId, config, update, data }: { guildId: string; config: StreamGrowthConfigRow; update: Update; data: StreamGrowthData }) {
  return (
    <>
      <NeonCard>
        <Header title="Countdown before each stream" text="Posts “live in 1 hour” and “live in 10 minutes” before every stream on your schedule, and pings the Stream Ping role." on={config.countdownEnabled} set={(v) => update({ countdownEnabled: v })} toggleLabel="Countdown" />
        {data.scheduledStreams === 0 && (
          <p className={`${warn} mb-3`}>
            Your schedule is empty. Add your streams on{" "}
            <Link href={`/dashboard/${guildId}/stream-extras`} className="underline">
              Stream Extras → Schedule
            </Link>{" "}
            first.
          </p>
        )}
        <label className={label}>Countdown channel</label>
        <ChannelSelect guildId={guildId} value={config.countdownChannelId ?? null} onChange={(id) => update({ countdownChannelId: id || null })} kind="text" />
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div className="flex items-center gap-3">
            <ToggleSwitch enabled={config.countdownHour} onChange={(v) => update({ countdownHour: v })} label="1 hour before" />
            <span className="text-sm">1 hour before</span>
          </div>
          <div className="flex items-center gap-3">
            <ToggleSwitch enabled={config.countdownSoon} onChange={(v) => update({ countdownSoon: v })} label="10 minutes before" />
            <span className="text-sm">10 minutes before</span>
          </div>
        </div>
        <div className="mt-4">
          <ActionButton text="Send a test (no ping)" run={async () => void (await api.testCountdown(guildId))} />
        </div>
      </NeonCard>
      <NeonCard>
        <Header title="🔔 Stream Ping role" text="Only people who want pings get them. Every countdown and the live board have a 🔔 button to join or leave the role." />
        <RoleSelect guildId={guildId} value={config.pingRoleId ?? null} onChange={(id) => update({ pingRoleId: id || null })} placeholder="Pick a role (make one called Stream Ping)…" />
        <p className={hint}>Spartacus's own role must be above this role in Server Settings → Roles.</p>
      </NeonCard>
    </>
  );
}

// ---- Friends & raids ----
function FriendsTab({ guildId, config, update, data, setData }: { guildId: string; config: StreamGrowthConfigRow; update: Update; data: StreamGrowthData; setData: (d: StreamGrowthData) => void }) {
  const confirm = useConfirm();
  const [form, setForm] = useState({ platform: "kick", handle: "", displayName: "" });
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <NeonCard>
        <Header title="Raid channel" text="Where friends going live and your raid list are posted. No pings, just a heads-up." />
        <ChannelSelect guildId={guildId} value={config.raidChannelId ?? null} onChange={(id) => update({ raidChannelId: id || null })} kind="text" />
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div className="flex items-center gap-3">
            <ToggleSwitch enabled={config.friendAlerts} onChange={(v) => update({ friendAlerts: v })} label="Post when a friend goes live" />
            <span className="text-sm">Post when a friend goes live</span>
          </div>
          <div className="flex items-center gap-3">
            <ToggleSwitch enabled={config.raidListOnEnd} onChange={(v) => update({ raidListOnEnd: v })} label="Raid list when you end" />
            <span className="text-sm">Raid list when your stream ends</span>
          </div>
        </div>
        <p className={`${hint} mt-3`}>
          The raid list goes to streamers linked to a Discord account (Going Live). Anyone can run <code>/raidlist</code> and <code>/so name</code>.
        </p>
      </NeonCard>
      <NeonCard>
        <p className="font-medium mb-3">Add a friend</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <select className={field} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
            {["kick", "twitch", "youtube", "tiktok"].map((p) => (
              <option key={p} value={p}>
                {platformInfo(p).emoji} {platformInfo(p).name}
              </option>
            ))}
          </select>
          <input className={field} placeholder="Channel name or link" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} maxLength={100} />
          <input className={field} placeholder="Name to show (optional)" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={60} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className={button}
            onClick={async () => {
              if (!form.handle.trim()) return setMsg("Type their channel.");
              try {
                const r = await api.addStreamFriend(guildId, { platform: form.platform, handle: form.handle, displayName: form.displayName || null });
                setData({ ...data, friends: [...data.friends, r.friend] });
                setForm({ ...form, handle: "", displayName: "" });
                setMsg("Added. Live checks run every 2 minutes.");
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Couldn't add them.");
              }
            }}
          >
            Add friend
          </button>
          <ActionButton
            text="Check who's live now"
            run={async () => {
              const r = await api.checkStreamFriends(guildId);
              setData({ ...data, friends: r.friends });
              return `${r.friends.filter((f) => f.isLive).length} live right now.`;
            }}
          />
          {msg && <span className={hint}>{msg}</span>}
        </div>
      </NeonCard>
      <NeonCard>
        <p className="font-medium mb-3">Friends ({data.friends.length}/50)</p>
        {data.friends.length === 0 ? (
          <p className={hint}>No friends added yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {data.friends.map((f) => (
              <li key={f.id} className="py-2 flex items-center justify-between gap-3">
                <p className="text-sm min-w-0 truncate">
                  {platformInfo(f.platform).emoji} <b>{f.displayName || f.handle}</b> {f.isLive ? <span className="text-rose-300">🔴 live{f.lastGame ? ` · ${f.lastGame}` : ""}{typeof f.lastViewers === "number" ? ` · 👁 ${f.lastViewers}` : ""}</span> : <span className={hint}>offline</span>}
                </p>
                <button
                  className="text-xs text-rose-300 hover:text-rose-200 shrink-0"
                  onClick={async () => {
                    if (!(await confirm(`Remove ${f.displayName || f.handle}?`))) return;
                    await api.deleteStreamFriend(guildId, f.id).catch(() => null);
                    setData({ ...data, friends: data.friends.filter((x) => x.id !== f.id) });
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </NeonCard>
    </>
  );
}

// ---- Live board & recap ----
function BoardTab({ guildId, config, update }: { guildId: string; config: StreamGrowthConfigRow; update: Update }) {
  return (
    <>
      <NeonCard>
        <Header title="📺 Who's live board" text="One message that always shows everyone streaming right now: your members on Going Live and your friends. Small streamers in your Discord help each other grow." />
        <label className={label}>Board channel</label>
        <ChannelSelect guildId={guildId} value={config.boardChannelId ?? null} onChange={(id) => update({ boardChannelId: id || null })} kind="text" />
        <div className="mt-3">
          <ActionButton text="Update the board now" run={async () => void (await api.refreshLiveBoard(guildId))} />
        </div>
      </NeonCard>
      <NeonCard>
        <Header title="📊 Stream recap" text="After each stream: how long, peak viewers, new followers, top chatters, number of clips and the best clip." on={config.recapEnabled} set={(v) => update({ recapEnabled: v })} toggleLabel="Stream recap" />
        <label className={label}>Recap channel</label>
        <ChannelSelect guildId={guildId} value={config.recapChannelId ?? null} onChange={(id) => update({ recapChannelId: id || null })} kind="text" />
        <div className="flex items-center gap-3 mt-4">
          <ToggleSwitch enabled={config.recapLinkedOnly} onChange={(v) => update({ recapLinkedOnly: v })} label="Only linked streamers" />
          <span className="text-sm">Only for streamers linked to a Discord account</span>
        </div>
        <p className={`${hint} mt-3`}>
          New followers need the channel connected on the Accounts tab. Top chatters come from Twitch chat and from Kick chat (connected Kick channels). Streams under 10 minutes get no recap.
        </p>
      </NeonCard>
    </>
  );
}

// ---- Viewer of the Week ----
function VotwTab({ guildId, config, update, data }: { guildId: string; config: StreamGrowthConfigRow; update: Update; data: StreamGrowthData }) {
  return (
    <>
      <NeonCard>
        <Header
          title="⭐ Viewer of the Week"
          text="The most active viewer of the last 7 days wins a role for a week and a shoutout. It counts stream chat (viewers who ran /link) and Discord messages sent while you're live."
          on={config.votwEnabled}
          set={(v) => update({ votwEnabled: v })}
          toggleLabel="Viewer of the Week"
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Channel</label>
            <ChannelSelect guildId={guildId} value={config.votwChannelId ?? null} onChange={(id) => update({ votwChannelId: id || null })} kind="text" />
          </div>
          <div>
            <label className={label}>Pick on (after 18:00 UTC)</label>
            <select className={field} value={config.votwDay} onChange={(e) => update({ votwDay: Number(e.target.value) })}>
              {DAY_NAMES.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className={`${label} mt-4`}>Winner's role</label>
        <RoleSelect guildId={guildId} value={config.votwRoleId ?? null} onChange={(id) => update({ votwRoleId: id || null })} placeholder="Pick a role (e.g. Viewer of the Week)…" />
        <ActionButton text="Post a test pick (no role, no ping)" run={async () => void (await api.testViewerOfTheWeek(guildId))} />
      </NeonCard>
      <NeonCard>
        <p className="font-medium mb-3">Leading this week</p>
        {data.topViewers.length === 0 ? (
          <p className={hint}>Nobody yet. Counting starts with your next stream.</p>
        ) : (
          <ol className="text-sm list-decimal pl-5 space-y-1">
            {data.topViewers.map((t) => (
              <li key={t.userId}>
                {t.name ?? t.userId} <span className={hint}>({t.messages} messages)</span>
              </li>
            ))}
          </ol>
        )}
      </NeonCard>
    </>
  );
}

// ---- Game nights ----
function GamesTab({ guildId, config, update, data, reload }: { guildId: string; config: StreamGrowthConfigRow; update: Update; data: StreamGrowthData; reload: () => Promise<unknown> }) {
  const confirm = useConfirm();
  return (
    <>
      <NeonCard>
        <Header title="🎮 Game nights" text="Anyone runs /gamenight with a game and a time. Viewers tap Join, get a ping 15 minutes before, and the bot picks random teams when it starts." />
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Post game nights in</label>
            <ChannelSelect guildId={guildId} value={config.gameNightChannelId ?? null} onChange={(id) => update({ gameNightChannelId: id || null })} kind="text" />
            <p className={`${hint} mt-1`}>Empty = the channel /gamenight is run in.</p>
          </div>
          <div>
            <label className={label}>Ping this role for new ones</label>
            <RoleSelect guildId={guildId} value={config.gameNightRoleId ?? null} onChange={(id) => update({ gameNightRoleId: id || null })} placeholder="No ping" />
          </div>
        </div>
        <p className={hint}>
          Times use your schedule's time zone ({data.timezone}) and show in everyone's own time. Example: <code>/gamenight game:Siege time:8pm day:Friday team_size:5</code>
        </p>
      </NeonCard>
      <NeonCard>
        <p className="font-medium mb-3">Coming up</p>
        {data.gameNights.length === 0 ? (
          <p className={hint}>No game nights planned.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {data.gameNights.map((g) => (
              <li key={g.id} className="py-2 flex items-center justify-between gap-3">
                <p className="text-sm min-w-0 truncate">
                  <b>{g.game}</b> · {new Date(g.startAt).toLocaleString()} · {g.players} player{g.players === 1 ? "" : "s"} <span className={hint}>(host {g.host})</span>
                </p>
                <button
                  className="text-xs text-rose-300 hover:text-rose-200 shrink-0"
                  onClick={async () => {
                    if (!(await confirm(`Cancel ${g.game}?`))) return;
                    await api.cancelGameNight(guildId, g.id).catch(() => null);
                    await reload();
                  }}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </NeonCard>
    </>
  );
}

// ---- Accounts & title ----
function AccountsTab({ guildId, data, reload }: { guildId: string; data: StreamGrowthData; reload: () => Promise<unknown> }) {
  const confirm = useConfirm();
  const [title, setTitle] = useState("");
  const [game, setGame] = useState("");
  const [result, setResult] = useState<string[]>([]);
  const connect = async (p: "twitch" | "kick") => {
    const r = await api.connectStreamAccount(guildId, p);
    window.location.href = r.url;
  };
  return (
    <>
      <NeonCard>
        <Header title="🔑 Connected accounts" text="Connect your own Twitch or Kick so you can change your title and game from Discord (/title) or here, and so recaps can count new followers. Kick also sends its chat and follows to the bot." />
        <div className="flex flex-wrap gap-3 mb-3">
          {(["kick", "twitch"] as const).map((p) => (
            <ActionButton key={p} text={`${platformInfo(p).emoji} Connect ${platformInfo(p).name}`} run={async () => void (await connect(p))} />
          ))}
        </div>
        {!data.keys.kick && <p className={`${warn} mb-1`}>Kick isn't set up on the bot yet (KICK_CLIENT_ID and KICK_CLIENT_SECRET).</p>}
        {!data.keys.twitch && <p className={`${warn} mb-1`}>Twitch isn't set up on the bot yet (TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET).</p>}
        {data.accounts.length === 0 ? (
          <p className={hint}>Nothing connected yet.</p>
        ) : (
          <ul className="divide-y divide-white/5 mt-2">
            {data.accounts.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                <p className="text-sm min-w-0 truncate">
                  {platformInfo(a.platform).emoji} <b>{a.displayName || a.login}</b> <span className={hint}>connected by {a.mine ? "you" : (a.owner ?? "someone")}</span>
                </p>
                <span className="flex gap-3 shrink-0">
                  {a.platform === "kick" && (
                    <button
                      className="text-xs text-slate-300 hover:text-white"
                      onClick={async () => {
                        try {
                          await api.resubscribeKick(guildId, a.id);
                          alert("Kick chat and follows are on.");
                        } catch (e) {
                          alert(e instanceof Error ? e.message : "That didn't work.");
                        }
                      }}
                    >
                      Re-check Kick events
                    </button>
                  )}
                  <button
                    className="text-xs text-rose-300 hover:text-rose-200"
                    onClick={async () => {
                      if (!(await confirm(`Disconnect ${a.login}?`))) return;
                      await api.disconnectStreamAccount(guildId, a.id).catch(() => null);
                      await reload();
                    }}
                  >
                    Disconnect
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </NeonCard>
      {data.accounts.length > 0 && (
        <NeonCard>
          <Header title="✏️ Change title and game" text="Changes it on every connected channel at once. Your live post in Discord updates within 2 minutes." />
          <div className="grid sm:grid-cols-2 gap-3">
            <input className={field} placeholder="New stream title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
            <input className={field} placeholder="Game, e.g. Rainbow Six Siege" value={game} onChange={(e) => setGame(e.target.value)} maxLength={100} />
          </div>
          <div className="mt-3">
            <ActionButton
              text="Update everywhere"
              run={async () => {
                const r = await api.setStreamTitle(guildId, { title: title || null, game: game || null });
                setResult(r.results.map((x) => `${x.ok ? "✅" : "⚠️"} ${x.platform} ${x.login}${x.ok ? (x.game ? ` · ${x.game}` : "") : `: ${x.error}`}`));
                return "Sent.";
              }}
            />
          </div>
          {result.length > 0 && (
            <ul className="text-sm mt-3 space-y-1">
              {result.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </NeonCard>
      )}
      <NeonCard>
        <p className="font-medium mb-2">One-time setup (for the bot owner)</p>
        <ol className="text-sm text-slate-300 list-decimal pl-5 space-y-1.5">
          <li>
            <b>Kick:</b> at kick.com/settings/developer, open your app. Add this Redirect URL: <code className="break-all">{data.urls.kick}</code>
          </li>
          <li>
            In the same Kick app, switch on <b>Enable Webhooks</b> and paste this Webhook URL: <code className="break-all">{data.urls.kickWebhook}</code>
          </li>
          <li>
            Tick the scopes: user:read, channel:read, channel:write, events:subscribe.
          </li>
          <li>
            <b>Twitch:</b> at dev.twitch.tv/console, open your app and add this OAuth Redirect URL: <code className="break-all">{data.urls.twitch}</code>
          </li>
        </ol>
      </NeonCard>
    </>
  );
}

// ---- Checklist ----
function ChecklistTab({ config, update }: { config: StreamGrowthConfigRow; update: Update }) {
  const list = config.checklist;
  const set = (next: string[]) => update({ checklist: next.slice(0, CHECKLIST_MAX) });
  const [item, setItem] = useState("");
  return (
    <NeonCard>
      <Header title="📋 Pre-stream checklist" text="Run /prestream in Discord before you go live. It shows these to tick off, plus what the bot sees (linked channels, connected accounts, your next stream). Only you see it." />
      <ul className="space-y-2">
        {list.map((t, i) => (
          <li key={`${i}-${t}`} className="flex items-center gap-2">
            <span className={`${hint} w-5 text-right`}>{i + 1}.</span>
            <input className={field} value={t} maxLength={60} onChange={(e) => set(list.map((x, j) => (j === i ? e.target.value : x)))} />
            <button className="text-xs text-slate-400 hover:text-white" disabled={i === 0} onClick={() => set(list.map((x, j) => (j === i - 1 ? list[i] : j === i ? list[i - 1] : x)))}>
              ↑
            </button>
            <button className="text-xs text-rose-300 hover:text-rose-200" onClick={() => set(list.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {list.length < CHECKLIST_MAX && (
        <div className="flex gap-2 mt-3">
          <input className={field} placeholder="Add an item" value={item} maxLength={60} onChange={(e) => setItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && item.trim() && (set([...list, item.trim()]), setItem(""))} />
          <button className={button} onClick={() => item.trim() && (set([...list, item.trim()]), setItem(""))}>
            Add
          </button>
        </div>
      )}
      <p className={`${hint} mt-2`}>Up to {CHECKLIST_MAX} items.</p>
    </NeonCard>
  );
}

// ---- Chat ranks ----
function RanksTab({ guildId, data, reload }: { guildId: string; data: StreamGrowthData; reload: () => Promise<unknown> }) {
  const [lines, setLines] = useState<string[]>([]);
  return (
    <NeonCard>
      <Header title="🎖️ Chat ranks" text="Nine rank roles with your badge icons. Members move up as their level goes up (from chatting, voice and, with viewer rewards on, stream chat). Only the highest rank is worn." />
      <ul className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-sm mb-4">
        {CHAT_RANKS.map((r) => (
          <li key={r.name} className="rounded-lg border border-white/10 px-2 py-1.5">
            <b style={{ color: r.color }}>{r.name}</b>
            <span className={`${hint} block`}>Level {r.level}</span>
          </li>
        ))}
      </ul>
      {!data.ranks.levelingOn && (
        <p className={`${warn} mb-2`}>
          Leveling is off, so nobody earns XP yet. Turn it on in{" "}
          <Link href={`/dashboard/${guildId}/leveling`} className="underline">
            Leveling
          </Link>
          .
        </p>
      )}
      {data.ranks.icons === false && <p className={`${warn} mb-2`}>This server needs Boost level 2 for role icons. The roles are still made, just without icons.</p>}
      <ActionButton
        text={data.ranks.createdAt ? "Create rank roles again (fills in what's missing)" : "Create rank roles"}
        run={async () => {
          const r = await api.createRankRoles(guildId);
          setLines([
            r.created.length ? `Made: ${r.created.join(", ")}` : "",
            r.reused.length ? `Already there: ${r.reused.join(", ")}` : "",
            ...r.skippedLevels,
            r.promoted ? `${r.promoted} member${r.promoted === 1 ? "" : "s"} got their rank straight away.` : "",
          ].filter(Boolean));
          await reload();
          return r.icons ? "Done, with icons." : "Done.";
        }}
      />
      {lines.length > 0 && (
        <ul className="text-sm mt-3 space-y-1">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <p className={`${hint} mt-3`}>
        For Kick sub badges by months, upload the same images at kick.com → Creator Dashboard → Subscriber Badges (they're in your Emotes &amp; Badges folder).
      </p>
    </NeonCard>
  );
}

// ---- Clip links ----
function ClipsTab({ guildId, config, update }: { guildId: string; config: StreamGrowthConfigRow; update: Update }) {
  return (
    <NeonCard>
      <Header title="🎬 Clip links get votes" text="When someone posts a Kick or Twitch clip link in this channel, the bot adds a 🔥 vote button. Voted clips count for Clip of the Week (Stream Extras) and show up in the stream recap." />
      <label className={label}>Clip channel</label>
      <ChannelSelect guildId={guildId} value={config.clipSubmitChannelId ?? null} onChange={(id) => update({ clipSubmitChannelId: id || null })} kind="text" />
      <p className={`${hint} mt-2`}>
        Kick has no way for bots to fetch clips, so viewers share them by link. To turn your own clips into vertical shorts, use “Make Short From Link” in your Clip Tools folder.
      </p>
    </NeonCard>
  );
}
