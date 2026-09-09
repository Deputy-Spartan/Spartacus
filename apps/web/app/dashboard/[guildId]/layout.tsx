"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../../../components/nav/Sidebar";
import { TopHeader } from "../../../components/nav/TopHeader";
import { CommandPalette } from "../../../components/nav/CommandPalette";
import { ConfirmProvider } from "../../../components/ui/ConfirmDialog";
import { api, clearToken, type CurrentUser } from "../../../lib/api";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
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
        }
      })
      .catch(() => {
        clearToken();
        router.push("/");
      });
    api.getMe().then(setUser).catch(() => null);
  }, [router, params.guildId]);

  if (access !== "allowed") {
    return (
      <div className="min-h-screen bg-base-950 flex items-center justify-center text-slate-400">
        {access === "checking" ? "Checking access…" : "Redirecting…"}
      </div>
    );
  }

  return (
    <ConfirmProvider>
      <div className="min-h-screen bg-base-950">
        <CommandPalette guildId={params.guildId} />
        <Sidebar guildId={params.guildId} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="md:ml-60">
          <TopHeader
            user={{
              username: user?.username ?? "…",
              avatar: user ? (user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null) : null,
            }}
            guilds={guilds}
            activeGuildId={params.guildId}
            onSelectGuild={(id) => router.push(`/dashboard/${id}`)}
            onMenuClick={() => setSidebarOpen(true)}
          />
          <main className="p-3 sm:p-6 overflow-x-hidden">{children}</main>
        </div>
      </div>
    </ConfirmProvider>
  );
}
