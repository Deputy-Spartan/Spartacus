"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type StreamDeckKeyRow, type StreamDeckLogRow } from "../../../../lib/api";

const hint = "text-xs text-slate-500";
const field = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";

// Every key and dial in the plugin, grouped like the plugin's action list.
const ACTIONS: Array<[string, Array<[string, string, string]>]> = [
  [
    "Safety",
    [
      ["🚨", "Raid Lockdown", "Makes chat read-only for everyone but staff and pauses invites. Press again to undo exactly what it changed. Asks for a second press first."],
      ["🛡️", "Stream Safe Mode", "Pauses invites and turns on slowmode in a channel while you stream. Press again to put both back."],
      ["🔒", "Lock Channel", "Locks or unlocks one channel."],
      ["🐢", "Slowmode", "Steps a channel through Off, 5s, 10s, 30s and 1 minute."],
      ["🧹", "Clear Chat", "Deletes the last few messages in a channel. Asks for a second press first."],
    ],
  ],
  [
    "Streaming",
    [
      ["⚡", "Go Live", "One press: Live Indicator on, Stream Safe on, and your Go Live post. Press again when you're done to undo the first two."],
      ["🔴", "Live Indicator", "Renames a channel to “🔴 LIVE: …” while you stream, and back."],
      ["📢", "Go Live Post", "Posts a saved embed from the Embed Creator, with a role ping."],
      ["📣", "Shoutout", "Posts a shoutout card for another streamer."],
      ["🟢", "My Status", "Steps through Live, Be right back and Offline, and keeps one status post up to date."],
    ],
  ],
  [
    "Voice & squads",
    [
      ["🔊", "Lock My Squad", "Locks or unlocks the voice channel you're in."],
      ["🔇", "Mute Squad", "Server-mutes everyone in your voice channel but you, and unmutes them."],
      ["🎧", "Pull My Squad", "Moves everyone from a lobby voice channel into yours."],
      ["➕", "New Squad", "Makes a temp squad channel for a game and moves you in."],
    ],
  ],
  [
    "Server",
    [
      ["⏰", "Bump Timer", "Counts down to the next bump. Press to send the bump message."],
      ["🧩", "Module", "Turns a module on or off."],
      ["🎭", "My Role", "Gives you a role or takes it away (Role Manager rules apply)."],
      ["🎁", "Giveaway", "Starts a giveaway, then counts down."],
      ["🗳️", "Quick Poll", "Posts a 👍 / 👎 poll."],
      ["💬", "Say", "Posts a message as Spartacus."],
      ["📅", "Start Event", "Starts your next scheduled event and pings who signed up."],
      ["📌", "Resend Sticky", "Moves a channel's sticky message back to the bottom."],
    ],
  ],
  [
    "Staff",
    [
      ["🎟️", "Open Tickets", "Shows how many are open. Press to open the Tickets page."],
      ["🙋", "Claim Ticket", "Claims the oldest waiting ticket and opens it in Discord."],
      ["✅", "Applications", "Shows how many are waiting. Press to open them."],
      ["📊", "Online", "Live member counts."],
      ["💚", "Bot Status", "Whether Spartacus is online, and its ping."],
    ],
  ],
  [
    "Stream Deck + dials",
    [
      ["🐢", "Slowmode dial", "Turn to set slowmode seconds. Press to turn it off."],
      ["👥", "Squad Limit dial", "Turn to set your voice channel's limit. Press to lock or unlock it."],
      ["🔀", "Channel Lock dial", "Turn to pick a channel. Press to lock or unlock it."],
      ["📊", "Live Stats dial", "Turn to flip between online, in voice, members, tickets and applications."],
      ["⏱️", "Quick Timer dial", "Turn to pick minutes, tap the screen to switch giveaway or poll, press to start."],
      ["⭐", "XP Boost dial", "Turn from 1x to 3x. Press to start an hour of boosted XP, which Spartacus announces."],
      ["🧹", "Clear Chat dial", "Turn to pick how many messages. Press twice to clear them."],
      ["🎮", "Matchmaking dial", "Press to open or close matchmaking."],
    ],
  ],
];

