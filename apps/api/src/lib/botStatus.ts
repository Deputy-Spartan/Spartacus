import { prisma } from "@spartacus/db";

export type BotPhase = "online" | "updating" | "offline";

export interface EffectiveBotStatus {
  phase: BotPhase;
  manual: boolean; // true when an owner-set override (not the heartbeat) determined this
  message: string | null;
  lastHeartbeatAt: Date | null;
}

const STALE_AFTER_MS = 60_000;
const UPDATING_TIMEOUT_MS = 5 * 60_000;

// Single source of truth for "what is the bot's status right now", used by
// the /bot-status dashboard endpoint, the API's offline/updating watchdog,
// and (indirectly, via BotConfig) the bot's own status-channel poster job —
// so the manual override, the deploy flag, and the heartbeat never
// disagree about which one wins.
export async function getEffectiveBotStatus(): Promise<EffectiveBotStatus> {
  const config = await prisma.botConfig.findUnique({ where: { id: "singleton" } });

  // A manually-set override always wins — that's the entire point of
  // giving the owner a switch. It stays in effect until turned back to
  // "Auto", with no timeout of its own.
  if (config?.manualStatusOverride) {
    const phase: BotPhase =
      config.manualStatusOverride === "OFFLINE" ? "offline" : config.manualStatusOverride === "MAINTENANCE" ? "updating" : "online";
    return { phase, manual: true, message: config.manualStatusMessage ?? null, lastHeartbeatAt: config.lastHeartbeatAt ?? null };
  }

  const lastHeartbeatAt = config?.lastHeartbeatAt ?? null;
  const online = !!lastHeartbeatAt && Date.now() - lastHeartbeatAt.getTime() < STALE_AFTER_MS;
  const deployingSince = config?.deployingSince ?? null;
  const updating = !online && !!deployingSince && Date.now() - deployingSince.getTime() < UPDATING_TIMEOUT_MS;

  return { phase: online ? "online" : updating ? "updating" : "offline", manual: false, message: null, lastHeartbeatAt };
}
