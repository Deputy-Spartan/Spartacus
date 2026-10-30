"use client";

import { useEffect, useState } from "react";
import { api, type BotStatusRow } from "./api";

const POLL_MS = 10_000;
const REFRESH_EVENT = "spartacus:bot-status-changed";

// Call this right after saving the manual override so every badge/card on
// the page (each with its own independent poll timer) refetches immediately
// instead of waiting up to POLL_MS for the change to show up.
export function notifyBotStatusChanged() {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

// Polls the API's heartbeat-staleness check so the dashboard's status
// indicator reflects the real Discord gateway connection, not just whether
// the API process itself is up.
export function useBotStatus(): BotStatusRow | null {
  const [status, setStatus] = useState<BotStatusRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      api
        .getBotStatus()
        .then((s) => !cancelled && setStatus(s))
        .catch(
          () => !cancelled && setStatus({ online: false, updating: false, manual: false, message: null, lastHeartbeatAt: null, lastError: null })
        );
    }
    poll();
    const interval = setInterval(poll, POLL_MS);
    window.addEventListener(REFRESH_EVENT, poll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener(REFRESH_EVENT, poll);
    };
  }, []);

  return status;
}
