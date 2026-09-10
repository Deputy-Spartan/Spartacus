"use client";

import { useBotStatus } from "../../lib/useBotStatus";

// Small pill in the top header showing whether the bot's Discord
// connection is actually up right now, not just whether the dashboard
// loaded — see apps/web/lib/useBotStatus.ts for how that's determined.
export function BotStatusBadge() {
  const status = useBotStatus();

  const phase = status === null ? "checking" : status.updating ? "updating" : status.online ? "online" : "offline";

  const shortLabel = { checking: "…", updating: "Updating", online: "Online", offline: "Offline" }[phase];
  const label = { checking: "Checking…", updating: "Bot Updating", online: "Bot Online", offline: "Bot Offline" }[phase];
  const dotClass = {
    checking: "bg-slate-600 animate-pulse",
    updating: "bg-amber-400 animate-pulse",
    online: "bg-emerald-400",
    offline: "bg-slate-500",
  }[phase];
  const textClass = { checking: "text-slate-500", updating: "text-amber-400", online: "text-slate-300", offline: "text-slate-500" }[phase];

  const title =
    phase === "offline" && status?.lastError
      ? `Last error: ${status.lastError.message} — see the Errors page for details`
      : status?.lastHeartbeatAt
        ? `Last heartbeat: ${new Date(status.lastHeartbeatAt).toLocaleTimeString()}`
        : undefined;

  return (
    <div className="flex items-center gap-2 bg-base-900 border border-white/10 rounded-lg px-2.5 py-1.5" title={title}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
      <span className={`text-xs ${textClass} sm:hidden`}>{shortLabel}</span>
      <span className={`text-xs ${textClass} hidden sm:inline`}>{label}</span>
    </div>
  );
}
