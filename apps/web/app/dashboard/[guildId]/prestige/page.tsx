"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { FormError } from "../../../../components/ui/FormError";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { api, type PrestigeSettingsRow } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

const DEFAULTS: PrestigeSettingsRow = {
  maxLevel: 50,
  roleId: null,
};

export default function PrestigePage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<PrestigeSettingsRow>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getPrestigeSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  async function save() {
    if (settings.maxLevel < 1) {
      setError("Max level must be at least 1.");
      return;
    }
    setError(null);
    setSaving(true);
    await api.updatePrestigeSettings(params.guildId, settings).finally(() => setSaving(false));
  }

  const autoSave = useAutoSave(settings, save);

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="PRESTIGE"
        title="Prestige"
        description="Lets members reset their level back to 0 once they hit the max level, in exchange for a permanent prestige rank (and optionally a role)."
      />

      <NeonCard className="max-w-xl">
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Max Level</label>
          <input
            type="number"
            min={1}
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
            value={settings.maxLevel}
            onChange={(e) => setSettings((s) => ({ ...s, maxLevel: Number(e.target.value) }))}
          />
        </div>

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Prestige Role (optional)</label>
        <RoleSelect
          guildId={params.guildId}
          value={settings.roleId}
          onChange={(roleId) => setSettings((s) => ({ ...s, roleId }))}
          placeholder="No role granted"
        />

        <button onClick={save} disabled={saving} className="neon-button disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
      <SaveStatus status={autoSave} />
        <FormError message={error} />
      </NeonCard>
    </div>
  );
}
