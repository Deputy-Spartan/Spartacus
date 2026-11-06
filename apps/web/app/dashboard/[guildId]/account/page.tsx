"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { api, clearToken, type AccessStatus, type CurrentUser, type DashboardTheme } from "../../../../lib/api";
import { THEMES, useUserPrefs } from "../../../../lib/userPrefs";

type Tab = "profile" | "account";

// A small picture of each theme, drawn with the theme's own look.
function ThemePreview({ id }: { id: DashboardTheme }) {
  const bg =
    id === "glass"
      ? "radial-gradient(120px 80px at 15% 10%, rgba(123,153,188,.45), transparent 70%), radial-gradient(120px 90px at 100% 100%, rgba(94,127,166,.5), transparent 70%), #1c1d20"
      : id === "daylight"
        ? "#eef1f5"
        : "#1c1d20";
  const card =
    id === "glass"
      ? { background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 8 }
      : id === "daylight"
        ? { background: "#ffffff", border: "1px solid rgba(28,29,32,.1)", borderRadius: 8, boxShadow: "0 2px 6px rgba(28,29,32,.08)" }
        : { background: "linear-gradient(90deg,#5e7fa6,#7b99bc,#94a3b8) top/100% 3px no-repeat, #2a2c31", border: "1px solid #37393f", borderRadius: 8 };
  return (
    <div className="h-20 rounded-lg overflow-hidden p-2 flex gap-1.5" style={{ background: bg }} aria-hidden="true">
      <div className="w-6 rounded" style={{ background: id === "glass" ? "rgba(255,255,255,.08)" : id === "daylight" ? "#ffffff" : "#242529" }} />
      <div className="flex-1 grid grid-cols-2 gap-1.5">
        <div style={card} />
        <div style={card} />
        <div style={card} className="col-span-2" />
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
    <div className="max-w-3xl">
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

      {tab === "account" && (
        <div className="space-y-4">
          <NeonCard>
            <p className={label} id="theme">
              Theme
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
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
            <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-white/5">
              <div>
                <p className="text-sm font-medium">Reduce motion</p>
                <p className="text-xs text-slate-500">Turns off the hover sweeps, sheens and fades.</p>
              </div>
              <ToggleSwitch enabled={prefs.reduceMotion} onChange={(v) => run({ reduceMotion: v }, v ? "✅ Motion reduced" : "✅ Motion back on")} label="Reduce motion" />
            </div>
          </NeonCard>

          <NeonCard>
            <p className={label}>Dashboard access</p>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>{access?.status === "owner" ? "👑 Owner" : access?.status === "approved" ? "✅ Approved" : "…"}</span>
              {access?.plan && <span className="text-xs rounded-full px-2 py-0.5 bg-white/5 text-slate-400">{access.plan === "PAID" ? "Paid plan" : "Free plan"}</span>}
            </div>
            <p className="text-xs text-slate-600 mt-2">For safety, you're signed out after 30 minutes of no activity, and every sign-in lasts at most 24 hours.</p>
          </NeonCard>

          <NeonCard>
            <p className={label}>Sign out</p>
            <p className="text-sm text-slate-400 mb-3">Signs you out of the dashboard on this device. Your settings stay saved to your account.</p>
            <button
              type="button"
              onClick={() => {
                clearToken();
                router.push("/");
              }}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-rose-200 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 transition-colors"
            >
              🚪 Log out
            </button>
          </NeonCard>
        </div>
      )}

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
