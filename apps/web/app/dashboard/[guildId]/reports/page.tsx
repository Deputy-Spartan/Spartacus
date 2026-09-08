"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { api } from "../../../../lib/api";

interface ReportRow {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  status: string;
  createdAt: string;
}

export default function ReportsPage({ params }: { params: { guildId: string } }) {
  const [reports, setReports] = useState<ReportRow[]>([]);

  function refresh() {
    api.getReports(params.guildId).then(setReports);
  }
  useEffect(refresh, [params.guildId]);

  async function setStatus(id: string, status: string) {
    await api.setReportStatus(params.guildId, id, status);
    refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Player Reports</h1>
      <p className="text-slate-400 mb-6">Submitted via /report — review and resolve them here.</p>

      <NeonCard>
        {reports.length === 0 && <p className="text-sm text-slate-500">No reports yet.</p>}
        <div className="divide-y divide-white/5">
          {reports.map((r) => (
            <div key={r.id} className="py-3 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  Reported <span className="text-neon-blue">user {r.reportedUserId}</span> by user {r.reporterId}
                </span>
                <span className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{r.reason}</p>
              <div className="flex gap-2 mt-2">
                {["OPEN", "REVIEWING", "RESOLVED"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(r.id, s)}
                    className={`text-xs px-2.5 py-1 rounded-md border ${
                      r.status === s ? "border-neon-blue text-neon-blue" : "border-white/10 text-slate-500"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
