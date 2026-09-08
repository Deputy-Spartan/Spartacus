"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { api } from "../../../../lib/api";

export default function PermWatchPage({ params }: { params: { guildId: string } }) {
  const [alertChannelId, setAlertChannelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPermWatch(params.guildId).then((c) => setAlertChannelId(c.alertChannelId));
  }, [params.guildId]);

  async function save() {
    if (!alertChannelId) return;
    setSaving(true);
    await api.setPermWatch(params.guildId, alertChannelId);
    setSaving(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Perm Watch</h1>
      <p className="text-slate-400 mb-6">Get alerted the moment a role's permissions change — especially a new Administrator grant.</p>

      <NeonCard className="max-w-lg">
        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Alert Channel</label>
        <ChannelSelect guildId={params.guildId} value={alertChannelId} onChange={setAlertChannelId} />
      </NeonCard>

      <button onClick={save} disabled={saving} className="neon-button mt-4">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
