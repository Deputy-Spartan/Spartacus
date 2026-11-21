"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { api, clearToken, type AccessStatus, type CurrentUser } from "../../../../lib/api";
import { ACCENTS, THEMES, useUserPrefs } from "../../../../lib/userPrefs";
import { ThemePreview } from "../../../../components/ui/ThemePreview";

// The settings menu (Account settings tab): each entry jumps to its section.
const SECTIONS: Array<[string, string]> = [
  ["theme", "🎨 Theme"],
  ["accent", "🌈 Accent color"],
  ["effects", "✨ Effects"],
  ["layout", "📐 Layout"],
  ["access", "🔐 Access"],
  ["signout", "🚪 Sign out"],
];

type Tab = "profile" | "account";

type Run = (patch: Partial<import("../../../../lib/api").UserPrefs>, done: string) => Promise<void>;

// Account settings: a menu on the left (a row of chips on a phone) and one
// section per entry.
function SettingsTab({ run, access, onSignOut }: { run: Run; access: AccessStatus | null; onSignOut: () => void }) {
  const { prefs } = useUserPrefs();
  const current = THEMES.find((t) => t.id === prefs.theme);
  const [active, setActive] = useState("theme");
  const accentTimer = useRef<ReturnType<typeof setTimeout>>();
  const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";

  // Highlight the section on screen.
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(`set-${id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (seen) setActive(seen.target.id.slice(4));
    }, { rootMargin: "-90px 0px -60% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: prefs.reduceMotion ? "auto" : "smooth", block: "start" });
  };
  const row = (title: string, text: string, control: React.ReactNode) => (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-white/5 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-slate-500">{text}</p>
      </div>
      {control}
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] items-start">
      <nav aria-label="Settings" className="sticky top-[64px] z-[5] -mx-1 px-1 py-1 lg:p-0 lg:m-0 flex lg:flex-col gap-1 overflow-x-auto bg-base-950/80 lg:bg-transparent backdrop-blur lg:backdrop-blur-0 rounded-lg">
        {SECTIONS.map(([id, text]) => (
          <button
            key={id}
            type="button"
            onClick={() => jump(id)}
            aria-current={active === id ? "true" : undefined}
            className={`sp-metal shrink-0 whitespace-nowrap text-left px-3 py-2 rounded-lg text-sm ${active === id ? "is-active" : ""}`}
          >
            {text}
          </button>
        ))}
      </nav>

      <div className="space-y-4 min-w-0">
        <section id="set-theme" className="scroll-mt-24">
          <NeonCard>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <p className={label + " mb-0"}>Theme</p>
              <p className="text-xs text-slate-500">Now: <span className="text-slate-200 font-medium">{current?.name ?? "Studio"}</span></p>
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => run({ theme: t.id }, `✅ ${t.name} theme saved to your account`)}
                  aria-pressed={prefs.theme === t.id}
                  className={["text-left rounded-xl border p-2.5 transition-colors", prefs.theme === t.id ? "border-neon-blue bg-neon-blue/10" : "border-white/10 hover:border-white/25"].join(" ")}
                >
                  <ThemePreview id={t.id} />
                  <p className="text-sm font-semibold mt-2">
                    {t.name} {prefs.theme === t.id && <span className="text-neon-blue">✓</span>}
                  </p>
                  <p className="text-xs text-slate-500">{t.blurb}</p>
                </button>
              ))}
            </div>
          </NeonCard>
        </section>

        <section id="set-accent" className="scroll-mt-24">
          <NeonCard>
            <p className={label}>Accent color</p>
            <p className="text-xs text-slate-500 mb-3">The glow and highlight color on buttons, cards and the menu. Leave it on Theme to use each theme&apos;s own.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => run({ accent: null }, "✅ Using the theme's own accent color")}
                aria-pressed={!prefs.accent}
                className={["h-9 px-3 rounded-full border text-xs font-semibold", !prefs.accent ? "border-neon-blue/80 text-neon-blue" : "border-white/10 text-slate-400 hover:border-white/25"].join(" ")}
              >
                Theme
              </button>
              {ACCENTS.map((a) => (
                <button
                  key={a.hex}
                  type="button"
                  onClick={() => run({ accent: a.hex }, `✅ Accent color: ${a.name}`)}
                  aria-pressed={prefs.accent === a.hex}
                  aria-label={a.name}
                  title={a.name}
                  className={["h-9 w-9 rounded-full border-2 transition-transform hover:scale-110", prefs.accent === a.hex ? "border-white scale-110" : "border-transparent"].join(" ")}
                  style={{ background: a.hex, boxShadow: prefs.accent === a.hex ? `0 0 12px ${a.hex}` : undefined }}
                />
              ))}
              <label className="h-9 px-3 rounded-full border border-white/10 text-xs font-semibold text-slate-400 hover:border-white/25 flex items-center gap-2 cursor-pointer">
                <input
                  type="color"
                  key={prefs.accent ?? prefs.theme}
                  defaultValue={prefs.accent ?? current?.accent ?? "#7b99bc"}
                  onChange={(e) => {
                    // Saves once you stop moving the picker, not on every step.
                    const v = e.target.value;
                    clearTimeout(accentTimer.current);
                    accentTimer.current = setTimeout(() => run({ accent: v }, "✅ Accent color saved"), 400);
                  }}
                  className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label="Pick any color"
                />
                Any color
              </label>
            </div>
          </NeonCard>
        </section>

        <section id="set-effects" className="scroll-mt-24">
          <NeonCard>
            <p className={label}>Effects</p>
            {row("Reduce motion", "Turns off the hover sweeps, sheens and fades.", <ToggleSwitch enabled={prefs.reduceMotion} onChange={(v) => run({ reduceMotion: v }, v ? "✅ Motion reduced" : "✅ Motion back on")} label="Reduce motion" />)}
          </NeonCard>
        </section>

        <section id="set-layout" className="scroll-mt-24">
          <NeonCard>
            <p className={label}>Layout</p>
            {row("Compact mode", "Smaller text, buttons and cards, so more fits on the screen.", <ToggleSwitch enabled={prefs.compact} onChange={(v) => run({ compact: v }, v ? "✅ Compact mode on" : "✅ Compact mode off")} label="Compact mode" />)}
          </NeonCard>
        </section>

        <section id="set-access" className="scroll-mt-24">
          <NeonCard>
            <p className={label}>Dashboard access</p>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>{access?.status === "owner" ? "👑 Owner" : access?.status === "approved" ? "✅ Approved" : "…"}</span>
              {access?.plan && <span className="text-xs rounded-full px-2 py-0.5 bg-white/5 text-slate-400">{access.plan === "PAID" ? "Paid plan" : "Free plan"}</span>}
            </div>
            <p className="text-xs text-slate-600 mt-2">For safety, you&apos;re signed out after 30 minutes of no activity, and every sign-in lasts at most 24 hours.</p>
          </NeonCard>
        </section>

        <section id="set-signout" className="scroll-mt-24">
          <NeonCard>
            <p className={label}>Sign out</p>
            <p className="text-sm text-slate-400 mb-3">Signs you out of the dashboard on this device. Your settings stay saved to your account.</p>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-rose-200 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 transition-colors"
            >
              🚪 Log out
            </button>
          </NeonCard>
        </section>
      </div>
    </div>
  );
}

function AccountPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = useSearchParams().get("tab") === "account" ? "account" : "profile";
  const { prefs, save } = useUserPrefs();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.getMe().then(setMe).catch(() => null);
    api.getAccessStatus().then(setAccess).catch(() => null);
  }, []);
  useEffect(() => setName(prefs.displayName ?? ""), [prefs.displayName]);

  const accentTimer = useRef<ReturnType<typeof setTimeout>>();
  async function run(patch: Parameters<typeof save>[0], done: string) {
    const err = await save(patch);
    setNote(err ? { ok: false, text: err } : { ok: true, text: done });
  }

  const avatar = me?.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : "/default-avatar.png";
  const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
  const tabBtn = (id: Tab, text: string) => (
    <button
      type="button"
      onClick={() => {
        setNote(null);
        router.replace(`${pathname}?tab=${id}`);
      }}
      className={["px-4 py-2 text-sm border-b-2 transition-colors", tab === id ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300"].join(" ")}
    >
      {text}
    </button>
  );

  return (
    <div className={tab === "account" ? "max-w-5xl" : "max-w-3xl"}>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Your account</h1>
        <p className="text-sm text-slate-500">These settings are yours alone and follow you to every device you sign in on.</p>
      </div>

      <div className="flex gap-1 mb-5 border-b border-white/5">
        {tabBtn("profile", "👤 Profile")}
        {tabBtn("account", "⚙️ Account settings")}
      </div>

      {tab === "profile" && (
        <div className="space-y-4">
          <NeonCard>
            <div className="flex items-center gap-4">
              <img src={avatar} alt="" className="h-16 w-16 rounded-full border border-neon-blue" />
              <div className="min-w-0">
                <p className="text-lg font-semibold truncate">{prefs.displayName || me?.username || "…"}</p>
                <p className="text-sm text-slate-500 truncate">@{me?.username ?? "…"} · Discord</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mt-3">Your picture comes from Discord. Change it in Discord and it updates here the next time you sign in.</p>
          </NeonCard>

          <NeonCard>
            <label className={label} htmlFor="display-name">
              Display name
            </label>
            <input
              id="display-name"
              value={name}
              maxLength={32}
              onChange={(e) => setName(e.target.value)}
              placeholder={me?.username ?? "Your name"}
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-2"
            />
            <p className="text-xs text-slate-600 mb-4">Shown in the dashboard's top bar and menu. Leave it empty to use your Discord name. This doesn't change anything in Discord.</p>
            <button type="button" className="neon-button" onClick={() => run({ displayName: name }, "✅ Display name saved")}>
              Save
            </button>
          </NeonCard>

          <NeonCard>
            <p className={label}>Signed in with</p>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>Discord · @{me?.username ?? "…"}</span>
              <span className="text-xs text-slate-500 font-mono truncate">ID {me?.id ?? "…"}</span>
            </div>
          </NeonCard>
        </div>
      )}

      {tab === "account" && <SettingsTab run={run} access={access} onSignOut={() => { clearToken(); router.push("/"); }} />}
      {note && <p className={`text-xs mt-3 ${note.ok ? "text-emerald-400" : "text-rose-400"}`}>{note.text}</p>}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountPageInner />
    </Suspense>
  );
}
