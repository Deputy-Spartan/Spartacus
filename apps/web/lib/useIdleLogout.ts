"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { clearToken } from "./api";

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

// Someone walking away from an unlocked laptop with the dashboard open is
// the scenario this covers — the 24h token expiry (see apps/api's
// auth.ts) doesn't help with that, since it's about elapsed time, not
// inactivity. Mounted once at the dashboard layout level.
export function useIdleLogout() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        clearToken();
        router.replace("/?idle=1");
      }, IDLE_LIMIT_MS);
    }

    reset();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [router]);
}