export default function StreamDeckPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [keys, setKeys] = useState<StreamDeckKeyRow[] | null>(null);
  const [log, setLog] = useState<StreamDeckLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("My Stream Deck");
  const [fresh, setFresh] = useState<StreamDeckKeyRow | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    api.getStreamDeckKeys(guildId).then(setKeys).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load keys."));
    api.getStreamDeckLog(guildId).then(setLog).catch(() => null);
  };
  useEffect(load, [guildId]);

  async function create() {
    setError(null);
    try {
      const k = await api.createStreamDeckKey(guildId, name);
      setFresh(k);
      setCopied(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make a key.");
    }
  }
  async function revoke(k: StreamDeckKeyRow) {
    if (!(await confirm(`Cancel “${k.name}”? Any Stream Deck using it stops working straight away.`, { title: "Cancel key", confirmLabel: "Cancel key", danger: true }))) return;
    await api.revokeStreamDeckKey(guildId, k.id).catch(() => null);
    if (fresh?.id === k.id) setFresh(null);
    load();
  }
  async function copy() {
    if (!fresh?.key) return;
    await navigator.clipboard.writeText(fresh.key).catch(() => null);
    setCopied(true);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">🎛️ Stream Deck</h1>
        <p className="text-slate-400">Control Spartacus from your Elgato Stream Deck or Stream Deck +: lockdowns, going live, squads, timers and live counts, one press each.</p>
      </div>
      {error && <p className="text-sm text-rose-400 mb-4">{error}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,1fr)] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <NeonCard>
            <p className="font-medium mb-3">Set It Up</p>
            <ol className="space-y-3 text-sm text-slate-300">
              <li className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-neon-blue/20 text-neon-blue text-xs font-semibold flex items-center justify-center">1</span>
                <div>
                  <p>
                    <b>Install the plugin.</b> Download it and double-click the file. The Stream Deck app (7.1 or newer) adds a <b>Spartacus</b> section to its actions.
                  </p>
                  <a href="/downloads/Spartacus.streamDeckPlugin" download className="neon-button-sm inline-block mt-2">
                    ⬇ Download the Spartacus plugin
                  </a>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-neon-blue/20 text-neon-blue text-xs font-semibold flex items-center justify-center">2</span>
                <p>
                  <b>Make a connection key</b> on the right. It controls this server only and acts as you. It's shown once, so copy it straight away.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-neon-blue/20 text-neon-blue text-xs font-semibold flex items-center justify-center">3</span>
                <p>
                  <b>Connect.</b> Drag any Spartacus action onto a key or dial, and paste the key into <b>Connection key</b> in its settings. You only paste it once; every Spartacus action shares it.
                </p>
              </li>
              <li className="flex gap-3">
                <span className="flex-none w-6 h-6 rounded-full bg-neon-blue/20 text-neon-blue text-xs font-semibold flex items-center justify-center">4</span>
                <p>
                  <b>Pick each action's options</b>, like which channel or role, in the panel under your keys. Keys update every few seconds with live info.
                </p>
              </li>
            </ol>
            <p className={`${hint} mt-4`}>Tip: put the ⚡ Go Live key in a Stream Deck Multi Action with OBS's “Start Streaming”, and one press does everything.</p>
          </NeonCard>

          <NeonCard>
            <p className="font-medium mb-3">Every Key and Dial</p>
            <div className="space-y-4">
              {ACTIONS.map(([group, items]) => (
                <div key={group}>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">{group}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {items.map(([icon, title, desc]) => (
                      <div key={title} className="rounded-lg border border-white/5 bg-base-950 px-3 py-2">
                        <p className="text-sm font-medium">
                          {icon} {title}
                        </p>
                        <p className="text-xs text-slate-500">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </NeonCard>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4">
          <NeonCard>
            <p className="font-medium mb-3">Connection Keys</p>
            {fresh?.key && (
              <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
                <p className="text-xs text-emerald-300 mb-2">
                  Here's your key for <b>{fresh.name}</b>. Copy it now: it won't be shown again.
                </p>
                <div className="flex gap-2">
                  <code className="flex-1 min-w-0 truncate rounded bg-base-950 px-2 py-1.5 text-xs">{fresh.key}</code>
                  <button onClick={copy} className="neon-button-sm">
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-2 mb-4">
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name, e.g. Desk or Laptop" />
              <button onClick={create} className="neon-button-sm whitespace-nowrap">
                Make a Key
              </button>
            </div>
            {keys === null && !error && <p className={hint}>Loading…</p>}
            {keys?.length === 0 && <p className={hint}>No keys yet.</p>}
            <div className="space-y-2">
              {keys?.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-base-950 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{k.name}</p>
                    <p className="text-xs text-slate-500">
                      <code>{k.prefix}…</code> · made {new Date(k.createdAt).toLocaleDateString()} · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : "not used yet"}
                    </p>
                  </div>
                  <button onClick={() => revoke(k)} className="text-xs text-slate-500 hover:text-rose-400 shrink-0">
                    Cancel
                  </button>
                </div>
              ))}
            </div>
            <p className={`${hint} mt-3`}>Lost a device? Cancel its key and it stops working straight away.</p>
          </NeonCard>

          <NeonCard>
            <p className="font-medium mb-2">Recent Presses</p>
            {log.length === 0 && <p className={hint}>Nothing yet.</p>}
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {log.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-3 text-xs py-1 border-b border-white/5 last:border-0">
                  <span className={l.ok ? "text-slate-300" : "text-rose-400"}>
                    {l.ok ? "✓" : "⚠️"} <b>{l.action}</b> · {l.message}
                  </span>
                  <span className="text-slate-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </NeonCard>
        </div>
      </div>
    </div>
  );
}
