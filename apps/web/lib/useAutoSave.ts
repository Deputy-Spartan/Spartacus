"use client";

import { useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

// Saves a settings page by itself a moment after the last change. The first
// value that arrives is treated as "what is already saved"; after that, any
// change starts a countdown that restarts on every edit, then calls `save`.
// Navigating away with an unsaved change saves it on the way out.
// `resetKey` starts a fresh baseline when the thing being edited changes
// (for example switching to a different saved embed).
export function useAutoSave<T>(value: T | null, save: () => Promise<unknown>, delay = 1500, resetKey?: string): AutoSaveStatus {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const snapshot = useRef<string | null>(null);
  const skipNext = useRef(false);
  const dirty = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    snapshot.current = null;
    dirty.current = false;
  }, [resetKey]);

  useEffect(() => {
    if (value === null) return;
    const json = JSON.stringify(value);
    if (snapshot.current === null || skipNext.current) {
      // the loaded value, or the server's echo of something we just saved
      snapshot.current = json;
      skipNext.current = false;
      return;
    }
    if (json === snapshot.current) return;

    dirty.current = true;
    setStatus("pending");
    const timer = setTimeout(async () => {
      snapshot.current = json;
      skipNext.current = true; // the page usually replaces its state with the saved copy
      setStatus("saving");
      try {
        await saveRef.current();
        dirty.current = false;
        setStatus("saved");
      } catch {
        setStatus("error");
      }
      setTimeout(() => {
        skipNext.current = false;
      }, 400);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  useEffect(
    () => () => {
      if (dirty.current) void saveRef.current().catch(() => null);
    },
    []
  );

  return status;
}
