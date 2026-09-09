"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NeonCard } from "../../../components/ui/NeonCard";
import { MODULE_KEYS, MODULE_LABELS, type ModuleKey } from "@spartacus/shared";
import { api, type DashboardActivityEntry, type ModuleState } from "../../../lib/api";

const METHOD_VERB: Record<string, string> = {
  POST: "Created",
  PUT: "Updated",
  PATCH: "Updated",
  DELETE: "Removed",
};

function describeEntry(entry: DashboardActivityEntry) {
  const segment = entry.path
    .replace(/^\/guilds\/:guildId\/?/, "")
    .replace(/\/:[a-zA-Z]+/g, "")
    .split("/")
    .filter(Boolean)
    .join(" ")
    .replace(/-/g, " ");
  const verb = METHOD_VERB[entry.method] ?? entry.method;
  return `${verb} ${segment || "a setting"}`;
}

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function OverviewPage({ params }: { params: { guildId: string } }) {
  const [modules, setModules] = useState<Record<ModuleKey, ModuleState> | null>(null);
  const [activity, setActivity] = useState<DashboardActivityEntry[]>([]);

  useEffect(() => {
    api.getModules(params.guildId).then((data) => setModules(data as Record<ModuleKey, ModuleState>));
    api.getActivity(params.guildId, 20).then(setActivity);
  }, [params.guildId]);

  const enabledKeys = modules ? MODULE_KEYS.filter((k) => modules[k]?.enabled) : [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Overview</h1>

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
          <p className="text-lg font-semibold mt-1 text-neon-blue">Online</p>
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
              {enabledKeys.map((k) => (
                <span key={k} className="px-2.5 py-1 rounded-full text-xs bg-base-800 border border-white/10 text-slate-300">
                  {MODULE_LABELS[k]}
                </span>
              ))}
            </div>
          )}
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Recent Activity</p>
          {activity.length === 0 ? (
            <p className="text-sm text-slate-500">No dashboard changes yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {activity.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                  <div className="min-w-0">
                    <p className="truncate">{describeEntry(entry)}</p>
                    <p className="text-xs text-slate-500">{entry.username}</p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{timeAgo(entry.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </NeonCard>
      </div>
    </div>
  );
}
