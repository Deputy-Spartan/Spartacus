"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type AchievementRow } from "../../../../lib/api";

const ACHIEVEMENT_LABELS: Record<string, string> = {
  FIRST_MESSAGE: "First Message",
  LEVEL_10: "Level 10",
  LEVEL_25: "Level 25",
  LEVEL_50: "Level 50",
  STREAK_7: "7-Day Streak",
  STREAK_30: "30-Day Streak",
  VOICE_10H: "10 Hours in Voice",
  VOICE_50H: "50 Hours in Voice",
};

export default function AchievementsPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<AchievementRow[] | null>(null);

  useEffect(() => {
    api.getAchievements(params.guildId).then(setRows);
  }, [params.guildId]);

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="ACHIEVEMENTS"
        title="Achievements"
        description="Milestones members unlock automatically — first messages, level thresholds, daily-claim streaks, and voice-time totals."
      />

      <NeonCard>
        <p className="font-medium mb-3">Recently Awarded</p>
        {rows === null && <p className="text-sm text-slate-500">Loading…</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-500">No achievements awarded yet.</p>}
        <div className="divide-y divide-white/5">
          {rows?.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
              <span className="text-slate-300 truncate flex-1">{r.userId}</span>
              <span className="text-neon-blue shrink-0">{ACHIEVEMENT_LABELS[r.type] ?? r.type}</span>
              <span className="text-xs text-slate-600 shrink-0">{new Date(r.awardedAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
