"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

// Explanation text on the dashboard that the bot owner can reword in place.
// Everyone sees the saved wording; only the owner sees the ✏️ to change it.

interface TextsContext {
  owner: boolean;
  texts: Record<string, string>;
  ready: boolean; // the saved wording is known (from this device's copy or the server)
  save: (key: string, text: string) => Promise<void>;
}

const Ctx = createContext<TextsContext>({ owner: false, texts: {}, ready: true, save: async () => {} });

// The saved wording and the owner's save, for things built on the same store
// (the owner's menu layout in lib/navLayout.ts, page edits in edit/PageEditor).
export const useDashboardTexts = () => useContext(Ctx);

// A copy of the saved wording on this device, so a page opens with the
// owner's words and layout straight away instead of flashing the built-in
// ones while the server answers. The server's answer still replaces it.
const CACHE = "spartacus:dashboard-texts";
function readCache(): Record<string, string> | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CACHE) ?? "null");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : null;
  } catch {
    return null;
  }
}
function writeCache(t: Record<string, string>) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(t));
  } catch {
    /* private mode or full */
  }
}

export function DashboardTextProvider({ isOwner, children }: { isOwner: boolean; children: React.ReactNode }) {
  // Only mounted in the browser (the dashboard waits for its access check
  // first), so reading this device's copy here is safe.
  const [cached] = useState(() => (typeof window === "undefined" ? null : readCache()));
  const [texts, setTexts] = useState<Record<string, string>>(cached ?? {});
  const [ready, setReady] = useState(!!cached);

  useEffect(() => {
    api
      .getDashboardTexts()
      .then((t) => {
        setTexts(t);
        writeCache(t);
      })
      .catch(() => null)
      .finally(() => setReady(true));
    // Never keep the dashboard hidden for long if the server is slow.
    const t = setTimeout(() => setReady(true), 2500);
    return () => clearTimeout(t);
  }, []);

  async function save(key: string, text: string) {
    setTexts((prev) => {
      const next = { ...prev };
      if (text) next[key] = text;
      else delete next[key];
      writeCache(next);
      return next;
    });
    await api.setDashboardText(key, text);
  }

  return <Ctx.Provider value={{ owner: isOwner, texts, ready, save }}>{children}</Ctx.Provider>;
}

// On a device that has never loaded the saved wording, keeps the dashboard
// out of sight for the moment it takes to arrive, so the built-in words never
// show first. Everywhere else this shows straight away.
export function WhenTextsReady({ children }: { children: React.ReactNode }) {
  const { ready } = useContext(Ctx);
  return <div style={{ display: "contents", visibility: ready ? undefined : "hidden" }}>{children}</div>;
}

// `children` is the built-in wording, used until the owner saves their own.
// Saving the built-in wording again (or Reset) goes back to following it.
export function EditableText({ id, children: original, className }: { id: string; children: string; className?: string }) {
  const { owner, texts, save } = useContext(Ctx);
  const text = texts[id] ?? original;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [status, setStatus] = useState<"" | "saved" | "error">("");
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing || !box.current) return;
    box.current.style.height = "auto";
    box.current.style.height = `${box.current.scrollHeight}px`;
  }, [editing, draft]);

  if (!owner) return <span className={className}>{text}</span>;

  async function commit(value: string) {
    setEditing(false);
    const next = value.trim();
    if (next === text) return;
    try {
      await save(id, !next || next === original ? "" : next);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus(""), 2000);
  }

  if (editing) {
    return (
      <span className="block my-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <textarea
          ref={box}
          autoFocus
          rows={1}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit(draft);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          aria-label="Edit this text"
          className="block w-full resize-none overflow-hidden rounded-md border border-neon-blue/50 bg-base-950 px-2 py-1 text-xs text-slate-200 normal-case tracking-normal font-normal"
        />
        <span className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500 normal-case tracking-normal font-normal">
          <span>Enter or click away to save · Esc to cancel · Everyone sees this</span>
          {texts[id] !== undefined && (
            <button
              type="button"
              // mousedown, so it runs before the box loses focus and saves
              onMouseDown={(e) => {
                e.preventDefault();
                setDraft(original);
                commit(original);
              }}
              className="text-slate-400 hover:text-neon-blue"
            >
              Reset to original
            </button>
          )}
        </span>
      </span>
    );
  }

  return (
    <span className={className}>
      {text}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setDraft(text);
          setEditing(true);
        }}
        aria-label="Edit this text"
        title="Edit this text (only you see this pencil)"
        className="ml-1.5 inline-block align-baseline text-[0.85em] opacity-40 hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        ✏️
      </button>
      {status === "saved" && <span className="ml-1.5 text-[0.85em] text-emerald-400">Saved</span>}
      {status === "error" && <span className="ml-1.5 text-[0.85em] text-rose-400">Didn't save, try again</span>}
    </span>
  );
}
