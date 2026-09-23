"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

// Global — the changelog itself isn't scoped to a server, so "how many
// posts have I not seen yet" is one number for the account, shown as the
// bell badge in the top bar regardless of which server's dashboard is open.
export function useChangelogUnseenCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api.getChangelogUnseenCount().then((r) => {
        if (!cancelled) setCount(r.count);
      });
    }
    load();
    const interval = setInterval(load, 60_000);
    window.addEventListener("spartacus:changelog-seen", load);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("spartacus:changelog-seen", load);
    };
  }, []);

  return count;
}
