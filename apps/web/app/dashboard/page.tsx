"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

export default function GuildPickerPage() {
  const router = useRouter();
  const [guilds, setGuilds] = useState<Array<{ id: string; name: string; icon: string | null }> | null>(null);

  useEffect(() => {
    api
      .getGuilds()
      .then(setGuilds)
      .catch(() => router.push("/"));
  }, [router]);

  if (!guilds) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-base-950 text-slate-400">
        Loading your servers…
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-base-950 px-6 py-16">
      <div className="max-w-2xl mx-auto text-center mb-10">
        <h1 className="text-3xl font-bold bg-neon-gradient bg-clip-text text-transparent mb-2">Choose a server</h1>
        <p className="text-slate-400">Pick a server to manage with Spartacus.</p>
      </div>

      {guilds.length === 0 ? (
        <p className="text-center text-slate-500">
          No manageable servers found — invite Spartacus to a server you own or admin first.
        </p>
      ) : (
        <div className="max-w-2xl mx-auto grid gap-3">
          {guilds.map((guild) => (
            <button
              key={guild.id}
              onClick={() => router.push(`/dashboard/${guild.id}`)}
              className="flex items-center gap-4 rounded-lg bg-base-900 border border-white/5 px-5 py-4 text-left hover:bg-base-800/60 transition-colors"
            >
              {guild.icon ? (
                <img
                  src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-base-800 flex items-center justify-center text-slate-500">
                  {guild.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="text-slate-100 font-medium">{guild.name}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
