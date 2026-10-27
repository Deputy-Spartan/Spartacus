"use client";

import { useState } from "react";

interface SendTestButtonProps {
  onSend: () => Promise<unknown>;
  disabled?: boolean;
  label?: string;
  successMessage?: string;
}

// Shared by every module's "Send Test" button (Welcome, Weekly Recap,
// Birthdays, ...) — posts the real message via the bot and shows a
// pass/fail result inline, same UX everywhere instead of each page
// re-implementing its own sending/status state.
export function SendTestButton({ onSend, disabled, label = "Send Test", successMessage = "Sent — check the configured channel." }: SendTestButtonProps) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setState("sending");
    setError(null);
    try {
      await onSend();
      setState("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
      setState("error");
    }
    setTimeout(() => setState("idle"), 4000);
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={run} disabled={disabled || state === "sending"} className="neon-button-sm disabled:opacity-40">
        {state === "sending" ? "Sending…" : label}
      </button>
      {state === "sent" && <span className="text-xs text-emerald-400">✓ {successMessage}</span>}
      {state === "error" && <span className="text-xs text-red-400">⚠ {error}</span>}
    </div>
  );
}
