"use client";

import { BotStatusBadge } from "./BotStatusBadge";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  botInstalled: boolean;
}

interface TopHeaderProps {
  user: { username: string; avatar: string | null };
  guilds: Guild[];
  activeGuildId: string;
  onSelectGuild: (guildId: string) => void;
  onMenuClick: () => void;
}

export function TopHeader({ user, guilds, activeGuildId, onSelectGuild, onMenuClick }: TopHeaderProps) {
  const installedGuilds = guilds.filter((g) => g.botInstalled);

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 sm:px-6 py-3 sm:py-4 bg-base-950/80 backdrop-blur border-b border-white/5">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onMenuClick} className="shrink-0 md:hidden text-slate-300 hover:text-neon-blue text-xl leading-none p-1" aria-label="Open menu">
          ☰
        </button>
        <select
          value={activeGuildId}
          onChange={(e) => onSelectGuild(e.target.value)}
          className="min-w-0 max-w-[45vw] sm:max-w-none bg-base-900 border border-white/10 rounded-lg px-2 sm:px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-neon-blue truncate"
        >
          {installedGuilds.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <BotStatusBadge />
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("spartacus:open-command-palette"))}
          className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 hover:text-neon-blue border border-white/10 rounded-lg px-2.5 py-1.5 transition-colors"
        >
          <span>🔍</span>
          <span>Search</span>
          <kbd className="text-[10px] border border-white/10 rounded px-1">⌘K</kbd>
        </button>
        <span className="hidden sm:inline text-sm text-slate-300">{user.username}</span>
        <img
          src={user.avatar ?? "/default-avatar.png"}
          alt={user.username}
          className="h-8 w-8 rounded-full border border-neon-blue shadow-glow-blue"
        />
      </div>
    </header>
  );
}
