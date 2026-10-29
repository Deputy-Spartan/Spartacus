"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { api, type ReportSettingsRow } from "../../../../lib/api";
import { useMemberNames } from "../../../../lib/useMemberNames";

type ReportRow = Awaited<ReturnType<typeof api.getReports>>[number];

const STATUS_STYLE: Record<string, string> = {
  OPEN: "border-red-500/40 text-red-400",
  REVIEWING: "border-amber-500/40 text-amber-400",
  RESOLVED: "border-emerald-500/40 text-emerald-400",
};

function ReportSettings({ guildId }: { guildId: string }) {
  const [settings, setSettings] = useState<ReportSettingsRow | null>(null);

  useEffect(() => {
    api.getReportSettings(guildId).then(setSettings);
  }, [guildId]);

  async function patch(partial: Partial<ReportSettingsRow>) {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
    await api.setReportSettings(guildId, partial);
  }

  if (!settings) return null;

  return (
    <NeonCard className="mb-4">
      <p className="font-medium mb-1">Review Channel & Staff Role</p>
      <p className="text-xs text-slate-500 mb-3">
        New reports post here as a ticket-style embed with Claim/Close buttons, in a discussion thread staff can reply in. Only the role
        below (or anyone with Manage Server) can claim or close a report.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-500 mb-1">Review channel</p>
          <ChannelSelect guildId={guildId} value={settings.reviewChannelId} onChange={(v) => patch({ reviewChannelId: v || null })} kind="text" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Staff role</p>
          <RoleSelect
            guildId={guildId}
            value={settings.staffRoleId}
            onChange={(roleId) => patch({ staffRoleId: roleId || null })}
            placeholder="Anyone with Manage Server"
          />
        </div>
      </div>
    </NeonCard>
  );
}

function ReportPanel({ guildId }: { guildId: string }) {
  const [settings, setSettings] = useState<ReportSettingsRow | null>(null);

  useEffect(() => {
    api.getReportSettings(guildId).then(setSettings);
  }, [guildId]);

  async function patch(partial: Partial<ReportSettingsRow>) {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
    await api.setReportSettings(guildId, partial);
  }

  if (!settings) return null;

  return (
    <NeonCard className="mb-4">
      <p className="font-medium mb-1">Report a Player — Panel (optional)</p>
      <p className="text-xs text-slate-500 mb-3">
        Posts an embed with a 🚩 Report a Player button — an alternative to <code className="text-neon-blue">/report</code> for members
        who'd rather click than type a command. Clicking opens a private modal (who, and why); nothing is posted publicly, and only
        the reporter sees the confirmation. They get a DM when the report is created and another when it's claimed. Leave the channel
        unset to use the slash command only.
      </p>
      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Panel Channel</label>
      <ChannelSelect
        guildId={guildId}
        value={settings.panelChannelId}
        onChange={(id) => patch({ panelChannelId: id || null })}
        kind="text"
        placeholder="Off — slash command only"
      />
      <SavedEmbedPicker guildId={guildId} value={settings.savedEmbedId} onChange={(id) => patch({ savedEmbedId: id })} />
    </NeonCard>
  );
}

function Transcript({ guildId, report }: { guildId: string; report: ReportRow }) {
  const { displayName } = useMemberNames(guildId, report.transcript.map((t) => t.authorId));

  if (report.transcript.length === 0) {
    return <p className="text-xs text-slate-600 mt-2">No messages in the discussion thread yet.</p>;
  }

  return (
    <div className="mt-2 space-y-2 max-h-72 overflow-y-auto bg-base-950 border border-white/5 rounded-lg p-3">
      {report.transcript.map((t, i) => (
        <div key={i} className="text-xs">
          <span className="text-neon-blue font-medium">{displayName(t.authorId)}</span>{" "}
          <span className="text-slate-600">{new Date(t.at).toLocaleString()}</span>
          <p className="text-slate-300 mt-0.5 whitespace-pre-wrap break-words">{t.content}</p>
          {t.attachmentUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {t.attachmentUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="text-neon-blue/80 underline break-all">
                  {url}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage({ params }: { params: { guildId: string } }) {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { displayName } = useMemberNames(
    params.guildId,
    reports.flatMap((r) => [r.reporterId, r.reportedUserId, ...(r.claimedById ? [r.claimedById] : [])])
  );

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
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="PLAYER_REPORTS"
        title="Player Reports"
        description="Submitted via /report or the Report a Player panel — posts to your review channel as a claimable, closeable ticket. Resolve them here or in Discord."
      />

      <ReportSettings guildId={params.guildId} />
      <ReportPanel guildId={params.guildId} />

      <NeonCard>
        {reports.length === 0 && <p className="text-sm text-slate-500">No reports yet.</p>}
        <div className="divide-y divide-white/5">
          {reports.map((r) => (
            <div key={r.id} className="py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  Reported <span className="text-neon-blue">{displayName(r.reportedUserId)}</span> by {displayName(r.reporterId)}
                </span>
                <span className="text-xs text-slate-500 shrink-0">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{r.reason}</p>
              <p className="text-xs text-slate-600 mt-1">
                {r.claimedById ? `Claimed by ${displayName(r.claimedById)}` : "Unclaimed"}
                {r.closedAt ? ` · Closed ${new Date(r.closedAt).toLocaleString()}` : ""}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {["OPEN", "REVIEWING", "RESOLVED"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(r.id, s)}
                    className={`text-xs px-2.5 py-1 rounded-md border ${
                      r.status === s ? STATUS_STYLE[s] : "border-white/10 text-slate-500"
                    }`}
                  >
                    {s}
                  </button>
                ))}
                <button
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="text-xs px-2.5 py-1 rounded-md border border-white/10 text-slate-400 hover:text-neon-blue hover:border-neon-blue transition-colors ml-auto"
                >
                  {expanded === r.id ? "Hide transcript" : `Transcript (${r.transcript.length})`}
                </button>
              </div>
              {expanded === r.id && <Transcript guildId={params.guildId} report={r} />}
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
