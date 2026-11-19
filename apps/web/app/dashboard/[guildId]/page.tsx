"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NeonCard } from "../../../components/ui/NeonCard";
import { ChangelogCard } from "../../../components/ui/ChangelogCard";
import { MODULE_KEY_TO_HREF } from "../../../components/nav/Sidebar";
import { MODULE_KEYS, MODULE_LABELS, type ModuleKey } from "@spartacus/shared";
import { api, type ModuleState } from "../../../lib/api";
import { useBotStatus } from "../../../lib/useBotStatus";
import { HealthCard } from "../../../components/ui/HealthCard";
import { OverviewCharts } from "../../../components/ui/OverviewCharts";
import { LiveStrip } from "../../../components/overview/LiveStrip";
import { QuickSetup } from "../../../components/overview/QuickSetup";
import { RecentChanges } from "../../../components/overview/RecentChanges";

export default function OverviewPage({ params }: { params: { guildId: string } }) {
  const [modules, setModules] = useState<Record<ModuleKey, ModuleState> | null>(null);
  const botStatus = useBotStatus();

  useEffect(() => {
    api.getModules(params.guildId).then((data) => setModules(data as Record<ModuleKey, ModuleState>));
  }, [params.guildId]);

  const enabledKeys = modules ? MODULE_KEYS.filter((k) => modules[k]?.enabled) : [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Overview</h1>

      <LiveStrip guildId={params.guildId} />

      <QuickSetup guildId={params.guildId} />

      <HealthCard guildId={params.guildId} modules={modules} />

      <OverviewCharts guildId={params.guildId} modules={modules} />

      <ChangelogCard />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <NeonCard>
          <p className="text-slate-400 text-sm">Server ID</p>
          <p className="text-lg font-semibold mt-1">{params.guildId}</p>
        </NeonCard>
        <NeonCard>
          <p className="text-slate-400 text-sm">Active Modules</p>
          <p className="text-lg font-semibold mt-1">
            {modules ? `${enabledKeys.length} / ${MODULE_KEYS.length}` : "…"}
          </p>
        </NeonCard>
        <NeonCard>
          <p className="text-slate-400 text-sm">Bot Status</p>
          {(() => {
            const phase = botStatus === null ? "checking" : botStatus.updating ? "updating" : botStatus.online ? "online" : "offline";
            const dotClass = {
              checking: "bg-slate-600 animate-pulse",
              updating: "bg-amber-400 animate-pulse",
              online: "bg-emerald-400",
              offline: "bg-slate-500",
            }[phase];
            const textClass = { checking: "text-slate-400", updating: "text-amber-400", online: "text-neon-blue", offline: "text-slate-400" }[phase];
            const label = { checking: "Checking…", updating: "Updating", online: "Online", offline: "Offline" }[phase];
            return (
              <>
                <p className="flex items-center gap-2 mt-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                  <span className={`text-lg font-semibold ${textClass}`}>{label}</span>
                </p>
                {botStatus?.manual && botStatus.message && (
                  <p className="text-xs text-slate-500 mt-1 truncate" title={botStatus.message}>
                    {botStatus.message}
                  </p>
                )}
                {!botStatus?.manual && phase === "offline" && botStatus?.lastError && (
                  <p className="text-xs text-slate-500 mt-1 truncate" title={botStatus.lastError.message}>
                    {botStatus.lastError.message} —{" "}
                    <Link href={`/dashboard/${params.guildId}/errors`} className="text-neon-blue hover:underline">
                      see Errors
                    </Link>
                  </p>
                )}
              </>
            );
          })()}
        </NeonCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium">Enabled Modules</p>
            <Link href={`/dashboard/${params.guildId}/modules`} className="text-xs text-neon-blue hover:underline">
              Manage all
            </Link>
          </div>
          {!modules ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : enabledKeys.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing is turned on yet — head to Modules to get started.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {enabledKeys.map((k) => {
                const href = MODULE_KEY_TO_HREF[k];
                const className = "px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10 text-slate-300 transition-colors";
                return href ? (
                  <Link key={k} href={`/dashboard/${params.guildId}${href}`} className={`${className} hover:border-neon-blue/40 hover:text-neon-blue`}>
                    {MODULE_LABELS[k]}
                  </Link>
                ) : (
                  <span key={k} className={className}>
                    {MODULE_LABELS[k]}
                  </span>
                );
              })}
            </div>
          )}
        </NeonCard>

        <RecentChanges guildId={params.guildId} />
      </div>
    </div>
  );
}
