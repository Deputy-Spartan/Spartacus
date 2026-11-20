"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../ui/NeonCard";
import { ChannelSelect } from "../ui/ChannelSelect";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { api, type CommandListSettingsRow } from "../../lib/api";

const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const hint = "text-xs text-slate-500";

// Custom Commands › Command list post: every command, posted in a channel and
// kept up to date. Each command is a tappable Discord command, so a tap (on PC
// or phone) puts it straight into the message box.
export function CommandListPost({ guildId }: { guildId: string }) {
  const [s, setS] = useState<CommandListSettingsRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.getCommandList(guildId).then(setS).catch(() => setMsg({ ok: false, text: "Couldn't load the settings." }));
  }, [guildId]);

  async function save(patch: Partial<CommandListSettingsRow>) {
    if (!s) return;
    setS({ ...s, ...patch });
    setBusy(true);
    try {
      const r = await api.saveCommandList(guildId, patch);
      setS(r);
      setMsg(r.error ? { ok: false, text: r.error } : r.channelId ? { ok: true, text: r.posted ? "✓ Saved. The posted list matches." : "✓ Saved." } : { ok: true, text: "✓ Saved. Pick a channel to post the list." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  async function postNow() {
    setBusy(true);
    setMsg(null);
    try {
      setS(await api.postCommandList(guildId));
      setMsg({ ok: true, text: "✓ Posted. It's up to date." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't post the list." });
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <p className="text-slate-400">{msg?.text ?? "Loading…"}</p>;

  const row = (title: string, text: string, key: "autoUpdate" | "includeStaff" | "includeCustom" | "onlyEnabled") => (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-white/5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className={hint}>{text}</p>
      </div>
      <ToggleSwitch enabled={s[key]} onChange={(v) => save({ [key]: v })} label={title} />
    </div>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <NeonCard>
        <p className="font-medium mb-1">📢 Command list post</p>
        <p className={`${hint} mb-4`}>
          Posts every command in a channel. Each one is a tappable Discord command: tapping it (on PC or phone) puts it straight into the message box, ready to send.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="min-w-0">
            <label className={label}>Post in</label>
            <ChannelSelect guildId={guildId} value={s.channelId} onChange={(id) => save({ channelId: id || null })} kind="text" placeholder="Pick a channel…" />
          </div>
          <div className="min-w-0">
            <span className={label}>Style</span>
            <div className="flex gap-2">
              {(["EMBED", "PLAIN"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={s.style === v} onClick={() => save({ style: v })} className={`sp-metal flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold ${s.style === v ? "is-active" : ""}`}>
                  {v === "EMBED" ? "🧱 Embed" : "💬 Plain message"}
                </button>
              ))}
            </div>
            <p className={`${hint} mt-1`}>{s.style === "EMBED" ? "One tidy card, usually one message." : "Headings and lists. A long list takes a few messages (2,000 characters each)."}</p>
          </div>
        </div>
        <div className="mt-4">
          {row("Update by itself", "When a command is added, changed or removed (or a module is turned on or off), the posted list is edited to match. No new posts.", "autoUpdate")}
          {row("Include staff commands", "Ban, kick, purge and other staff-only commands, marked STAFF.", "includeStaff")}
          {row("Include your custom commands", "The /commands and !triggers made on this page.", "includeCustom")}
          {row("Only modules that are on", "Leave out commands from modules you've turned off.", "onlyEnabled")}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button className="neon-button" disabled={busy || !s.channelId} onClick={postNow}>
            {busy ? "Working…" : s.posted ? "Update the list now" : "Post the list"}
          </button>
          {msg && <span className={`text-xs ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>{msg.text}</span>}
        </div>
        <p className={`${hint} mt-3`}>Changing the channel or style removes the old post and posts it fresh in the new place.</p>
      </NeonCard>
    </div>
  );
}
