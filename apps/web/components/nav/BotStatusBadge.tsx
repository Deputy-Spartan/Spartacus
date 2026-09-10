"use client";

import { useBotStatus } from "../../lib/useBotStatus";

// Small pill in the top header showing whether the bot's Discord
// connection is actually up right now, not just whether the dashboard
// loaded — see apps/web/lib/useBotStatus.ts for how that's determined.
export function BotStatusBadge() {
  const status = useBotStatus();

  const label = status === null ? "Checking…" : status.online ? "Bot Online" : "Bot Offline";
  const dotClass = status === null ? "bg-slate-600 animate-pulse" : status.online ? "bg-emerald-400" : "bg-slate-500";
  const textClass = status === null ? "text-slate-500" : status.online ? "text-slate-300" : "text-slate-500";

  return (
    <div
      className="hidden sm:flex items-center gap-2 bg-base-900 border border-white/10 rounded-lg px-2.5 py-1.5"
      title={status?.lastHeartbeatAt ? `Last heartbeat: ${new Date(status.lastHeartbeatAt).toLocaleTimeString()}` : undefined}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
      <span className={`text-xs ${textClass}`}>{label}</span>
    </div>
  );
}
