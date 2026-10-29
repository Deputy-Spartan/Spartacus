"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type ReportSettingsRow } from "../../../../lib/api";
import { useMemberNames } from "../../../../lib/useMemberNames";

type ReportRow = Awaited<ReturnType<typeof api.getReports>>[number];
type Tab = "reports" | "settings";

const STATUS_STYLE: Record<string, string> = {
  OPEN: "border-red-500/40 text-red-400",
  REVIEWING: "border-amber-500/40 text-amber-400",
  RESOLVED: "border-emerald-500/40 text-emerald-400",
  CLOSED: "border-slate-500/40 text-slate-400",
};

const CHANNEL_NAME_TOKENS = [
  { token: "{number}", description: "This report's sequential number (1, 2, 3…)" },
  { token: "{user}", description: "The reporter's username" },
  { token: "{reported}", description: "The reported member's username" },
];

const DM_TOKENS = [
  { token: "{number}", description: "This report's sequential number" },
  { token: "{server}", description: "This server's name" },
];

function ReportSettingsCard({ guildId }: { guildId: string }) {
  const [settings, setSettings] = useState<ReportSettingsRow | null>(null);
  const channelNameRef = useRef<HTMLInputElement>(null);

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
      <p className="font-medium mb-1">Report Channels & Staff Role</p>
      <p className="text-xs text-slate-500 mb-3">
        Ticket-style: every new report opens its own private channel under the category below, visible only to the staff role (and
        Manage Server). Nobody else — the reporter included — can see it. Only that role can claim, resolve, or close a report.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
        <div>
          <p className="text-xs text-slate-500 mb-1">Report category</p>
          <ChannelSelect
            guildId={guildId}
            value={settings.categoryId}
            onChange={(v) => patch({ categoryId: v || null })}
            kind="category"
            showCurrent={false}
          />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Staff role</p>
          <RoleSelect
            guildId={guildId}
            value={settings.staffRoleId}
            onChange={(roleId) => patch({ staffRoleId: roleId || null })}
            placeholder="No role set — locked to Manage Server only"
          />
        </div>
      </div>

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-3">Channel Name Format</label>
      <input
        ref={channelNameRef}
        className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
        value={settings.channelNameFormat}
        onChange={(e) => patch({ channelNameFormat: e.target.value })}
      />
      <PlaceholderExamples
        items={CHANNEL_NAME_TOKENS}
        inputRef={channelNameRef}
        value={settings.channelNameFormat}
        onChange={(v) => patch({ channelNameFormat: v })}
      />
    </NeonCard>
  );
}

function ReportPanelCard({ guildId }: { guildId: string }) {
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
        the reporter sees the confirmation. Leave the channel unset to use the slash command only.
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

interface DmFieldDef {
  enabledKey: "dmCreateEnabled" | "dmClaimEnabled" | "dmCloseEnabled";
  messageKey: "dmCreateMessage" | "dmClaimMessage" | "dmCloseMessage";
  label: string;
  hint: string;
  placeholder: string;
}

const DM_FIELDS: DmFieldDef[] = [
  {
    enabledKey: "dmCreateEnabled",
    messageKey: "dmCreateMessage",
    label: "Report Created",
    hint: "Sent to the reporter the moment their report channel is created (from /report or the panel).",
    placeholder: "🚩 Your report in **{server}** has been created (#{number}). Staff can now see it — you'll get another DM here once it's claimed. This is private; nobody else can see that you filed it.",
  },
  {
    enabledKey: "dmClaimEnabled",
    messageKey: "dmClaimMessage",
    label: "Report Claimed",
    hint: "Sent when a staff member clicks Claim on the report channel.",
    placeholder: "🙋 Your report #{number} in **{server}** has been claimed by a staff member and is now being reviewed.",
  },
  {
    enabledKey: "dmCloseEnabled",
    messageKey: "dmCloseMessage",
    label: "Report Resolved / Closed",
    hint: "Sent when staff clicks Resolved or Close, with a transcript of the report channel attached as a .txt file — right before the channel deletes itself.",
    placeholder: "🔒 Your report #{number} in **{server}** has been closed. Here's a transcript of the report channel for your records.",
  },
];

function DmMessagesCard({ guildId }: { guildId: string }) {
  const [settings, setSettings] = useState<ReportSettingsRow | null>(null);
  const refs = {
    dmCreateMessage: useRef<HTMLTextAreaElement>(null),
    dmClaimMessage: useRef<HTMLTextAreaElement>(null),
    dmCloseMessage: useRef<HTMLTextAreaElement>(null),
  };

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
      <p className="font-medium mb-1">DM Messages</p>
      <p className="text-xs text-slate-500 mb-3">
        Each update below can be turned off independently. When a message is left blank, the default shown as its placeholder is used.
      </p>
      <div className="space-y-5">
        {DM_FIELDS.map((f) => (
          <div key={f.enabledKey} className="border-t border-white/5 pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">{f.label}</p>
              <ToggleSwitch enabled={settings[f.enabledKey]} onChange={(v) => patch({ [f.enabledKey]: v } as Partial<ReportSettingsRow>)} label={`Send DM on ${f.label}`} />
            </div>
            <p className="text-xs text-slate-500 mb-2">{f.hint}</p>
            <textarea
              ref={refs[f.messageKey]}
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm disabled:opacity-50"
              rows={2}
              placeholder={f.placeholder}
              value={settings[f.messageKey] ?? ""}
              disabled={!settings[f.enabledKey]}
              onChange={(e) => patch({ [f.messageKey]: e.target.value || null } as Partial<ReportSettingsRow>)}
            />
            <PlaceholderExamples
              items={DM_TOKENS}
              inputRef={refs[f.messageKey]}
              value={settings[f.messageKey] ?? ""}
              onChange={(v) => patch({ [f.messageKey]: v || null } as Partial<ReportSettingsRow>)}
            />
          </div>
        ))}
      </div>
    </NeonCard>
  );
}

