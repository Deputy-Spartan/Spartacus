"use client";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

interface TopHeaderProps {
  user: { username: string; avatar: string | null };
  guilds: Guild[];
  activeGuildId: string;
  onSelectGuild: (guildId: string) => void;
}

export function TopHeader({ user, guilds, activeGuildId, onSelectGuild }: TopHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-base-950/80 backdrop-blur border-b border-white/5">
      <select
        value={activeGuildId}
        onChange={(e) => onSelectGuild(e.target.value)}
        className="bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-neon-blue"
      >
        {guilds.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-300">{user.username}</span>
        <img
          src={user.avatar ?? "/default-avatar.png"}
          alt={user.username}
          className="h-8 w-8 rounded-full border border-neon-blue shadow-glow-blue"
        />
      </div>
    </header>
  );
}
