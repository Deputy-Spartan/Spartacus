"use client";

import { DashboardTextProvider, WhenTextsReady } from "../../../components/ui/EditableText";
import { rememberLastUser } from "../../../lib/lastUser";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../../../components/nav/Sidebar";
import { TopHeader } from "../../../components/nav/TopHeader";
import { CommandPalette } from "../../../components/nav/CommandPalette";
import { PageGuideButton } from "../../../components/nav/PageGuideButton";
import { ConfirmProvider } from "../../../components/ui/ConfirmDialog";
import { api, refreshSessionIfOld, type CurrentUser } from "../../../lib/api";
import { rememberLastGuild } from "../../../lib/lastGuild";
import { SpartacusLoader } from "../../../components/ui/SpartacusLoader";
import { PageGate } from "../../../components/nav/PageGate";
import { preloadGuild } from "../../../lib/prefetch";
import { UserPrefsProvider } from "../../../lib/userPrefs";
import { PhoneTabBar } from "../../../components/nav/PhoneTabBar";
import { HubTabs } from "../../../components/nav/HubTabs";
import { EditModeProvider } from "../../../lib/editMode";
import { PageEditor } from "../../../components/edit/PageEditor";
import { NavGestures } from "../../../components/nav/NavGestures";

export default function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { guildId: string };
}) {
  const router = useRouter();
  const [guilds, setGuilds] = useState<Array<{ id: string; name: string; icon: string | null; botInstalled: boolean }>>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  // Starts open (matches desktop's long-standing always-visible default);
  // corrected to closed on mount if the viewport is actually mobile-sized,
  // so this one state drives both the mobile overlay drawer AND the
  // desktop collapse toggle instead of two separate mechanisms.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [access, setAccess] = useState<"checking" | "allowed" | "denied" | "error">("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
    refreshSessionIfOld();
  }, []);

  useEffect(() => {
    // An expired login already sends you to the sign-in page (lib/api.ts).
    // Anything else (the API down, no internet) shows Try again instead of
    // logging you out.
    const failed = (err: unknown) => {
      if (err instanceof Error && err.message === "Session expired") return;
      setAccess("error");
    };
    setAccess("checking");
    api
      .getAccessStatus()
      .then((status) => {
        if (status.status !== "owner" && status.status !== "approved") {
          router.push("/access-required");
          return;
        }
        setIsOwner(status.status === "owner");

        api
          .getGuilds()
          .then((rows) => {
            setGuilds(rows);
            const guild = rows.find((g) => g.id === params.guildId);
            if (!guild || !guild.botInstalled) {
              setAccess("denied");
              router.push("/dashboard");
            } else {
              setAccess("allowed");
              rememberLastGuild(params.guildId);
              preloadGuild(params.guildId);
            }
          })
          .catch(failed);
      })
      .catch(failed);
    api
      .getMe()
      .then((me) => {
        setUser(me);
        // Keeps the sign-in page's "Welcome back" avatar current, even for
        // people who signed in before it was added or changed their avatar.
        rememberLastUser(me);
      })
      .catch(() => null);
  }, [router, params.guildId, attempt]);

  if (access === "error") {
    return (
      <main className="min-h-screen bg-base-950 flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-4xl" aria-hidden="true">📡</p>
        <h1 className="text-lg font-semibold text-slate-100">Can&apos;t reach Spartacus right now</h1>
        <p className="text-sm text-slate-400 max-w-sm">You&apos;re still signed in. Check your internet, then try again.</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="neon-button mt-2">
          Try again
        </button>
      </main>
    );
  }

  if (access !== "allowed") {
    return <SpartacusLoader label={access === "checking" ? "Opening your dashboard" : "Taking you to your servers"} />;
  }

  return (
    <UserPrefsProvider>
    <DashboardTextProvider isOwner={isOwner}>
    <EditModeProvider>
    <WhenTextsReady>
    <ConfirmProvider>
      <div className="sp-shell min-h-screen bg-base-950">
        <CommandPalette guildId={params.guildId} />
        <Sidebar guildId={params.guildId} open={sidebarOpen} onClose={() => setSidebarOpen(false)} isOwner={isOwner} />
        <div className={`transition-[margin] duration-200 ${sidebarOpen ? "md:ml-60" : "md:ml-0"}`}>
          <TopHeader
            user={{
              username: user?.username ?? "…",
              avatar: user ? (user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null) : null,
            }}
            guilds={guilds}
            activeGuildId={params.guildId}
            onSelectGuild={(id) => router.push(`/dashboard/${id}`)}
            onMenuClick={() => setSidebarOpen((v) => !v)}
            sidebarOpen={sidebarOpen}
          />
          {/* overflow-x-clip, not -hidden — "hidden" implicitly makes this a
              scroll container even with nothing to scroll, which breaks
              position:sticky on descendants (e.g. the Embed Creator's live
              preview column). "clip" prevents the horizontal overflow
              without that side effect. */}
          <main data-edit-root className="p-3 sm:p-6 pb-36 md:pb-6 overflow-x-clip">
            <HubTabs guildId={params.guildId} />
            <PageGuideButton guildId={params.guildId} />
            <PageGate>{children}</PageGate>
          </main>
        </div>
        <PhoneTabBar guildId={params.guildId} />
        <PageEditor />
        <NavGestures guildId={params.guildId} />
      </div>
    </ConfirmProvider>
    </WhenTextsReady>
    </EditModeProvider>
    </DashboardTextProvider>
    </UserPrefsProvider>
  );
}
