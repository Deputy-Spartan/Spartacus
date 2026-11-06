"use client";

import { useEffect, useState } from "react";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { FormError } from "../../../../components/ui/FormError";
import { SettingRow, SettingsSection } from "../../../../components/ui/Settings";
import { api } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

export default function PermWatchPage({ params }: { params: { guildId: string } }) {
  const [alertChannelId, setAlertChannelId] = useState<string | null>(null);
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
    await api.setPermWatch(params.guildId, alertChannelId);
  }

  const autoSave = useAutoSave(alertChannelId, save);

  return (
    <div className="max-w-4xl">
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="PERM_WATCH"
        title="Perm Watch"
        description="Get alerted the moment a role's permissions change — especially a new Administrator grant."
      />

      <SettingsSection title="Alerts">
        <SettingRow label="Alert channel" required help="Where the alert posts when a role's permissions change." tip="Use a staff-only channel. A surprise Administrator grant is the most common sign of a compromised account.">
          <ChannelSelect guildId={params.guildId} value={alertChannelId} onChange={setAlertChannelId} />
        </SettingRow>
      </SettingsSection>

      <SaveStatus status={autoSave} onSave={save} />
      <FormError message={error} />
    </div>
  );
}
