"use client";

import { Suspense, useEffect, useState, Fragment } from "react";
import { useSearchParams } from "next/navigation";
import { FRONT_PAGE_DEFAULTS, type FrontPageCard } from "@spartacus/shared";
import { forgetLastUser, readLastUser, type LastUser } from "../lib/lastUser";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// The info boxes, each opening into what it means. The owner edits them in
// Owner Only → Front Page; the built-in set shows until that loads (or if it fails).
function useFrontPage() {
  const [cards, setCards] = useState<FrontPageCard[]>(FRONT_PAGE_DEFAULTS);
  useEffect(() => {
    fetch(`${API_URL}/public/front-page`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && Array.isArray(j.cards) && j.cards.length && setCards(j.cards))
      .catch(() => null);
  }, []);
  return cards;
}

function useServerCount() {
  const [stats, setStats] = useState<{ servers: number; members: number; botAvatar: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`${API_URL}/public/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j ? setStats(j) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);
  return { stats, failed };
}

const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

// Spartacus's logo is the bot's own Discord avatar, so changing the bot's
// picture (in the Discord Developer Portal, or anywhere else) changes it here
// too, the same way the sidebar and the browser tab icon follow it.
// /public/stats gives the current picture (it refreshes every minute); if that
// call fails, the public /bot-avatar image is used instead. Until one loads,
// an empty circle holds the spot so nothing jumps.
function BotLogo({ src, failed, className = "" }: { src: string | null | undefined; failed: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const url = src ?? (failed ? `${API_URL}/bot-avatar` : null);
  if (!url || broken) return <span aria-hidden="true" className={`block rounded-full bg-white/[0.06] ${className}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Spartacus" onError={() => setBroken(true)} className={`rounded-full object-cover ${className}`} />;
}

function FeatureDetails({ f }: { f: FrontPageCard }) {
  return (
    <div className="rounded-xl border border-neon-blue/30 bg-black/20 px-4 py-3.5 animate-[fadeIn_.25s_ease-out]">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-lg">{f.icon}</span>
        {f.title}
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {f.details.map((d, k) => (
          <li key={k} className="flex gap-2 text-[13px] text-slate-300">
            <span className="text-neon-blue">✓</span>
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiscordLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="currentColor"
        d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 0 13.6.3 18.1a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.4-5.3-.7-9.8-3.4-13.7zM8.5 15.4c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4z"
      />
    </svg>
  );
}

function LandingContent() {
  const params = useSearchParams();
  const expired = params.get("expired") === "1";
  const idle = params.get("idle") === "1";
  const signinFailed = params.get("error") === "signin";
  const { stats, failed: statsFailed } = useServerCount();
  const cards = useFrontPage();
  const [open, setOpen] = useState<number | null>(null);
  const [lastUser, setLastUser] = useState<LastUser | null>(null);
  const [going, setGoing] = useState(false);

  useEffect(() => setLastUser(readLastUser()), []);

  const notice = idle
    ? "You were signed out after 30 minutes of inactivity."
    : signinFailed
      ? "Sign-in didn't go through — the dashboard couldn't reach the server after Discord authorized you. Check your connection and try again."
      : expired
        ? "Your session expired — please sign in again."
        : null;

  return (
    <main className="min-h-screen bg-base-950 text-slate-100 grid lg:grid-cols-[1.15fr_1fr]">
      {/* Left: what Spartacus does */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#23262c] to-[#141518] px-6 py-10 sm:px-12 lg:py-14 flex flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(123,153,188,0.32),transparent_65%)]" />
        <div className="relative flex items-center gap-2.5">
          <BotLogo src={stats?.botAvatar} failed={statsFailed} className="h-9 w-9 ring-1 ring-white/10" />
          <span className="text-xl font-extrabold tracking-tight">Spartacus</span>
        </div>
        <h1 className="relative mt-10 text-3xl sm:text-4xl font-extrabold leading-tight max-w-xl">Run your gaming community from one dashboard.</h1>
        <p className="relative mt-3 text-slate-400 max-w-md">Everything your server needs, set up in minutes and managed in one place. Tap a box to see what it does.</p>

        {/* Wider screens: the boxes stay put in two columns, and the open box's
            details open in a full-width strip right under its row, with an
            arrow pointing at the box. Phones (one column): the details open
            right under the box that was tapped. */}
        <div className="relative mt-8 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {cards.map((f, i) => {
              const isOpen = open === i;
              return (
                <Fragment key={`${i}-${f.title}`}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? `feature-details-${i}` : undefined}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className={`group h-full text-left rounded-xl border px-4 py-3 transition-all duration-200 ${
                    isOpen
                      ? "border-neon-blue/60 bg-neon-blue/[0.14] shadow-[0_8px_26px_rgba(94,127,166,0.28)]"
                      : "border-white/[0.07] bg-white/[0.03] hover:border-neon-blue/40 hover:bg-white/[0.06] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className={`text-xl transition-transform duration-200 ${isOpen ? "scale-110" : "group-hover:scale-110"}`}>{f.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold">{f.title}</span>
                      <span className="block text-xs text-slate-400">{f.short}</span>
                    </span>
                    <span className={`text-xs transition-transform duration-200 ${isOpen ? "rotate-180 text-neon-blue" : "text-slate-500"}`}>▼</span>
                  </span>
                </button>
                <div className={`sm:hidden grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100 -mt-1" : "grid-rows-[0fr] opacity-0 -mt-2.5"}`}>
                  <div className="overflow-hidden">{isOpen && <FeatureDetails f={f} />}</div>
                </div>
                {(i % 2 === 1 || i === cards.length - 1) && open !== null && (open === i || (i % 2 === 1 && open === i - 1)) && cards[open] && (
                  <div id={`feature-details-${open}`} key={`row-${open}`} className="relative hidden sm:block sm:col-span-2 pt-1.5 animate-[fadeIn_.25s_ease-out]">
                    <span
                      aria-hidden="true"
                      className={`absolute top-0 z-10 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-neon-blue/30 bg-[#1b1d22] ${open % 2 === 1 ? "left-3/4" : "left-1/4"}`}
                    />
                    <FeatureDetails f={cards[open]} />
                  </div>
                )}
                </Fragment>
              );
            })}
          </div>
        </div>

        <div className="relative mt-auto pt-10 flex gap-8">
          <div>
            <p className="text-2xl font-extrabold text-[#9fb6d3]">{stats ? compact(stats.servers) : "…"}</p>
            <p className="text-xs text-slate-500">{stats?.servers === 1 ? "server" : "servers"} right now</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-[#9fb6d3]">{stats ? compact(stats.members) : "…"}</p>
            <p className="text-xs text-slate-500">members looked after</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-[#9fb6d3]">27</p>
            <p className="text-xs text-slate-500">modules</p>
          </div>
        </div>
      </section>

      {/* Right: sign in */}
      <section className="relative flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-base-900 p-7 shadow-[0_20px_60px_rgba(0,0,0,0.4)] text-center">
          {lastUser?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lastUser.avatarUrl} alt="" className="mx-auto h-16 w-16 rounded-full ring-2 ring-neon-blue/40" />
          ) : (
            <BotLogo src={stats?.botAvatar} failed={statsFailed} className="mx-auto h-16 w-16 ring-2 ring-white/10" />
          )}
          <h2 className="mt-4 text-xl font-bold">{lastUser ? `Welcome back, ${lastUser.name}` : "Welcome"}</h2>
          <p className="mt-1 text-sm text-slate-400">Sign in with the Discord account that manages your server.</p>
          {notice && <p className="mt-4 text-amber-300 text-sm bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">{notice}</p>}
          <a
            href={`${API_URL}/auth/discord`}
            onClick={() => setGoing(true)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3 font-semibold text-white shadow-[0_8px_22px_rgba(88,101,242,0.35)] transition hover:-translate-y-0.5 hover:bg-[#4752C4] hover:shadow-[0_12px_28px_rgba(88,101,242,0.45)]"
          >
            {going ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Opening Discord…
              </>
            ) : (
              <>
                <DiscordLogo /> {lastUser ? `Continue as ${lastUser.name}` : "Log in with Discord"}
              </>
            )}
          </a>
          {lastUser && (
            <button
              type="button"
              onClick={() => {
                forgetLastUser();
                setLastUser(null);
              }}
              className="mt-3 text-xs text-slate-500 hover:text-slate-300"
            >
              Not you? Use a different account
            </button>
          )}
        </div>
        <p className="absolute bottom-5 text-[11px] text-slate-600">Spartacus · Discord sign-in only, no password stored</p>
      </section>
    </main>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-base-950" />}>
      <LandingContent />
    </Suspense>
  );
}
