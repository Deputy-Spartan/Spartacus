"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { COMMON_TIMEZONES, DAY_NAMES, SCHEDULE_DAY_ORDER, STREAM_EXTRAS_DEFAULTS, formatTimeOfDay } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { api, type StreamClipRow, type StreamExtrasConfigRow, type StreamLinkRow, type StreamSlotRow } from "../../../../lib/api";
import { ScheduleTab } from "../../../../components/streamExtras/ScheduleTab";

const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const field = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hint = "text-xs text-slate-500";
const button = "text-sm px-3 py-2 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50";

type Tab = "live" | "clips" | "schedule" | "rewards";
const TABS: Array<[Tab, string]> = [
  ["live", "🔴 Live role"],
  ["clips", "🎬 Clips"],
  ["schedule", "📅 Schedule"],
  ["rewards", "🪙 Viewer rewards"],
];

export default function StreamExtrasPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const [tab, setTab] = useState<Tab>("live");
  const [config, setConfig] = useState<StreamExtrasConfigRow | null>(null);
  const [slots, setSlots] = useState<StreamSlotRow[]>([]);
  const [clips, setClips] = useState<StreamClipRow[]>([]);
  const [links, setLinks] = useState<StreamLinkRow[]>([]);
  const [twitchStreamers, setTwitchStreamers] = useState(0);
  const [twitchKeys, setTwitchKeys] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  const reload = () =>
    api.getStreamExtras(guildId).then((d) => {
      setConfig((c) => c ?? { ...STREAM_EXTRAS_DEFAULTS, ...d.config });
      setSlots(d.slots);
      setClips(d.clips);
      setLinks(d.links);
      setTwitchStreamers(d.twitchStreamers);
      setTwitchKeys(d.twitchKeys);
    });
  useEffect(() => {
    reload().catch(() => null);
  }, [guildId]);

  const autoSave = useAutoSave(config, async () => {
    if (!config) return;
    const r = await api.saveStreamExtras(guildId, config);
    setNote(r.scheduleNote);
  });
  const update = (patch: Partial<StreamExtrasConfigRow>) => setConfig((c) => (c ? { ...c, ...patch } : c));

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="STREAM_EXTRAS"
        title="Stream Extras"
        description="Extras for your streamers: a Live role while they stream, Twitch clips with votes, a weekly stream schedule, and rewards for viewers who chat."
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
      {note && <div className="mb-4 max-w-3xl rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">⚠️ {note}</div>}

      {tab === "live" && <LiveTab guildId={guildId} />}
      {tab === "clips" && <ClipsTab guildId={guildId} config={config} update={update} clips={clips} twitchStreamers={twitchStreamers} twitchKeys={twitchKeys} />}
      {tab === "schedule" && <ScheduleTab guildId={guildId} config={config} update={update} slots={slots} reload={reload} setNote={setNote} />}
      {tab === "rewards" && <RewardsTab guildId={guildId} config={config} update={update} links={links} reload={reload} twitchKeys={twitchKeys} />}
    </div>
  );
}

// ---- Live role ----

function LiveTab({ guildId }: { guildId: string }) {
  return (
    <div className="space-y-4 max-w-3xl">
      <NeonCard>
        <p className="font-medium mb-2">Live role</p>
        <p className="text-sm text-slate-400 mb-3">
          Streamers who are linked to their Discord account get a <b>Live</b> role the moment they go live and lose it when they're done. It shows them in the member list and works on Twitch, YouTube, Kick and TikTok.
        </p>
        <ol className="text-sm text-slate-300 list-decimal pl-5 space-y-1.5">
          <li>
            Pick the Live role and the streamer role on the{" "}
            <Link href={`/dashboard/${guildId}/stream-alerts`} className="text-neon-blue underline">
              Going Live page
            </Link>{" "}
            (Settings → While Live).
          </li>
          <li>
            Members with the streamer role link themselves in Discord: <code>/mystream link</code>, pick the platform and type their channel.
          </li>
          <li>Or link them yourself from Going Live → Active by choosing their Discord account.</li>
        </ol>
        <p className={`${hint} mt-3`}>
          <code>/mystream list</code> shows what's linked to you and <code>/mystream unlink</code> removes it.
        </p>
      </NeonCard>
    </div>
  );
}

// ---- Clips ----

