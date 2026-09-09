"use client";

import { useEffect, useState } from "react";
import type { ModuleKey } from "@spartacus/shared";
import { ToggleSwitch } from "./ToggleSwitch";
import { api } from "../../lib/api";

interface ModuleHeaderProps {
  guildId: string;
  moduleKey: ModuleKey;
  title: string;
  description: React.ReactNode;
}

// Drop this at the top of any module's page for a quick on/off switch
// without leaving the page to go find it in the Modules grid.
export function ModuleHeader({ guildId, moduleKey, title, description }: ModuleHeaderProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    api.getModules(guildId).then((state) => setEnabled(state[moduleKey]?.enabled ?? false));
  }, [guildId, moduleKey]);

  async function toggle(next: boolean) {
    setEnabled(next);
    await api.setModule(guildId, moduleKey, next).catch(() => setEnabled(!next));
  }

  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">{title}</h1>
        <p className="text-slate-400">{description}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0 bg-base-900 border border-white/5 rounded-lg px-3 py-2">
        <span className="text-xs text-slate-400">{enabled ? "Enabled" : "Disabled"}</span>
        <ToggleSwitch enabled={enabled ?? false} onChange={toggle} label={`Toggle ${title}`} disabled={enabled === null} />
      </div>
    </div>
  );
}