function DangerZoneCard({ guildId }: { guildId: string }) {
  const [isGuildOwner, setIsGuildOwner] = useState(false);
  const [purging, setPurging] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    api
      .getGuilds()
      .then((rows) => setIsGuildOwner(!!rows.find((g) => g.id === guildId)?.owner))
      .catch(() => null);
  }, [guildId]);

  if (!isGuildOwner) return null;

  async function purge() {
    const ok = await confirm(
      "Permanently delete every player report and its transcript for this server? This can't be undone — currently open report channels in Discord are untouched, but their history here will be gone.",
      { title: "Purge all reports", confirmLabel: "Purge everything", danger: true }
    );
    if (!ok) return;
    setPurging(true);
    await api.purgeReports(guildId);
    setPurging(false);
  }

  return (
    <NeonCard className="border-red-500/20">
      <p className="font-medium mb-1 text-red-400">Danger Zone</p>
      <p className="text-xs text-slate-500 mb-3">
        Permanently deletes every report and transcript for this server from the dashboard. Server owner only.
      </p>
      <button
        onClick={purge}
        disabled={purging}
        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
      >
        {purging ? "Purging…" : "Purge All Reports & Transcripts"}
      </button>
    </NeonCard>
  );
}

function SettingsTab({ guildId }: { guildId: string }) {
  return (
    <div>
      <ReportSettingsCard guildId={guildId} />
      <ReportPanelCard guildId={guildId} />
      <DmMessagesCard guildId={guildId} />
      <DangerZoneCard guildId={guildId} />
    </div>
  );
}

function Transcript({ guildId, report }: { guildId: string; report: ReportRow }) {
  const { displayName } = useMemberNames(guildId, report.transcript.map((t) => t.authorId));

  if (report.transcript.length === 0) {
    return <p className="text-xs text-slate-600 mt-2">No messages in the report channel yet.</p>;
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

function ReportsTab({ guildId }: { guildId: string }) {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { displayName } = useMemberNames(
    guildId,
    reports.flatMap((r) => [r.reporterId, r.reportedUserId, ...(r.claimedById ? [r.claimedById] : [])])
  );

  useEffect(() => {
    function refresh() {
      api.getReports(guildId).then(setReports);
    }
    refresh();
    // Status (open/claimed/resolved/closed) only ever changes from Discord —
    // Claim/Resolved/Close on the report channel itself — so this polls to
    // stay current instead of offering any way to change it here.
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, [guildId]);

  return (
    <NeonCard>
      {reports.length === 0 && <p className="text-sm text-slate-500">No reports yet.</p>}
      <div className="divide-y divide-white/5">
        {reports.map((r) => (
          <div key={r.id} className="py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>
                {r.reportNumber ? <span className="text-slate-500">#{r.reportNumber}</span> : null} Reported{" "}
                <span className="text-neon-blue">{displayName(r.reportedUserId)}</span> by {displayName(r.reporterId)}
              </span>
              <span className="text-xs text-slate-500 shrink-0">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{r.reason}</p>
            <p className="text-xs text-slate-600 mt-1">
              {r.claimedById ? `Claimed by ${displayName(r.claimedById)}` : "Unclaimed"}
              {r.closedAt ? ` · Closed ${new Date(r.closedAt).toLocaleString()}` : ""}
              {r.channelId ? (
                <>
                  {" · "}
                  <a href={`https://discord.com/channels/${guildId}/${r.channelId}`} target="_blank" rel="noreferrer" className="text-neon-blue/80 underline">
                    Open channel
                  </a>
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span
                title="Reflects what's happening in Discord — claim/resolve/close from the report channel to change it"
                className={`text-xs px-2.5 py-1 rounded-md border cursor-default ${STATUS_STYLE[r.status] ?? "border-white/10 text-slate-500"}`}
              >
                {r.status}
              </span>
              <button
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="text-xs px-2.5 py-1 rounded-md border border-white/10 text-slate-400 hover:text-neon-blue hover:border-neon-blue transition-colors ml-auto"
              >
                {expanded === r.id ? "Hide transcript" : `Transcript (${r.transcript.length})`}
              </button>
            </div>
            {expanded === r.id && <Transcript guildId={guildId} report={r} />}
          </div>
        ))}
      </div>
    </NeonCard>
  );
}

const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: "reports", label: "Reports", icon: "🚩" },
  { key: "settings", label: "Settings", icon: "⚙️" },
];

export default function ReportsPage({ params }: { params: { guildId: string } }) {
  const [tab, setTab] = useState<Tab>("reports");

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="PLAYER_REPORTS"
        title="Player Reports"
        description="Submitted via /report or the Report a Player panel — each one opens its own private, numbered channel under your report category. Resolve them here or in Discord."
      />

      <div className="flex gap-1 mb-5 border-b border-white/5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5",
              tab === t.key ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "reports" && <ReportsTab guildId={params.guildId} />}
      {tab === "settings" && <SettingsTab guildId={params.guildId} />}
    </div>
  );
}
