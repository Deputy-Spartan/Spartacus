"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { beginNavigation, onFresherData, pendingLoads, whenIdle } from "../../lib/apiCache";

const SHIMMER_AFTER = 150; // only show the shimmer if loading takes a moment
const GIVE_UP_AFTER = 5000; // show the page anyway if something never answers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Keeps a page hidden until the values it loads when it opens have arrived,
// so a switch never shows "off" for a moment before showing "on".
export function PageGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [reload, setReload] = useState(0);
  const key = `${pathname}#${reload}`;

  // A new page (or a reload of this one) starts a new "opening" window
  // before any of the page's own loads run.
  const lastKey = useRef<string | null>(null);
  const nav = useRef(0);
  const openedAt = useRef(0);
  if (lastKey.current !== key) {
    lastKey.current = key;
    nav.current = beginNavigation();
    openedAt.current = Date.now();
  }

  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [slowKey, setSlowKey] = useState<string | null>(null);
  const ready = readyKey === key;
  const touched = useRef(false);
  const reloadedPath = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    touched.current = false;
    const slow = setTimeout(() => alive && setSlowKey(key), SHIMMER_AFTER);
    const cap = setTimeout(() => alive && setReadyKey(key), GIVE_UP_AFTER);
    (async () => {
      // Pages often start another load when one finishes, so check twice.
      do {
        await sleep(0);
        await whenIdle();
        await sleep(40);
      } while (pendingLoads() > 0);
      if (alive) setReadyKey(key);
    })();
    return () => {
      alive = false;
      clearTimeout(slow);
      clearTimeout(cap);
    };
  }, [key]);

  // Newer data arrived for a page that showed remembered values: reload its
  // values once, unless you've already started using it.
  useEffect(
    () =>
      onFresherData((n) => {
        if (n !== nav.current || touched.current || reloadedPath.current === pathname) return;
        if (Date.now() - openedAt.current > 4000) return;
        reloadedPath.current = pathname;
        setReload((r) => r + 1);
      }),
    [pathname],
  );

  useEffect(() => {
    reloadedPath.current = null;
  }, [pathname]);

  const touch = () => {
    touched.current = true;
  };

  return (
    <div className="relative">
      <div key={key} style={ready ? undefined : { visibility: "hidden" }} aria-busy={!ready} onPointerDown={touch} onKeyDown={touch} onInput={touch}>
        {children}
      </div>
      {!ready && slowKey === key && <PageShimmer />}
    </div>
  );
}

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />;
}

function PageShimmer() {
  return (
    <div className="absolute inset-x-0 top-0 space-y-4" aria-label="Loading">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <Shimmer className="h-7 w-48" />
          <Shimmer className="h-4 w-full max-w-md" />
        </div>
        <Shimmer className="h-10 w-32" />
      </div>
      <Shimmer className="h-40 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Shimmer className="h-32" />
        <Shimmer className="h-32" />
      </div>
    </div>
  );
}
