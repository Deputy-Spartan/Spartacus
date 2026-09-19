"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

export default function PermWatchPage({ params }: { params: { guildId: string } }) {
  const [alertChannelId, setAlertChannelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getPermWatch(params.guildId).then((c) => setAlertChannelId(c.alertChannelId));
  }, [params.guildId]);

  async function save() {
    if (!alertChannelId) {
      setError("Select an alert channel before saving.");
      return;
    }
    setError(null);
    setSaving(true);
    await api.setPermWatch(params.guildId, alertChannelId);
    setSaving(false);
  }

  const autoSave = useAutoSave(alertChannelId, save);

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="PERM_WATCH"
        title="Perm Watch"
        description="Get alerted the moment a role's permissions change — especially a new Administrator grant."
      />

      <NeonCard className="max-w-lg">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
          Alert Channel
          <Required />
        </label>
        <ChannelSelect guildId={params.guildId} value={alertChannelId} onChange={setAlertChannelId} />
      </NeonCard>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
      <SaveStatus status={autoSave} />
      <FormError message={error} />
    </div>
  );
}
