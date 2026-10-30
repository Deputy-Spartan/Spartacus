"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { api, type AlertSettingsRow, type ErrorLogRow } from "../../../../lib/api";

export default function ErrorsPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<ErrorLogRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [alertSettings, setAlertSettings] = useState<AlertSettingsRow | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  function refresh() {
    api.getErrors(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);
  useEffect(() => {
    api.getAlertSettings(params.guildId).then(setAlertSettings);
  }, [params.guildId]);
  useEffect(() => {
    api.getMe().then((me) => setMyUserId(me.id));
  }, []);

  async function clearAll() {
    await api.clearErrors(params.guildId);
    refresh();
  }

  async function updateChannel(field: "errorChannelId" | "errorPingRoleId" | "errorPingUserId" | "deployChannelId", id: string | null) {
    const value = id || null;
    setAlertSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
    await api.updateAlertSettings(params.guildId, { [field]: value });
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Errors</h1>
          <p className="text-slate-400">Anything that went wrong in the bot or dashboard for this server shows up here.</p>
        </div>
        {rows && rows.length > 0 && (
          <button onClick={clearAll} className="neon-button-sm shrink-0">
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <NeonCard>
          <p className="font-medium mb-1">Error Alert Channel</p>
          <p className="text-xs text-slate-500 mb-3">Posts a new embed here every time an error is logged for this server.</p>
          <ChannelSelect
            guildId={params.guildId}
            value={alertSettings?.errorChannelId ?? null}
            onChange={(id) => updateChannel("errorChannelId", id)}
            kind="text"
            placeholder="Off — not posting anywhere"
          />
          {alertSettings?.errorChannelId && (
            <>
              <div className="flex items-center justify-between gap-3 mt-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Ping Me</p>
                  <p className="text-xs text-slate-500 mt-0.5">Mentions you on every new error so you get a notification.</p>
                </div>
                <ToggleSwitch
                  enabled={!!myUserId && alertSettings.errorPingUserId === myUserId}
                  onChange={(on) => updateChannel("errorPingUserId", on ? myUserId : null)}
                />
              </div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Ping Role</label>
              <RoleSelect
                guildId={params.guildId}
                value={alertSettings.errorPingRoleId}
                onChange={(id) => updateChannel("errorPingRoleId", id)}
                placeholder="None — no role pinged"
              />
              <p className="text-xs text-slate-600 mt-2">The same error repeating is only alerted once per hour.</p>
            </>
          )}
        </NeonCard>
        <NeonCard>
          <p className="font-medium mb-1">Deploy Announcement Channel</p>
          <p className="text-xs text-slate-500 mb-3">Posts here whenever a new version of Spartacus goes live.</p>
          <ChannelSelect
            guildId={params.guildId}
            value={alertSettings?.deployChannelId ?? null}
            onChange={(id) => updateChannel("deployChannelId", id)}
            kind="text"
            placeholder="Off — not posting anywhere"
          />
        </NeonCard>
      </div>

      <NeonCard>
        {rows === null && <p className="text-sm text-slate-500">Loading…</p>}
        {rows?.length === 0 && <p className="text-sm text-slate-500">No errors recorded — everything's running clean.</p>}
        <div className="divide-y divide-white/5">
          {rows?.map((r) => (
            <div key={r.id} className="py-3">
              <button
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="w-full flex items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        r.source === "bot" ? "bg-neon-blue/20 text-neon-blue" : "bg-purple-500/20 text-purple-300"
                      }`}
                    >
                      {r.source}
                    </span>
                    <span className="text-xs text-slate-600">{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-rose-300 truncate">{r.message}</p>
                </div>
                {r.stack && <span className="text-slate-600 text-xs shrink-0">{expanded === r.id ? "Hide" : "Details"}</span>}
              </button>
              {expanded === r.id && r.stack && (
                <pre className="mt-2 bg-base-950 border border-white/5 rounded-lg p-3 text-xs text-slate-500 overflow-x-auto whitespace-pre-wrap">
                  {r.stack}
                </pre>
              )}
            </div>
          ))}
        </div>
      </NeonCard>
    </div>
  );
}
