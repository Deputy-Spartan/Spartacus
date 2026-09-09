"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../../../components/nav/Sidebar";
import { TopHeader } from "../../../components/nav/TopHeader";
import { api, clearToken } from "../../../lib/api";

export default function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { guildId: string };
}) {
  const router = useRouter();
  const [guilds, setGuilds] = useState<Array<{ id: string; name: string; icon: string | null }>>([]);

  useEffect(() => {
    api
      .getGuilds()
      .then(setGuilds)
      .catch(() => {
        clearToken();
        router.push("/");
      });
  }, [router]);

  return (
    <div className="min-h-screen bg-base-950">
      <Sidebar guildId={params.guildId} />
      <div className="ml-60">
        <TopHeader
          user={{ username: "Loading…", avatar: null }}
          guilds={guilds}
          activeGuildId={params.guildId}
          onSelectGuild={(id) => router.push(`/dashboard/${id}`)}
        />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