function ClipsTab({
  guildId,
  config,
  update,
  clips,
  twitchStreamers,
  twitchKeys,
}: {
  guildId: string;
  config: StreamExtrasConfigRow;
  update: (p: Partial<StreamExtrasConfigRow>) => void;
  clips: StreamClipRow[];
  twitchStreamers: number;
  twitchKeys: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-4 max-w-3xl">
      <NeonCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="font-medium">Twitch clips</p>
            <p className={hint}>New clips from your Twitch streamers are posted here every few minutes, each with a 🔥 vote button.</p>
          </div>
          <ToggleSwitch enabled={config.clipsEnabled} onChange={(v) => update({ clipsEnabled: v })} label="Post clips" />
        </div>
        {!twitchKeys && <p className="text-xs text-amber-200 mb-3">Twitch isn't set up on the bot yet (TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET), so clips can't be fetched.</p>}
        {twitchStreamers === 0 && <p className="text-xs text-amber-200 mb-3">No Twitch streamers are on the Going Live list yet. Clips come from the streamers listed there.</p>}
        <label className={label}>Clips channel</label>
        <ChannelSelect guildId={guildId} value={config.clipsChannelId ?? null} onChange={(id) => update({ clipsChannelId: id || null })} kind="text" />
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className={label}>Skip clips with fewer views than</label>
            <input type="number" min={0} className={field} value={config.clipsMinViews} onChange={(e) => update({ clipsMinViews: Math.max(0, Number(e.target.value) || 0) })} />
            <p className={`${hint} mt-1`}>0 posts every clip. Only clips made in the last 30 minutes are posted.</p>
          </div>
        </div>
      </NeonCard>

      <NeonCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="font-medium">Clip of the Week</p>
            <p className={hint}>Posts the most-voted clip of the last 7 days (at 18:00 UTC or later on this day).</p>
          </div>
          <ToggleSwitch enabled={config.clipsWeekly} onChange={(v) => update({ clipsWeekly: v })} label="Clip of the Week" />
        </div>
        <label className={label}>Day</label>
        <select className={field} value={config.clipsWeeklyDay} onChange={(e) => update({ clipsWeeklyDay: Number(e.target.value) })}>
          {DAY_NAMES.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <div className="mt-3 flex items-center gap-3">
          <button
            className={button}
            onClick={async () => {
              setMsg("Posting…");
              try {
                await api.postClipOfTheWeek(guildId);
                setMsg("Done. If nothing appeared, no clip has a vote yet.");
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Couldn't post it.");
              }
            }}
          >
            Post it now
          </button>
          {msg && <span className={hint}>{msg}</span>}
        </div>
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-3">Recent clips</p>
        {clips.length === 0 ? (
          <p className={hint}>Nothing yet. New clips appear here after they're posted.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {clips.map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <a href={c.url} target="_blank" rel="noreferrer" className="text-sm truncate block hover:text-neon-blue">
                    {c.title}
                  </a>
                  <p className={hint}>
                    {c.streamer ?? "?"} · clipped by {c.creator ?? "?"} · {c.views} views
                  </p>
                </div>
                <span className="text-sm shrink-0">🔥 {c.votes}</span>
              </li>
            ))}
          </ul>
        )}
      </NeonCard>
    </div>
  );
}

// ---- Schedule ----

// ---- Viewer rewards ----

function RewardsTab({
  guildId,
  config,
  update,
  links,
  reload,
  twitchKeys,
}: {
  guildId: string;
  config: StreamExtrasConfigRow;
  update: (p: Partial<StreamExtrasConfigRow>) => void;
  links: StreamLinkRow[];
  reload: () => Promise<unknown>;
  twitchKeys: boolean;
}) {
  const confirm = useConfirm();
  const num = (k: keyof StreamExtrasConfigRow, min: number, max: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    update({ [k]: Math.min(max, Math.max(min, Number(e.target.value) || 0)) } as Partial<StreamExtrasConfigRow>);
  return (
    <div className="space-y-4 max-w-3xl">
      <NeonCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="font-medium">Reward viewers for chatting</p>
            <p className={hint}>Members who link their Twitch name earn coins and XP while they chat in a followed streamer's live Twitch chat.</p>
          </div>
          <ToggleSwitch enabled={config.rewardsEnabled} onChange={(v) => update({ rewardsEnabled: v })} label="Viewer rewards" />
        </div>
        {!twitchKeys && <p className="text-xs text-amber-200 mb-3">Twitch isn't set up on the bot yet, so live streams can't be detected.</p>}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Coins each time</label>
            <input type="number" min={0} className={field} value={config.rewardCoins} onChange={num("rewardCoins", 0, 100000)} />
            <p className={`${hint} mt-1`}>Needs the Economy module on.</p>
          </div>
          <div>
            <label className={label}>XP each time</label>
            <input type="number" min={0} className={field} value={config.rewardXp} onChange={num("rewardXp", 0, 100000)} />
            <p className={`${hint} mt-1`}>Needs Leveling on.</p>
          </div>
          <div>
            <label className={label}>Once every (minutes)</label>
            <input type="number" min={5} max={120} className={field} value={config.rewardIntervalMin} onChange={num("rewardIntervalMin", 5, 120)} />
          </div>
          <div>
            <label className={label}>Daily coin limit per person</label>
            <input type="number" min={0} className={field} value={config.rewardDailyCoinCap} onChange={num("rewardDailyCoinCap", 0, 10_000_000)} />
          </div>
        </div>
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-1">How members join in</p>
        <ol className="text-sm text-slate-300 list-decimal pl-5 space-y-1">
          <li>
            They run <code>/link twitch</code> and type their Twitch name.
          </li>
          <li>They type the code the bot gives them in a followed streamer's live Twitch chat. That proves the name is theirs.</li>
          <li>From then on, chatting in a live stream earns the rewards above.</li>
        </ol>
        <p className={`${hint} mt-2`}>The bot reads chat only for streamers who are live, and never posts anything there.</p>
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-3">Linked members</p>
        {links.length === 0 ? (
          <p className={hint}>Nobody has linked a Twitch name yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {links.map((l) => (
              <li key={l.id} className="py-2 flex items-center justify-between gap-3">
                <p className="text-sm min-w-0 truncate">
                  {l.name ?? l.userId} → <b>{l.handle}</b> <span className={hint}>{l.verified ? "✅ confirmed" : "⏳ waiting for the code"}</span>
                </p>
                <button
                  className="text-xs text-rose-300 hover:text-rose-200 shrink-0"
                  onClick={async () => {
                    if (!(await confirm(`Unlink ${l.handle}?`))) return;
                    await api.deleteStreamLink(guildId, l.id).catch(() => null);
                    await reload();
                  }}
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
      </NeonCard>
    </div>
  );
}
