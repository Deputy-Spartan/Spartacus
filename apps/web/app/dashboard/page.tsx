"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, buildBotInviteUrl, refreshSessionIfOld } from "../../lib/api";
import { readLastGuild } from "../../lib/lastGuild";
import { SpartacusLoader } from "../../components/ui/SpartacusLoader";

type Guild = { id: string; name: string; icon: string | null; botInstalled: boolean; members?: number | null };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const CHECK_EVERY = 5000; // after tapping Add, look for the bot this often
const CHECK_FOR = 3 * 60 * 1000; // ...for up to 3 minutes

// First-letter circle colors, so servers without an icon still look distinct.
const TINTS = ["#5e7fa6", "#7c5ea6", "#a65e7f", "#5ea68c", "#a6865e", "#5e9aa6"];
const tint = (id: string) => TINTS[Number(BigInt(id) % BigInt(TINTS.length))];

export default function GuildPickerPage() {
  const router = useRouter();
  const [guilds, setGuilds] = useState<Guild[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const addedAt = useRef(0);

  const load = useCallback(() => {
    return api
      .getGuilds()
      .then((rows) => {
        setFailed(false);
        setGuilds(rows);
        return rows;
      })
      .catch((err) => {
        // An expired login already goes to the sign-in page (lib/api.ts);
        // anything else gets a Try again button instead of a log-out.
        if (!(err instanceof Error && err.message === "Session expired")) setFailed(true);
        return null;
      });
  }, []);

  useEffect(() => {
    const last = readLastGuild();
    setLastId(last);
    const auto = new URLSearchParams(window.location.search).get("auto") === "1";
    refreshSessionIfOld();
    load().then((rows) => {
      // Right after signing in, go straight back to the server you used last.
      const hit = auto && rows?.find((g) => g.id === last && g.botInstalled);
      if (hit) router.replace(`/dashboard/${hit.id}`);
      else if (auto) window.history.replaceState(null, "", "/dashboard");
    });
    api.getBotConfig().then((c) => setClientId(c.clientId)).catch(() => null);
  }, [load, router]);

  // After you tap Add, keep checking until the bot shows up, so the row flips
  // to Installed without a refresh. Coming back to this tab checks at once.
  useEffect(() => {
    if (!adding) return;
    const check = () => {
      if (Date.now() - addedAt.current > CHECK_FOR) return setAdding(null);
      load().then((rows) => {
        if (rows?.find((g) => g.id === adding)?.botInstalled) setAdding(null);
      });
    };
    const timer = setInterval(check, CHECK_EVERY);
    const onFocus = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [adding, load]);

  if (failed && !guilds) {
    return (
      <main className="min-h-screen bg-base-950 flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-4xl" aria-hidden="true">📡</p>
        <h1 className="text-lg font-semibold text-slate-100">Couldn&apos;t load your servers</h1>
        <p className="text-sm text-slate-400 max-w-sm">You&apos;re still signed in. Check your internet, then try again.</p>
        <button type="button" onClick={() => load()} className="neon-button mt-2">
          Try again
        </button>
      </main>
    );
  }

  if (!guilds) return <SpartacusLoader label="Loading your servers" />;

  // Installed servers first (your last one on top), then the rest.
  const sorted = [...guilds].sort(
    (a, b) => Number(b.botInstalled) - Number(a.botInstalled) || Number(b.id === lastId) - Number(a.id === lastId) || a.name.localeCompare(b.name),
  );

  return (
    <main className="min-h-screen bg-base-950 px-4 py-12 sm:py-16">
      <div className="max-w-2xl mx-auto text-center mb-8">
        <h1 className="text-3xl font-bold bg-neon-gradient bg-clip-text text-transparent mb-2">Choose a server</h1>
        <p className="text-slate-400">Pick a server to manage with Spartacus.</p>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center text-slate-500 max-w-md mx-auto">
          No servers found. You need Manage Server permission on a server for it to show up here.
        </p>
      ) : (
        <div className="max-w-2xl mx-auto grid gap-3">
          {sorted.map((guild) => {
            const icon = guild.icon ? (
              <img src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`} alt="" className="w-12 h-12 rounded-full shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-white font-bold" style={{ background: tint(guild.id) }}>
                {guild.name.slice(0, 1).toUpperCase()}
              </div>
            );
            const members = typeof guild.members === "number" ? <span>{guild.members.toLocaleString()} members</span> : null;

            if (!guild.botInstalled) {
              const waiting = adding === guild.id;
              return (
                <div key={guild.id} className="flex items-center gap-4 rounded-xl bg-base-900/60 border border-white/5 px-4 py-4">
                  <span className="opacity-70">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-300 font-semibold truncate">{guild.name}</p>
                    <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full inline-block ${waiting ? "bg-amber-400 animate-pulse" : "bg-slate-600"}`} />
                        {waiting ? "Waiting for the bot to join…" : "Not installed"}
                      </span>
                      {members}
                    </p>
                  </div>
                  {clientId && (
                    <a
                      href={buildBotInviteUrl(clientId, guild.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        addedAt.current = Date.now();
                        setAdding(guild.id);
                      }}
                      className="neon-button-sm shrink-0"
                    >
                      Add
                    </a>
                  )}
                </div>
              );
            }

            return (
              <button
                key={guild.id}
                onClick={() => router.push(`/dashboard/${guild.id}`)}
                className="group flex items-center gap-4 rounded-xl bg-base-900 border border-white/10 px-4 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-neon-blue hover:shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.6),0_0_18px_rgb(var(--accent-rgb)/0.3)] focus-visible:border-neon-blue"
              >
                {icon}
                <div className="flex-1 min-w-0">
                  <p className="text-slate-100 font-semibold truncate">{guild.name}</p>
                  <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                      Installed
                    </span>
                    {members}
                  </p>
                </div>
                {guild.id === lastId && <span className="shrink-0 rounded-full bg-neon-blue/15 px-2.5 py-0.5 text-[11px] font-semibold text-neon-blue">Last used</span>}
                <span className="text-slate-500 group-hover:text-slate-200 transition-colors" aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>
      )}

      {/* The server list comes from Discord when you sign in, so signing in
          again is how a newly joined server shows up. */}
      <p className="text-center mt-6">
        <a href={`${API_URL}/auth/discord`} className="text-sm text-neon-blue hover:underline">
          Don&apos;t see a server? Refresh list ↻
        </a>
      </p>
    </main>
  );
}
