"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;
type PromptFn = (message: string, defaultValue?: string, options?: PromptOptions) => Promise<string | null>;

const ConfirmContext = createContext<ConfirmFn | null>(null);
const PromptContext = createContext<PromptFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}

export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error("usePrompt must be used within a ConfirmProvider");
  return ctx;
}

interface PendingConfirm extends ConfirmOptions {
  kind: "confirm";
  message: string;
  resolve: (value: boolean) => void;
}

interface PendingPrompt extends PromptOptions {
  kind: "prompt";
  message: string;
  value: string;
  resolve: (value: string | null) => void;
}

// Drop-in themed replacement for window.confirm()/window.prompt() — every
// destructive action or free-text input across the dashboard routes through
// this instead of the browser's unstylable native dialogs. Mounted once at
// the dashboard layout root.
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | PendingPrompt | null>(null);

  const confirm = useCallback<ConfirmFn>((message, options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ kind: "confirm", message, resolve, ...options });
    });
  }, []);

  const prompt = useCallback<PromptFn>((message, defaultValue = "", options) => {
    return new Promise<string | null>((resolve) => {
      setPending({ kind: "prompt", message, value: defaultValue, resolve, ...options });
    });
  }, []);

  function settleConfirm(value: boolean) {
    if (pending?.kind === "confirm") pending.resolve(value);
    setPending(null);
  }

  function settlePrompt(value: string | null) {
    if (pending?.kind === "prompt") pending.resolve(value);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      <PromptContext.Provider value={prompt}>
        {children}
        {pending && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60"
            onClick={() => (pending.kind === "confirm" ? settleConfirm(false) : settlePrompt(null))}
          >
            <div className="w-full max-w-sm bg-base-900 border border-white/10 rounded-xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-semibold text-slate-200 mb-2">
                {pending.title ?? (pending.kind === "confirm" ? "Are you sure?" : "")}
              </p>
              <p className="text-sm text-slate-400 mb-4">{pending.message}</p>

              {pending.kind === "prompt" && (
                <input
                  autoFocus
                  className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-5"
                  placeholder={pending.placeholder}
                  value={pending.value}
                  onChange={(e) => setPending({ ...pending, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") settlePrompt(pending.value);
                    if (e.key === "Escape") settlePrompt(null);
                  }}
                />
              )}
              {pending.kind === "confirm" && <div className="mb-1" />}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => (pending.kind === "confirm" ? settleConfirm(false) : settlePrompt(null))}
                  className="px-4 py-2 text-sm rounded-lg border border-white/10 text-slate-300 hover:bg-base-800 transition-colors"
                >
                  {pending.cancelLabel ?? "Cancel"}
                </button>
                <button
                  onClick={() => (pending.kind === "confirm" ? settleConfirm(true) : settlePrompt(pending.value))}
                  className={
                    pending.kind === "confirm" && pending.danger
                      ? "px-4 py-2 text-sm rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition-colors"
                      : "neon-button-sm"
                  }
                >
                  {pending.confirmLabel ?? (pending.kind === "confirm" ? "Confirm" : "OK")}
                </button>
              </div>
            </div>
          </div>
        )}
      </PromptContext.Provider>
    </ConfirmContext.Provider>
  );
}
