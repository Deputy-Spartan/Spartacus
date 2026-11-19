"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useDashboardTexts } from "../ui/EditableText";
import { useEditMode } from "../../lib/editMode";

// Edit Mode for every page, without each page needing its own edit code.
//
// Words: the owner taps any words on a page and types new ones. The change is
// stored as "these words → those words" for that page, and applied to the
// page's text whenever it renders, so it survives reloads and data updates.
//
// Moving: the owner taps a box (a card, a section, a row) and drags it. The
// new order is applied with CSS `order`, so React's own tree is never moved
// around underneath it. Boxes inside a plain stacked section are lined up
// with flexbox first so they can be reordered too.
//
// Everything is saved per page as one DashboardText row ("edit.page.*"), so
// everyone sees it, on every device. Only <main> is edited; the menu has its
// own editor in the sidebar.

interface PageEdits {
  t?: Record<string, string>; // built-in words → the owner's words
  o?: Record<string, number[]>; // box path → its children, in the owner's order
  l?: Record<string, number[]>; // box path → its children that are locked in place
}

const SKIP = "[data-edit-skip], input, textarea, select, script, style, svg";
const rootEl = () => document.querySelector<HTMLElement>("main[data-edit-root]");

function pageKey(rel: string, section: string | null): string {
  const raw = `${rel || "home"}${section ? `-${section}` : ""}`;
  return `edit.page.${raw.replace(/^\/+/, "").replace(/[^a-z0-9._-]/gi, "-").slice(0, 100)}`;
}

function parse(raw: string | undefined): PageEdits {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as PageEdits;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function pathOf(root: Element, el: Element): number[] | null {
  const p: number[] = [];
  let cur: Element | null = el;
  while (cur && cur !== root) {
    const parent: Element | null = cur.parentElement;
    if (!parent) return null;
    p.unshift(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  return cur === root ? p : null;
}
function atPath(root: Element, path: number[]): Element | null {
  let el: Element | null = root;
  for (const i of path) el = el?.children[i] ?? null;
  return el;
}

// Remembers which text nodes we rewrote, and from what, so a reset or a new
// wording can find the built-in words again.
const applied = new WeakMap<Text, { orig: string; shown: string }>();

function applyText(root: Element, map: Record<string, string>) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n.parentElement?.closest(SKIP)) continue;
    const raw = n.nodeValue ?? "";
    const now = raw.trim();
    if (!now) continue;
    const rec = applied.get(n);
    const base = rec && rec.shown === now ? rec.orig : now;
    const want = map[base];
    const target = want ?? base;
    if (target !== now) n.nodeValue = raw.replace(now, target);
    if (want !== undefined) applied.set(n, { orig: base, shown: want });
    else applied.delete(n);
  }
}

function applyOrder(root: Element, orders: Record<string, number[]>) {
  for (const [key, order] of Object.entries(orders)) {
    const box = atPath(root, key.split(".").filter(Boolean).map(Number));
    if (!box) continue;
    const kids = Array.from(box.children) as HTMLElement[];
    if (!getComputedStyle(box).display.match(/flex|grid/)) {
      (box as HTMLElement).style.display = "flex";
      (box as HTMLElement).style.flexDirection = "column";
    }
    kids.forEach((k, i) => {
      const pos = order.indexOf(i);
      k.style.order = String(pos >= 0 ? pos : order.length + i);
    });
  }
}

// The box a tap is in: the nearest thing big enough to be a card or section
// that sits in a list of two or more siblings.
// Prefers a box that's one of a set of look-alikes (a card among cards, a row
// among rows) or sits in a grid, over a single line inside a card.
function movableFrom(el: Element | null, root: Element): HTMLElement | null {
  const first = movableStep(el, root);
  for (let c = first; c; c = c.parentElement ? movableStep(c.parentElement, root) : null) {
    const parent = c.parentElement;
    if (!parent) break;
    const alike = Array.from(parent.children).filter((s) => s !== c && s.tagName === c.tagName && s.className === c.className).length;
    if (alike >= 1 || getComputedStyle(parent).display.includes("grid")) return c;
  }
  return first;
}

