"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api } from "../../../../lib/api";

interface CaseRow {
  caseNumber: number;
  userId: string;
  action: string;
  reason: string | null;
  moderatorId: string;
  createdAt: string;
}

export default function CasesPage({ params }: { params: { guildId: string } }) {
  const [cases, setCases] = useState<CaseRow[]>([]);

  useEffect(() => {
    api.getCases(params.guildId).then(setCases);
  }, [params.guildId]);

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="MODERATION"
        title="Cases & Warnings"
        description="Full moderation history — every /kick /ban /mute /warn is logged here automatically."
      />

      <NeonCard>
        {cases.length === 0 && <p className="text-sm text-slate-500 py-2">No moderation actions logged yet.</p>}
        <div className="divide-y divide-white/5">
          {cases.map((c) => (
            <div key={c.caseNumber} className="py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  #{c.caseNumber} — <span className="text-neon-blue">{c.action}</span>
                </span>
                <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                User {c.userId} · by {c.moderatorId} {c.reason ? `— ${c.reason}` : ""}
              </p>
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
