"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api } from "../../../../lib/api";
import { downloadCsv } from "../../../../lib/csv";
import { useMemberNames } from "../../../../lib/useMemberNames";

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
  const { displayName } = useMemberNames(params.guildId, cases.flatMap((c) => [c.userId, c.moderatorId]));

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

      {cases.length > 0 && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() =>
              downloadCsv(
                `moderation-cases-${params.guildId}.csv`,
                cases.map((c) => ({
                  caseNumber: c.caseNumber,
                  userId: c.userId,
                  action: c.action,
                  reason: c.reason ?? "",
                  moderatorId: c.moderatorId,
                  createdAt: c.createdAt,
                }))
              )
            }
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-base-900 border border-white/10 hover:border-neon-blue transition-colors"
          >
            Export CSV
          </button>
        </div>
      )}

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
                {displayName(c.userId)} · by {displayName(c.moderatorId)} {c.reason ? `— ${c.reason}` : ""}
              </p>
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
