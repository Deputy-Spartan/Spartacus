"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

// Explanation text on the dashboard that the bot owner can reword in place.
// Everyone sees the saved wording; only the owner sees the ✏️ to change it.

interface TextsContext {
  owner: boolean;
  texts: Record<string, string>;
  save: (key: string, text: string) => Promise<void>;
}

const Ctx = createContext<TextsContext>({ owner: false, texts: {}, save: async () => {} });

export function DashboardTextProvider({ isOwner, children }: { isOwner: boolean; children: React.ReactNode }) {
  const [texts, setTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getDashboardTexts().then(setTexts).catch(() => null);
  }, []);

  async function save(key: string, text: string) {
    setTexts((prev) => {
      const next = { ...prev };
      if (text) next[key] = text;
      else delete next[key];
      return next;
    });
    await api.setDashboardText(key, text);
  }

  return <Ctx.Provider value={{ owner: isOwner, texts, save }}>{children}</Ctx.Provider>;
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
