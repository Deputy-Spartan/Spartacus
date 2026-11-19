"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// A list you reorder by dragging a handle, with a mouse or a finger. Built on
// pointer events because the browser's own drag and drop doesn't work on
// phones. The list moves as you drag; onReorder runs once, when you let go.

export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  style: React.CSSProperties;
  "aria-label": string;
  title: string;
}

export function DragList({
  ids,
  onReorder,
  renderItem,
  className,
  itemLabel,
}: {
  ids: string[];
  onReorder: (next: string[]) => void;
  renderItem: (id: string, handle: DragHandleProps, dragging: boolean) => ReactNode;
  className?: string;
  itemLabel: (id: string) => string;
}) {
  const [order, setOrder] = useState(ids);
  const [dragId, setDragId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());
  const orderRef = useRef(order);
  orderRef.current = order;

  // Follow outside changes (a save, a reset) while nothing is being dragged.
  const idsKey = ids.join("\n");
  useEffect(() => {
    if (!dragId) setOrder(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, dragId]);

  function start(id: string, e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    const scroller = handle.closest<HTMLElement>("[data-drag-scroll]");
    const startOrder = orderRef.current;
    setDragId(id);

    function move(ev: PointerEvent) {
      ev.preventDefault();
      const y = ev.clientY;
      // Keep scrolling when the finger is near the top or bottom edge.
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (y < r.top + 40) scroller.scrollTop -= 12;
        else if (y > r.bottom - 40) scroller.scrollTop += 12;
      }
      const others = orderRef.current.filter((x) => x !== id);
      let at = 0;
      for (const o of others) {
        const el = refs.current.get(o);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y > r.top + r.height / 2) at++;
      }
      const next = [...others.slice(0, at), id, ...others.slice(at)];
      if (next.join("\n") !== orderRef.current.join("\n")) setOrder(next);
    }
    function end() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragId(null);
      const final = orderRef.current;
      if (final.join("\n") !== startOrder.join("\n")) onReorder(final);
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return (
    <ul className={className}>
      {order.map((id) => (
        <li
          key={id}
          ref={(el) => {
            if (el) refs.current.set(id, el);
            else refs.current.delete(id);
          }}
          className={dragId === id ? "relative z-10 rounded-lg ring-2 ring-amber-400 bg-base-800 shadow-lg" : undefined}
        >
          {renderItem(
            id,
            {
              onPointerDown: (e) => start(id, e),
              // Keyboard: focus the handle and use the up and down arrows.
              onKeyDown: (e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                const i = order.indexOf(id);
                const j = i + (e.key === "ArrowUp" ? -1 : 1);
                if (j < 0 || j >= order.length) return;
                const next = [...order];
                [next[i], next[j]] = [next[j], next[i]];
                setOrder(next);
                onReorder(next);
              },
              // Stops the page scrolling instead of dragging on a phone.
              style: { touchAction: "none", cursor: dragId === id ? "grabbing" : "grab" },
              "aria-label": `Drag to move ${itemLabel(id)}`,
              title: "Drag to move",
            },
            dragId === id
          )}
        </li>
      ))}
    </ul>
  );
}
