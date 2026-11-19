"use client";

import { useEffect, useMemo, useState } from "react";
import { NAV_SECTIONS, OWNER_NAV_SECTION, MODULE_LABELS, type ModuleKey } from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { api, type DashboardActivityEntry } from "../../lib/api";
import { useNavLayout } from "../../lib/navLayout";

// "Recently changed": who changed which setting and when, on the Overview
// page. Every change made through the dashboard is recorded by the API, so
// this only reads that record. Page names follow your own names from Edit Mode.

const VERB: Record<string, string> = { POST: "Added to", PUT: "Changed", PATCH: "Changed", DELETE: "Removed from" };
const PAGES = [...NAV_SECTIONS, OWNER_NAV_SECTION].flatMap((s) => s.items).filter((i) => i.href);

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

export function RecentChanges({ guildId }: { guildId: string }) {
  const { pageLabel } = useNavLayout();
  const [rows, setRows] = useState<DashboardActivityEntry[] | null>(null);
  const [limit, setLimit] = useState(20);
  const [who, setWho] = useState<string | null>(null);

  useEffect(() => {
    api.getActivity(guildId, limit).then(setRows).catch(() => setRows([]));
  }, [guildId, limit]);

  const describe = useMemo(
    () => (e: DashboardActivityEntry) => {
      const rest = e.path.replace(/^\/guilds\/:guildId\/?/, "");
      const first = rest.split("/")[0] ?? "";
      const verb = VERB[e.method] ?? "Changed";
      if (first === "modules") {
        const key = rest.split("/")[1] as ModuleKey | undefined;
        const name = key && !key.startsWith(":") ? MODULE_LABELS[key] : null;
        return name ? `Turned ${name} on or off` : "Turned a module on or off";
      }
      const page = PAGES.find((p) => p.href.slice(1) === first);
      const name = page ? pageLabel(page.href, page.label) : first.replace(/-/g, " ") || "a setting";
      return `${verb} ${name}`;
    },
    [pageLabel]
  );

  const people = useMemo(() => [...new Set((rows ?? []).map((r) => r.username))], [rows]);
  const shown = (rows ?? []).filter((r) => !who || r.username === who);

  return (
    <NeonCard className="flex flex-col max-h-[32rem]">
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <p className="font-medium">Recently changed</p>
        <span className="text-xs text-slate-500">Every dashboard change, newest first</span>
      </div>
      {people.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
          <button
            type="button"
            onClick={() => setWho(null)}
            className={`rounded-full px-2.5 py-1 text-xs border ${!who ? "border-neon-blue/70 text-neon-blue" : "border-white/10 text-slate-400"}`}
          >
            Everyone
          </button>
          {people.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setWho(p === who ? null : p)}
              className={`rounded-full px-2.5 py-1 text-xs border ${who === p ? "border-neon-blue/70 text-neon-blue" : "border-white/10 text-slate-400"}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {rows === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-500">No dashboard changes yet.</p>
      ) : (
        <div className="divide-y divide-white/5 overflow-y-auto">
          {shown.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
              <div className="min-w-0">
                <p className="truncate">{describe(e)}</p>
                <p className="text-xs text-slate-500">{e.username}</p>
              </div>
              <span className="text-xs text-slate-500 shrink-0" title={new Date(e.createdAt).toLocaleString()}>
                {timeAgo(e.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
      {rows && rows.length >= limit && limit < 200 && (
        <button type="button" onClick={() => setLimit((l) => Math.min(200, l + 50))} className="mt-3 self-start text-xs font-semibold text-neon-blue hover:underline shrink-0">
          Show more
        </button>
      )}
    </NeonCard>
  );
}
