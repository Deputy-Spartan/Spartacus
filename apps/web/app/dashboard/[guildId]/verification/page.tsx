"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type VerificationConfig } from "../../../../lib/api";

export default function VerificationPage({ params }: { params: { guildId: string } }) {
  const [config, setConfig] = useState<VerificationConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getVerification(params.guildId).then(setConfig);
  }, [params.guildId]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setConfig(await api.setVerification(params.guildId, config));
    setSaving(false);
  }

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="VERIFICATION"
        title="Verification"
        description={
          <>
            New members run <code className="text-neon-blue">/verify</code> to receive this role and gain access to the rest of
            the server.
          </>
        }
      />

      <NeonCard className="max-w-lg">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Verified Role</label>
        <RoleSelect
          guildId={params.guildId}
          value={config.verifiedRoleId}
          onChange={(roleId) => setConfig({ ...config, verifiedRoleId: roleId })}
        />

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Minimum Account Age (days)</label>
        <input
          type="number"
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
          value={config.minAccountAgeDays}
          onChange={(e) => setConfig({ ...config, minAccountAgeDays: Number(e.target.value) })}
        />
      </NeonCard>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
