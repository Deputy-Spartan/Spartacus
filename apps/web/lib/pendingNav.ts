"use client";

import { useSyncExternalStore } from "react";

// The menu button you just tapped, while its page is still opening. Menu
// buttons treat it as the open page, so the button stays pressed in from the
// tap until the page shows, instead of popping back up in between.
let pending: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setPendingNav(href: string | null) {
  if (pending === href) return;
  pending = href;
  if (timer) clearTimeout(timer);
  // Never stuck: if the page somehow never opens, let go after a while.
  if (href) timer = setTimeout(() => setPendingNav(null), 15000);
  emit();
}

// For a link's onClick: ignores Ctrl/Cmd/middle clicks, which open a new tab.
export function pressNav(e: React.MouseEvent, href: string) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  setPendingNav(href);
}

export function usePendingNav(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => pending,
    () => null,
  );
}