function movableStep(el: Element | null, root: Element): HTMLElement | null {
  while (el && el !== root) {
    const parent: HTMLElement | null = el.parentElement;
    if (!parent) return null;
    const r = el.getBoundingClientRect();
    // Skip see-through layers laid over a card (like a card's full-size
    // link): moving those changes nothing you can see.
    const pos = getComputedStyle(el).position;
    const inFlow = pos !== "absolute" && pos !== "fixed";
    const flowSiblings = Array.from(parent.children).filter((c) => !/absolute|fixed/.test(getComputedStyle(c).position)).length;
    if (inFlow && flowSiblings >= 2 && r.height >= 36 && r.width >= 80) return el as HTMLElement;
    el = parent;
  }
  return null;
}

// Every card on the page: the boxes laid out in a grid. While editing, each
// one gets its own Move and Lock buttons, so nothing has to be found first.
function findCards(root: Element): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (el.closest(SKIP)) continue;
    if (!getComputedStyle(el).display.includes("grid")) continue;
    const kids = (Array.from(el.children) as HTMLElement[]).filter((k) => !/absolute|fixed/.test(getComputedStyle(k).position));
    if (kids.length < 2) continue;
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      if (r.width >= 120 && r.height >= 48) out.push(k);
    }
    if (out.length > 150) break;
  }
  return out;
}

// The words under the finger, found by where text is drawn, so it still works
// where a see-through link sits over the text (the group page cards).
function textNodeAt(x: number, y: number, root: Element): Text | null {
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!(n.nodeValue ?? "").trim() || n.parentElement?.closest(SKIP)) continue;
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) {
      if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) return n;
    }
  }
  return null;
}

