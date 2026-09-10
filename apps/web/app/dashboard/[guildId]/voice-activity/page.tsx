"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type VoiceActivityRow } from "../../../../lib/api";

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export default function VoiceActivityPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<VoiceActivityRow[] | null>(null);

  useEffect(() => {
    api.getVoiceActivity(params.guildId).then(setRows);
  }, [params.guildId]);

  const top20 = rows?.slice(0, 20) ?? [];

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="VOICE_ACTIVITY"
        title="Voice Activity"
        description="Tracks how long members spend connected to voice channels (excluding AFK-channel time) and ranks the most active."
      />

      <NeonCard>
        <p className="font-medium mb-3">Top 20 by Time in Voice</p>
        {rows === null && <p className="text-sm text-slate-500">Loading…</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-500">No voice activity recorded yet.</p>}
        <div className="divide-y divide-white/5">
          {top20.map((r, i) => (
            <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
              <span className="text-slate-500 w-6 shrink-0">#{i + 1}</span>
              <span className="text-slate-300 truncate flex-1">{r.userId}</span>
              <span className="text-neon-blue font-medium shrink-0">{formatMinutes(r.totalMinutes)}</span>
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
