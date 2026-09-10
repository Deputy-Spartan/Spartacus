"use client";

import { useEffect, useState } from "react";
import { api, type BotStatusRow } from "./api";

const POLL_MS = 15_000;

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
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}
