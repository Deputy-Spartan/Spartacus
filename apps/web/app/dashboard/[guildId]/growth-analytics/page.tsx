"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { SimpleLineChart } from "../../../../components/ui/SimpleLineChart";
import { api, type GrowthSnapshotRow } from "../../../../lib/api";

export default function GrowthAnalyticsPage({ params }: { params: { guildId: string } }) {
  const [snapshots, setSnapshots] = useState<GrowthSnapshotRow[] | null>(null);

  useEffect(() => {
    api.getGrowthSnapshots(params.guildId).then(setSnapshots);
  }, [params.guildId]);

  const labels = snapshots?.map((s) => new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }));

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="GROWTH_ANALYTICS"
        title="Growth Analytics"
        description="A daily snapshot of member count and message activity, so you can see how your server is trending over time — not just the current live count."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Member Count</p>
          {snapshots === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <SimpleLineChart data={snapshots.map((s) => s.memberCount)} labels={labels} color="#22d3ee" />
          )}
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Messages / Day</p>
          {snapshots === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <SimpleLineChart data={snapshots.map((s) => s.messageCount)} labels={labels} color="#a78bfa" />
          )}
        </NeonCard>
      </div>

      <p className="text-xs text-slate-600 mt-4">
        Snapshots are taken once daily at midnight UTC. Enable this module and check back tomorrow to start building a history.
      </p>
    </div>
  );
}
