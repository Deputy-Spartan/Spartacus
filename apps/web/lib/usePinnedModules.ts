"use client";

import { useCallback, useEffect, useState } from "react";

// Which sidebar pages this browser has pinned, per server. A per-viewer
// convenience (like a remembered tab), so it's plain localStorage — never
// synced, never read back by Claude, and safe to come back empty (private
// window, cleared site data, etc).
function storageKey(guildId: string): string {
  return `spartacus-pinned:${guildId}`;
}

function read(guildId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(guildId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// localStorage's own "storage" event only fires in OTHER tabs, not the one
// that wrote it — this custom event is how the sidebar and the Modules grid
// (different components, same tab) stay in sync when a pin toggles.
const EVENT = "spartacus-pins-changed";

export function usePinnedModules(guildId: string) {
  const [pinned, setPinned] = useState<string[]>([]);

  useEffect(() => {
    setPinned(read(guildId));
    function onChange() {
      setPinned(read(guildId));
    }
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [guildId]);

  const isPinned = useCallback((href: string) => pinned.includes(href), [pinned]);

  const togglePin = useCallback(
    (href: string) => {
      const next = pinned.includes(href) ? pinned.filter((h) => h !== href) : [...pinned, href];
      try {
        localStorage.setItem(storageKey(guildId), JSON.stringify(next));
      } catch {
        /* private window / storage blocked — pin just won't survive a reload */
      }
      setPinned(next);
      window.dispatchEvent(new Event(EVENT));
    },
    [guildId, pinned]
  );

  return { pinned, isPinned, togglePin };
}
