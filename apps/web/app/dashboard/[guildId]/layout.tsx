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
  const [guilds, setGuilds] = useState<Array<{ id: string; name: string; icon: string | null }>>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    api
      .getGuilds()
      .then(setGuilds)
      .catch(() => {
        clearToken();
        router.push("/");
      });
    api.getMe().then(setUser).catch(() => null);
  }, [router]);

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
