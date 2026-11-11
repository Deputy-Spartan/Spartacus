"use client";

import { useEffect, useState } from "react";
import { api, type ModuleState } from "./api";

// Which modules are on, for the sidebar, the group tabs and the Modules page.
//
// One shared copy per server with one refresh timer between them, so the
// sidebar and the tabs don't each ask the API on their own schedule. A switch
// flipped anywhere shows everywhere at once through setModuleEnabled().
type Modules = Record<string, ModuleState>;

const REFRESH_MS = 15_000;
const stores = new Map<string, { value: Modules | null; listeners: Set<(m: Modules | null) => void>; timer: ReturnType<typeof setInterval> | null }>();

function store(guildId: string) {
  let s = stores.get(guildId);
  if (!s) {
    s = { value: null, listeners: new Set(), timer: null };
    stores.set(guildId, s);
  }
  return s;
}

function publish(guildId: string, value: Modules) {
  const s = store(guildId);
  s.value = value;
  for (const listener of [...s.listeners]) listener(value);
}

function load(guildId: string) {
  // A hidden tab has nobody looking at the dots, so it doesn't ask.
  if (typeof document !== "undefined" && document.hidden && store(guildId).value) return;
  api
    .getModules(guildId)
    .then((m) => publish(guildId, m))
    .catch(() => null);
}

export function useModules(guildId: string): Modules | null {
  const [value, setValue] = useState<Modules | null>(() => store(guildId).value);

  useEffect(() => {
    const s = store(guildId);
    s.listeners.add(setValue);
    setValue(s.value);
    if (!s.timer) {
      load(guildId);
      s.timer = setInterval(() => load(guildId), REFRESH_MS);
    }
    return () => {
      s.listeners.delete(setValue);
      if (s.listeners.size === 0 && s.timer) {
        clearInterval(s.timer);
        s.timer = null;
      }
    };
  }, [guildId]);

  return value;
}

// Flips a module on or off. Shows straight away, and goes back if the save fails.
export async function setModuleEnabled(guildId: string, key: string, enabled: boolean) {
  const before = store(guildId).value;
  if (before) publish(guildId, { ...before, [key]: { ...before[key], enabled } });
  try {
    await api.setModule(guildId, key, enabled);
  } catch (err) {
    const now = store(guildId).value;
    if (now) publish(guildId, { ...now, [key]: { ...now[key], enabled: !enabled } });
    throw err;
  }
}
