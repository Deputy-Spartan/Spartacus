"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { FormError } from "../../../../components/ui/FormError";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { api, type WarnEscalationSettingsRow } from "../../../../lib/api";

const DEFAULTS: WarnEscalationSettingsRow = {
  warnThreshold: 3,
  warnWindowDays: 30,
  action: "TIMEOUT",
  timeoutMinutes: 60,
  scaleDuration: false,
};

export default function WarnEscalationPage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<WarnEscalationSettingsRow>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getWarnEscalationSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  async function save() {
    if (settings.warnThreshold < 1 || settings.warnWindowDays < 1) {
      setError("Threshold and window must be at least 1.");
      return;
    }
    if (settings.action === "TIMEOUT" && settings.timeoutMinutes < 1) {
      setError("Timeout minutes must be at least 1.");
      return;
    }
    setError(null);
    setSaving(true);
    await api.updateWarnEscalationSettings(params.guildId, settings).finally(() => setSaving(false));
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="WARN_ESCALATION"
        title="Warn Escalation"
        description="Automatically escalates a member once they rack up enough warnings within a rolling time window."
      />

      <NeonCard className="max-w-xl">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Warn Threshold</label>
            <input
              type="number"
              min={1}
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={settings.warnThreshold}
              onChange={(e) => setSettings((s) => ({ ...s, warnThreshold: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Window (days)</label>
            <input
              type="number"
              min={1}
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={settings.warnWindowDays}
              onChange={(e) => setSettings((s) => ({ ...s, warnWindowDays: Number(e.target.value) }))}
            />
          </div>
        </div>

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Action</label>
        <select
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
          value={settings.action}
          onChange={(e) => setSettings((s) => ({ ...s, action: e.target.value as WarnEscalationSettingsRow["action"] }))}
        >
          <option value="TIMEOUT">Timeout</option>
          <option value="KICK">Kick</option>
          <option value="BAN">Ban</option>
        </select>

        {settings.action === "TIMEOUT" && (
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Timeout Minutes</label>
            <input
              type="number"
              min={1}
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
              value={settings.timeoutMinutes}
              onChange={(e) => setSettings((s) => ({ ...s, timeoutMinutes: Number(e.target.value) }))}
            />
          </div>
        )}

        {settings.action === "TIMEOUT" && (
          <div className="mb-4 flex items-center gap-3">
            <ToggleSwitch
              enabled={settings.scaleDuration}
              onChange={(next) => setSettings((s) => ({ ...s, scaleDuration: next }))}
              label="Scale timeout duration"
            />
            <span className="text-sm text-slate-400">
              Double the timeout length for each repeat offense instead of always using the same length.
            </span>
          </div>
        )}

        <button onClick={save} disabled={saving} className="neon-button disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        <FormError message={error} />
      </NeonCard>
    </div>
  );
}
