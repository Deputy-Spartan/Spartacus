"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { api, type AppealRow, type AppealSettingsRow } from "../../../../lib/api";
import { useMemberNames } from "../../../../lib/useMemberNames";

const STATUS_STYLES: Record<AppealRow["status"], string> = {
  PENDING: "bg-amber-500/20 text-amber-300",
  APPROVED: "bg-emerald-500/20 text-emerald-300",
  DENIED: "bg-rose-500/20 text-rose-300",
};

export default function AppealsPage({ params }: { params: { guildId: string } }) {
  const [settings, setSettings] = useState<AppealSettingsRow | null>(null);
  const [rows, setRows] = useState<AppealRow[] | null>(null);
  const { displayName } = useMemberNames(
    params.guildId,
    (rows ?? []).flatMap((r) => [r.userId, r.resolvedBy]).filter((id): id is string => !!id)
  );

  useEffect(() => {
    api.getAppealSettings(params.guildId).then(setSettings);
  }, [params.guildId]);
  useEffect(() => {
    api.getAppeals(params.guildId).then(setRows);
  }, [params.guildId]);

  async function updateChannel(channelId: string) {
    const value = channelId || null;
    setSettings((prev) => (prev ? { ...prev, appealChannelId: value } : prev));
    await api.updateAppealSettings(params.guildId, { appealChannelId: value });
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="BAN_APPEALS"
        title="Ban/Mute Appeals"
        description="Members who are banned or muted get DMed an option to appeal. Appeals are reviewed and approved or denied in Discord."
      />

      <NeonCard className="mb-4">
        <p className="font-medium mb-1">Appeal Review Channel</p>
        <p className="text-xs text-slate-500 mb-3">Where new appeals get posted for staff to approve or deny.</p>
        <ChannelSelect
          guildId={params.guildId}
          value={settings?.appealChannelId ?? null}
          onChange={updateChannel}
          kind="text"
          placeholder="Off — appeals won't be reviewable"
        />
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-3">Past Appeals</p>
        {rows === null && <p className="text-sm text-slate-500">Loading…</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-500">No appeals yet.</p>}
        <div className="divide-y divide-white/5">
          {rows?.map((r) => (
            <div key={r.id} className="py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                <span className="text-sm text-slate-300">{displayName(r.userId)}</span>
                <span className="text-xs text-slate-600 ml-auto">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm text-slate-400">{r.reason}</p>
              {r.resolvedBy && <p className="text-xs text-slate-600 mt-1">Resolved by {displayName(r.resolvedBy)}</p>}
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
