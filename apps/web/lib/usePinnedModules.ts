"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

// Which sidebar pages this account has pinned, per server — stored on the
// backend against the logged-in Discord user id, so it follows the account
// to any device, not just this browser.
//
// A tiny in-memory cache + event bus keeps the sidebar and the Modules grid
// (two separate hook instances, same tab) showing the same pins the instant
// either one changes something, without both re-fetching on every render.
const cache = new Map<string, string[]>();
const EVENT = "spartacus-pins-changed";

function dispatch(guildId: string, pinned: string[]) {
  cache.set(guildId, pinned);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { guildId, pinned } }));
}

export function usePinnedModules(guildId: string) {
  const [pinned, setPinned] = useState<string[]>(() => cache.get(guildId) ?? []);

  useEffect(() => {
    const cached = cache.get(guildId);
    if (cached) setPinned(cached);
    else api.getPinnedModules(guildId).then((rows) => dispatch(guildId, rows));

    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ guildId: string; pinned: string[] }>).detail;
      if (detail.guildId === guildId) setPinned(detail.pinned);
    }
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [guildId]);

  const isPinned = useCallback((href: string) => pinned.includes(href), [pinned]);

  const togglePin = useCallback(
    (href: string) => {
      const willPin = !pinned.includes(href);
      const optimistic = willPin ? [...pinned, href] : pinned.filter((h) => h !== href);
      dispatch(guildId, optimistic);
      api.setPinnedModule(guildId, href, willPin).then((rows) => dispatch(guildId, rows)).catch(() => dispatch(guildId, pinned)); // roll back on failure
    },
    [guildId, pinned]
  );

  return { pinned, isPinned, togglePin };
}