export function PageEditor() {
  const { owner, texts, save } = useDashboardTexts();
  const { editing, setEditing } = useEditMode();
  const pathname = usePathname();
  const section = useSearchParams().get("section");
  const rel = pathname.replace(/^\/dashboard\/[^/]+/, "");
  const key = pageKey(rel, section);
  const edits = useMemo(() => parse(texts[key]), [texts, key]);
  const editsRef = useRef(edits);
  editsRef.current = edits;

  // Apply the saved words and order now, and again whenever the page changes.
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      const root = rootEl();
      if (!root) return;
      applyText(root, editsRef.current.t ?? {});
      applyOrder(root, editsRef.current.o ?? {});
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    run();
    const root = rootEl();
    if (!root) return;
    const obs = new MutationObserver(later);
    obs.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
      obs.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [edits, pathname]);

  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const persist = useCallback(
    async (next: PageEdits) => {
      setStatus("saving");
      const empty = !Object.keys(next.t ?? {}).length && !Object.keys(next.o ?? {}).length && !Object.keys(next.l ?? {}).length;
      try {
        await save(key, empty ? "" : JSON.stringify(next));
        setStatus("saved");
        setTimeout(() => setStatus((s) => (s === "saved" ? "" : s)), 1800);
      } catch {
        setStatus("error");
      }
    },
    [key, save]
  );

  // What's selected: the words tapped, and the box they're in.
  const [word, setWord] = useState<{ node: Text; orig: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!editing) {
      setWord(null);
      setBox(null);
    }
  }, [editing]);
  useEffect(() => {
    setWord(null);
    setBox(null);
  }, [pathname, section]);

  // Taps on the page select instead of clicking, while editing.
  useEffect(() => {
    if (!editing || !owner) return;
    function onClick(e: MouseEvent) {
      // The click that ends a drag of a card isn't a tap on it.
      if (suppressClick.current) {
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const root = rootEl();
      const t = e.target as Element | null;
      if (!root || !t || !root.contains(t) || t.closest("[data-edit-skip]")) return;
      if (t.closest("input, textarea, select")) return;
      e.preventDefault();
      e.stopPropagation();
      const node = textNodeAt(e.clientX, e.clientY, root);
      if (node) {
        const now = (node.nodeValue ?? "").trim();
        const rec = applied.get(node);
        const orig = rec && rec.shown === now ? rec.orig : now;
        setWord({ node, orig });
        setDraft(now);
      } else setWord(null);
      setBox(movableFrom(node?.parentElement ?? t, root));
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [editing, owner]);

  // Keep the outline and handle on the selected box, and the 🔒 on every
  // locked box, as the page scrolls. Only while editing.
  const [lockRects, setLockRects] = useState<DOMRect[]>([]);
  const [cards, setCards] = useState<HTMLElement[]>([]);
  const [cardRects, setCardRects] = useState<DOMRect[]>([]);
  const cardsRef = useRef<HTMLElement[]>([]);
  cardsRef.current = cards;

  // Find the cards when editing starts, and again when the page changes.
  useEffect(() => {
    if (!editing || !owner) {
      setCards([]);
      return;
    }
    let t: ReturnType<typeof setTimeout> | undefined;
    // Each card gets a strip of room along its bottom for the edit controls,
    // so they never cover what's on the card. Put back when editing ends.
    const restore = (keep: HTMLElement[] = []) => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-edit-pad]"))) {
        if (keep.includes(el)) continue;
        const was = el.dataset.editPad;
        el.style.paddingBottom = was === "-" ? "" : (was ?? "");
        delete el.dataset.editPad;
      }
    };
    const scan = () => {
      const root = rootEl();
      const found = root ? findCards(root) : [];
      restore(found);
      for (const c of found) {
        if (c.dataset.editPad) continue;
        c.dataset.editPad = c.style.paddingBottom || "-";
        c.style.paddingBottom = `${parseFloat(getComputedStyle(c).paddingBottom) + 40}px`;
      }
      setCards(found);
    };
    scan();
    const root = rootEl();
    if (!root) return;
    const obs = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(scan, 400);
    });
    obs.observe(root, { subtree: true, childList: true });
    return () => {
      obs.disconnect();
      clearTimeout(t);
      restore();
    };
  }, [editing, owner, pathname, section]);
  useEffect(() => {
    if (!editing || !owner) {
      setRect(null);
      setLockRects([]);
      return;
    }
    let f = 0;
    const tick = () => {
      setRect(box && box.isConnected ? box.getBoundingClientRect() : null);
      const root = rootEl();
      const rects: DOMRect[] = [];
      if (root) {
        for (const [k, idxs] of Object.entries(editsRef.current.l ?? {})) {
          const parent = atPath(root, k.split(".").filter(Boolean).map(Number));
          for (const i of idxs) {
            const c = parent?.children[i];
            if (c && !cardsRef.current.includes(c as HTMLElement)) rects.push(c.getBoundingClientRect());
          }
        }
      }
      setLockRects((prev) =>
        prev.length === rects.length && prev.every((p, i) => p.left === rects[i].left && p.top === rects[i].top) ? prev : rects
      );
      const cr = cardsRef.current.map((c) => c.getBoundingClientRect());
      setCardRects((prev) => (prev.length === cr.length && prev.every((p, i) => p.left === cr[i].left && p.top === cr[i].top) ? prev : cr));
      f = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(f);
  }, [box, editing, owner]);

  // Where a box sits, for locking it.
  function spotOf(el: HTMLElement | null) {
    const root = typeof document !== "undefined" ? rootEl() : null;
    const parent = el?.parentElement;
    if (!el || !root || !parent) return null;
    const path = pathOf(root, parent);
    if (!path) return null;
    const key = path.join(".");
    const idx = Array.prototype.indexOf.call(parent.children, el) as number;
    return { key, idx, locked: ((edits.l ?? {})[key] ?? []).includes(idx) };
  }
  const boxSpot = spotOf(box);
  function toggleLock(el: HTMLElement | null) {
    const boxSpot = spotOf(el);
    if (!boxSpot) return;
    const l = { ...(edits.l ?? {}) };
    const cur = new Set(l[boxSpot.key] ?? []);
    if (boxSpot.locked) cur.delete(boxSpot.idx);
    else cur.add(boxSpot.idx);
    if (cur.size) l[boxSpot.key] = [...cur];
    else delete l[boxSpot.key];
    void persist({ ...edits, l });
  }

  function commitWords() {
    if (!word) return;
    const v = draft.replace(/\s+/g, " ").trim();
    const t = { ...(edits.t ?? {}) };
    if (!v || v === word.orig) delete t[word.orig];
    else t[word.orig] = v.slice(0, 500);
    if ((edits.t ?? {})[word.orig] === t[word.orig]) return;
    void persist({ ...edits, t });
  }
  function resetWords() {
    if (!word) return;
    setDraft(word.orig);
    const t = { ...(edits.t ?? {}) };
    delete t[word.orig];
    void persist({ ...edits, t });
  }

  // Dragging a box among its siblings.
  function startDrag(e: { preventDefault: () => void }, box: HTMLElement | null) {
    const root = rootEl();
    if (!box || !root) return;
    const parent = box.parentElement;
    if (!parent) return;
    e.preventDefault();
    const kids = Array.from(parent.children) as HTMLElement[];
    if (!getComputedStyle(parent).display.match(/flex|grid/)) {
      parent.style.display = "flex";
      parent.style.flexDirection = "column";
    }
    const visual = () => [...kids].sort((a, b) => (Number(a.style.order) || 0) - (Number(b.style.order) || 0) || kids.indexOf(a) - kids.indexOf(b));
    let list = visual();
    list.forEach((k, i) => (k.style.order = String(i)));
    // Locked boxes keep their spot; the others flow around them.
    const pkey = pathOf(root, parent)?.join(".") ?? "";
    const lockedIdx = new Set((edits.l ?? {})[pkey] ?? []);
    const isLocked = (k: HTMLElement) => lockedIdx.has(kids.indexOf(k));
    if (isLocked(box)) return;

    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      let best: HTMLElement | null = null;
      let bestD = Infinity;
      for (const k of list) {
        if (k === box || isLocked(k)) continue;
        const r = k.getBoundingClientRect();
        const d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      const me = box.getBoundingClientRect();
      const meD = Math.hypot(ev.clientX - (me.left + me.width / 2), ev.clientY - (me.top + me.height / 2));
      if (!best || meD <= bestD) return;
      let free = list.filter((k) => !isLocked(k));
      const to = free.indexOf(best);
      free = free.filter((k) => k !== box);
      free.splice(to, 0, box);
      list = list.map((k) => (isLocked(k) ? k : (free.shift() as HTMLElement)));
      list.forEach((k, i) => (k.style.order = String(i)));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const path = pathOf(root, parent);
      if (!path) return;
      const order = list.map((k) => kids.indexOf(k));
      const o = { ...(edits.o ?? {}), [path.join(".")]: order };
      void persist({ ...edits, o });
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  // Grab a card itself to move it: with a mouse, press and drag; on a phone,
  // press and hold for a moment, then drag (a quick swipe still scrolls).
  const suppressClick = useRef(false);
  const startDragRef = useRef(startDrag);
  startDragRef.current = startDrag;
  const editsL = edits.l;
  useEffect(() => {
    if (!editing || !owner) return;
    const root = rootEl();
    if (!root) return;
    let pending: { card: HTMLElement; x: number; y: number; mouse: boolean; timer?: ReturnType<typeof setTimeout> } | null = null;
    let dragging = false;
    const isLockedCard = (card: HTMLElement) => {
      const parent = card.parentElement;
      const path = parent && pathOf(root, parent);
      if (!parent || !path) return false;
      return ((editsL ?? {})[path.join(".")] ?? []).includes(Array.prototype.indexOf.call(parent.children, card) as number);
    };
    const begin = () => {
      if (!pending) return;
      const card = pending.card;
      clearTimeout(pending.timer);
      pending = null;
      if (isLockedCard(card)) return;
      dragging = true;
      setBox(card);
      startDragRef.current({ preventDefault: () => {} }, card);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || e.button !== 0 || t.closest("[data-edit-skip], input, textarea, select")) return;
      const card = cardsRef.current.find((c) => c.contains(t));
      if (!card) return;
      pending = { card, x: e.clientX, y: e.clientY, mouse: e.pointerType === "mouse" };
      if (pending.mouse) e.preventDefault(); // no text selection or link drag
      if (!pending.mouse) pending.timer = setTimeout(begin, 350);
    };
    const onMove = (e: PointerEvent) => {
      if (!pending) return;
      const far = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
      if (pending.mouse && far > 6) begin();
      else if (!pending.mouse && far > 10) {
        clearTimeout(pending.timer); // a swipe: let the page scroll
        pending = null;
      }
    };
    const onUp = () => {
      if (pending) clearTimeout(pending.timer);
      pending = null;
      if (dragging) {
        dragging = false;
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 400);
      }
    };
    // Once a held card is being dragged, the page mustn't scroll under it.
    const onTouchMove = (e: TouchEvent) => {
      if (dragging) e.preventDefault();
    };
    // Pressing on a card's link and moving starts the browser's own "drag this
    // link" instead, which cancels ours. Not while editing.
    const noNativeDrag = (e: DragEvent) => {
      if (root.contains(e.target as Node)) e.preventDefault();
    };
    document.addEventListener("dragstart", noNativeDrag, true);
    const noMenu = (e: Event) => {
      if (cardsRef.current.some((c) => c.contains(e.target as Node))) e.preventDefault();
    };
    root.style.userSelect = "none";
    root.style.setProperty("-webkit-user-select", "none");
    root.style.setProperty("-webkit-touch-callout", "none");
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("contextmenu", noMenu);
    return () => {
      root.style.userSelect = "";
      root.style.removeProperty("-webkit-user-select");
      root.style.removeProperty("-webkit-touch-callout");
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("touchmove", onTouchMove, { capture: false } as EventListenerOptions);
      document.removeEventListener("contextmenu", noMenu);
      document.removeEventListener("dragstart", noNativeDrag, true);
    };
  }, [editing, owner, editsL]);

  const [armReset, setArmReset] = useState(false);
  function resetPage() {
    if (!armReset) return setArmReset(true);
    setArmReset(false);
    const root = rootEl();
    if (root) {
      for (const k of Object.keys(edits.o ?? {})) {
        const b = atPath(root, k.split(".").filter(Boolean).map(Number)) as HTMLElement | null;
        if (!b) continue;
        b.style.display = "";
        b.style.flexDirection = "";
        for (const c of Array.from(b.children) as HTMLElement[]) c.style.order = "";
      }
    }
    setWord(null);
    setBox(null);
    void persist({});
  }

  if (!owner || !editing) return null;

  return (
    <>
      {/* Every card while editing: a dashed outline (solid blue when locked),
          and one small lock button tucked into its bottom-right corner. The
          card itself is what you drag. */}
      {cards.map((card, i) => {
        const r = cardRects[i];
        if (!r || r.bottom < 0 || r.top > window.innerHeight) return null;
        const spot = spotOf(card);
        const locked = !!spot?.locked;
        const selected = card === box;
        return (
          <div
            key={i}
            data-edit-skip
            className={`fixed z-40 pointer-events-none rounded-xl border-2 ${
              selected ? "border-amber-400" : locked ? "border-sky-400/70" : "border-dashed border-amber-400/30"
            }`}
            style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
          >
            {/* The edit strip, in the room added along the card's bottom. */}
            <div
              className={`absolute inset-x-0 bottom-0 h-10 flex items-center justify-between gap-2 px-3 rounded-b-[10px] border-t border-dashed pointer-events-auto ${
                locked ? "border-sky-400/40 bg-sky-400/10" : "border-amber-400/25 bg-amber-400/[0.06]"
              }`}
            >
              {locked ? (
                <span className="text-xs font-semibold text-sky-300">🔒 Locked in place</span>
              ) : (
                <button
                  type="button"
                  onPointerDown={(e) => {
                    setBox(card);
                    startDrag(e, card);
                  }}
                  style={{ touchAction: "none" }}
                  className="h-7 px-2 -ml-1 rounded-md text-xs font-semibold text-amber-200 hover:bg-amber-400/10 cursor-grab active:cursor-grabbing"
                  aria-label="Drag to move this card"
                >
                  ⠿ Drag to move
                </button>
              )}
              <button
                type="button"
                onClick={() => toggleLock(card)}
                className={`h-7 px-2.5 rounded-md text-xs font-semibold border ${
                  locked ? "border-sky-400/50 text-sky-200 hover:bg-sky-400/15" : "border-white/10 text-slate-300 hover:border-sky-400/50 hover:text-sky-200"
                }`}
                title={locked ? "Let this card move again" : "Keep this card here when others move"}
              >
                {locked ? "Unlock" : "🔓 Lock"}
              </button>
            </div>
          </div>
        );
      })}

      {/* Any other box you tap (a section, a row): an outline and a small bar
          above it to move or lock it. */}
      {rect && box && !cards.includes(box) && (
        <>
          <div data-edit-skip className="fixed z-40 pointer-events-none rounded-xl border-2 border-amber-400" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
          <div
            data-edit-skip
            className="fixed z-50 flex items-center gap-1 rounded-lg border border-amber-400/40 bg-[#1f1c14] p-1 shadow-lg"
            style={{ left: rect.left + 8, top: Math.max(4, rect.top - 40) }}
          >
            {!boxSpot?.locked && (
              <button
                type="button"
                onPointerDown={(e) => startDrag(e, box)}
                style={{ touchAction: "none" }}
                className="h-7 px-2 rounded-md text-xs font-semibold text-amber-200 hover:bg-amber-400/10 cursor-grab active:cursor-grabbing"
                aria-label="Drag to move this box"
              >
                ⠿ Drag to move
              </button>
            )}
            {boxSpot && (
              <button
                type="button"
                onClick={() => toggleLock(box)}
                className={`h-7 px-2 rounded-md text-xs font-semibold ${boxSpot.locked ? "bg-sky-400 text-base-950" : "text-sky-300 hover:bg-sky-400/10"}`}
              >
                {boxSpot.locked ? "🔒 Locked" : "🔓 Lock"}
              </button>
            )}
          </div>
        </>
      )}
      {/* Other locked boxes (not cards) keep a thin blue outline. */}
      {lockRects.map((r, i) => (
        <span
          key={`l${i}`}
          data-edit-skip
          aria-hidden="true"
          className="fixed z-30 pointer-events-none rounded-xl border-2 border-sky-400/60"
          style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
        />
      ))}

      <div
        data-edit-skip
        className="fixed z-50 left-2 right-2 md:left-auto md:right-4 md:w-[26rem] bottom-[calc(7.5rem+env(safe-area-inset-bottom))] md:bottom-4 rounded-xl border border-amber-400/40 bg-[#1f1c14] text-amber-50 shadow-2xl p-3 space-y-2 text-sm"
      >
        <div className="flex items-center gap-2">
          <b className="text-amber-300">Editing this page</b>
          <span role="status" className="ml-auto text-xs">
            {status === "saving" && <span className="text-slate-400">Saving…</span>}
            {status === "saved" && <span className="text-emerald-400 font-semibold">✓ Saved</span>}
            {status === "error" && <span className="text-rose-400">Didn&apos;t save, try again</span>}
          </span>
          <button type="button" onClick={() => setEditing(false)} className="rounded-md bg-amber-400 text-base-950 font-semibold px-3 py-1">
            Done
          </button>
        </div>
        {!word && !box && <p className="text-amber-100/80">Tap any words to change them. Drag a card to move it (on a phone, hold it first). Tap 🔓 on a card to lock it in place. To move something that isn't a card, tap it first.</p>}
        {word && (
          <div className="space-y-1.5">
            <textarea
              value={draft}
              rows={2}
              maxLength={500}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitWords}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
              }}
              aria-label="New words"
              className="block w-full resize-none rounded-md border border-amber-400/40 bg-black/30 px-2 py-1.5 text-slate-100 focus:outline-none focus:border-amber-400"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-100/70">
              <span>Saves when you tap away or press Enter.</span>
              {draft.trim() !== word.orig && (
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={resetWords} className="underline hover:text-amber-300">
                  Back to &ldquo;{word.orig.length > 30 ? `${word.orig.slice(0, 30)}…` : word.orig}&rdquo;
                </button>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {box && (
            <button
              type="button"
              onClick={() => {
                const root = rootEl();
                const up = box.parentElement && root ? movableStep(box.parentElement, root) : null;
                if (up) setBox(up);
              }}
              className="rounded-md border border-amber-400/40 px-2.5 py-1 hover:bg-amber-400/10"
            >
              Pick the bigger box
            </button>
          )}
          {(edits.t || edits.o || edits.l) && (
            <button type="button" onClick={resetPage} onBlur={() => setArmReset(false)} className="ml-auto rounded-md border border-amber-400/40 px-2.5 py-1 hover:bg-amber-400/10">
              {armReset ? "Tap again to undo all" : "Undo all changes on this page"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
