"use client";

import { useEffect, useState } from "react";
import { MODULE_KEYS, MODULE_LABELS, type ModuleKey } from "@spartacus/shared";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { api, type ModuleState } from "../../../../lib/api";

export default function ModulesPage({ params }: { params: { guildId: string } }) {
  const [state, setState] = useState<Record<ModuleKey, ModuleState> | null>(null);

  useEffect(() => {
    api.getModules(params.guildId).then((data) => setState(data as Record<ModuleKey, ModuleState>));
  }, [params.guildId]);

  async function toggle(key: ModuleKey, next: boolean) {
    setState((prev) => (prev ? { ...prev, [key]: { ...prev[key], enabled: next } } : prev));
    await api.setModule(params.guildId, key, next).catch(() => {
      // Roll back on failure so the UI never claims a state the DB doesn't have.
      setState((prev) => (prev ? { ...prev, [key]: { ...prev[key], enabled: !next } } : prev));
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Modules</h1>
      <p className="text-slate-400 mb-6">Turn any part of Spartacus on or off for this server.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULE_KEYS.map((key) => (
          <NeonCard key={key} className="flex items-center justify-between">
            <div>
              <p className="font-medium">{MODULE_LABELS[key]}</p>
              <p className="text-xs text-slate-500 mt-1">{state?.[key]?.enabled ? "Enabled" : "Disabled"}</p>
            </div>
            <ToggleSwitch
              enabled={state?.[key]?.enabled ?? false}
              onChange={(next) => toggle(key, next)}
              label={MODULE_LABELS[key]}
              disabled={!state}
            />
          </NeonCard>
        ))}
      </div>
    </div>
  );
}
