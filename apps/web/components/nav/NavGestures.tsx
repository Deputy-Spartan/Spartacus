"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { navSectionForPath } from "@spartacus/shared";
import { useNavLayout } from "../../lib/navLayout";
import { useEditMode } from "../../lib/editMode";

// Faster ways around the dashboard:
// - Phone: swipe left or right on a page to go to the next or previous page
//   in its group (the tabs along the top).
// - Computer: keyboard shortcuts. G then a group's first letter opens that
//   group (G then S for Security), [ and ] step through a group's pages,
//   / searches, and ? shows the list.
// Both are off while Edit Mode is on, so they never fight with dragging.

const isTyping = (t: EventTarget | null) => !!(t as Element | null)?.closest?.("input, textarea, select, [contenteditable=true], [role=dialog]");

export function NavGestures({ guildId }: { guildId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const section = useSearchParams().get("section");
  const { sections } = useNavLayout();
  const { editing } = useEditMode();
  const [help, setHelp] = useState(false);
  const base = `/dashboard/${guildId}`;
  const rel = pathname.startsWith(base) ? pathname.slice(base.length) : "";

  // The pages of the group you're in, in your order, without hidden ones.
  const group = useMemo(() => {
    const hub = navSectionForPath(rel);
    const laid = hub ? sections.find((s) => s.key === hub.section) : undefined;
    if (!laid) return null;
    const items = laid.items.filter((i) => !i.hidden || rel === i.href || rel.startsWith(`${i.href}/`));
    const at = items.findIndex((i) => rel === i.href || rel.startsWith(`${i.href}/`));
    return at < 0 ? null : { items, at };
  }, [rel, sections]);
  const groupRef = useRef(group);
  groupRef.current = group;

  const step = (dir: 1 | -1) => {
    const g = groupRef.current;
    if (!g) return;
    const next = g.items[g.at + dir];
    if (next) router.push(`${base}${next.href}`);
  };

  // Swipe between a group's pages (phones and tablets).
  useEffect(() => {
    if (editing) return;
    const main = document.querySelector<HTMLElement>("main[data-edit-root]");
    if (!main) return;
    let start: { x: number; y: number; t: number; ok: boolean } | null = null;
    const scrollsSideways = (el: Element | null) => {
      for (let e = el; e && e !== main; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 2) return true;
      }
      return false;
    };
    const down = (e: TouchEvent) => {
      if (e.touches.length !== 1) return (start = null);
      const t = e.touches[0];
      const target = e.target as Element;
      const ok = !isTyping(target) && !target.closest?.("input[type=range], [data-no-swipe]") && !scrollsSideways(target);
      start = { x: t.clientX, y: t.clientY, t: Date.now(), ok };
    };
    const up = (e: TouchEvent) => {
      const s = start;
      start = null;
      if (!s || !s.ok) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Date.now() - s.t > 700 || Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.5) return;
      step(dx < 0 ? 1 : -1);
    };
    main.addEventListener("touchstart", down, { passive: true });
    main.addEventListener("touchend", up, { passive: true });
    return () => {
      main.removeEventListener("touchstart", down);
      main.removeEventListener("touchend", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, guildId]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (editing) return;
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key;
      if (k === "Escape" && help) return setHelp(false);
      if (Date.now() - gAt < 1200) {
        gAt = 0;
        const low = k.toLowerCase();
        const place: Record<string, string> = { o: "", m: "/modules", e: "/errors", a: "/account?tab=profile" };
        if (low in place) {
          e.preventDefault();
          return router.push(`${base}${place[low]}`);
        }
        const g = sections.find((s) => !s.hidden && s.label.toLowerCase().startsWith(low));
        if (g) {
          e.preventDefault();
          router.push(`${base}/modules?section=${encodeURIComponent(g.key)}`);
        }
        return;
      }
      if (k === "g" || k === "G") return void (gAt = Date.now());
      if (k === "]") return step(1);
      if (k === "[") return step(-1);
      if (k === "/") {
        e.preventDefault();
        return void window.dispatchEvent(new CustomEvent("spartacus:open-command-palette"));
      }
      if (k === "?") {
        e.preventDefault();
        setHelp((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, help, sections, base]);

  // Close the list when the page changes.
  useEffect(() => setHelp(false), [pathname, section]);

  if (!help) return null;
  const row = (keys: string[], what: string, id = what) => (
    <li key={id} className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-slate-300">{what}</span>
      <span className="flex gap-1 shrink-0">
        {keys.map((x) => (
          <kbd key={x} className="min-w-[1.75rem] text-center rounded-md border border-white/15 bg-base-800 px-1.5 py-0.5 text-xs font-semibold">
            {x}
          </kbd>
        ))}
      </span>
    </li>
  );
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={() => setHelp(false)}>
      <div role="dialog" aria-label="Keyboard shortcuts" className="neon-card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold">Keyboard shortcuts</p>
          <button type="button" onClick={() => setHelp(false)} className="text-xs text-slate-400 hover:text-slate-200">
            Close
          </button>
        </div>
        <ul className="divide-y divide-white/5">
          {row(["G", "O"], "Overview")}
          {row(["G", "M"], "Modules")}
          {row(["G", "E"], "Errors")}
          {row(["G", "A"], "Your account")}
          {sections
            .filter((s) => !s.hidden)
            .map((s) => row(["G", s.label.charAt(0).toUpperCase()], `Open ${s.label}`, s.key))}
          {row(["["], "Previous page in this group")}
          {row(["]"], "Next page in this group")}
          {row(["/"], "Search")}
          {row(["?"], "Show or hide this list")}
        </ul>
        <p className="text-xs text-slate-500 mt-3">On a phone, swipe left or right on a page to move between the pages in its group.</p>
      </div>
    </div>
  );
}
