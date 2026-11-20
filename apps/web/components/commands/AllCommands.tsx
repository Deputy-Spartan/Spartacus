"use client";

import { useEffect, useMemo, useState } from "react";
import { NeonCard } from "../ui/NeonCard";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { api, type CommandToggleRow, type DiscordRoleOption } from "../../lib/api";

const hint = "text-xs text-slate-500";

// Every command Spartacus has (built-in and this server's own), grouped by
// section. Each can be switched off, or locked to a role: only that role and
// anyone above it (plus admins) can use it; everyone else gets a hidden warning.
export function AllCommands({ guildId }: { guildId: string }) {
  const [rows, setRows] = useState<CommandToggleRow[] | null>(null);
  const [roles, setRoles] = useState<DiscordRoleOption[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getCommandToggles(guildId).then(setRows).catch(() => setError("Couldn't load the commands."));
    api.getDiscordRoles(guildId).then(setRoles).catch(() => null);
  }, [guildId]);

  function patch(name: string, change: Partial<CommandToggleRow>, send: () => Promise<unknown>) {
    const prev = rows;
    setRows((r) => r?.map((c) => (c.name === name ? { ...c, ...change } : c)) ?? r);
    send().catch(() => {
      setRows(prev);
      setError("Couldn't save that. Try again.");
    });
  }

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\//, "");
    const list = (rows ?? []).filter((c) => !q || c.name.includes(q) || c.description.toLowerCase().includes(q) || c.subs?.some((s) => s.includes(q)));
    const out = new Map<string, { emoji: string; name: string; items: CommandToggleRow[] }>();
    for (const c of list) {
      const sec = c.section ?? { emoji: "🧰", name: "More" };
      const g = out.get(sec.name) ?? { ...sec, items: [] };
      g.items.push(c);
      out.set(sec.name, g);
    }
    return [...out.values()];
  }, [rows, query]);

  const total = rows?.length ?? 0;
  const locked = rows?.filter((c) => c.minRoleId).length ?? 0;

  return (
    <div className="space-y-4 max-w-3xl">
      <NeonCard>
        <p className="font-medium mb-1">🗂️ All commands</p>
        <p className={`${hint} mb-3`}>
          Every command Spartacus has{total ? ` (${total})` : ""}. Switch one off, or lock it to a role: only that role and anyone above it can use it. Everyone
          else gets a warning only they can see. Admins and the server owner can always use everything.
        </p>
        <input
          className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
          placeholder="Search commands…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {locked > 0 && <p className={`${hint} mt-2`}>🔒 {locked} locked to a role.</p>}
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      </NeonCard>

      {!rows && !error && <p className="text-slate-400">Loading…</p>}
      {rows && !groups.length && <p className={hint}>No commands match &quot;{query}&quot;.</p>}

      {groups.map((g) => (
        <NeonCard key={g.name}>
          <p className="font-medium mb-1">
            {g.emoji} {g.name} <span className={hint}>· {g.items.length}</span>
          </p>
          <div className="divide-y divide-white/5">
            {g.items.map((c) => (
              <div key={c.name} className="py-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] gap-2 sm:gap-4 items-center">
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${c.enabled ? "text-slate-200" : "text-slate-500 line-through"}`}>
                      /{c.name}
                      {c.staff && <span className="ml-2 text-[10px] font-semibold rounded px-1.5 py-0.5 bg-rose-500/15 text-rose-300">STAFF</span>}
                      {c.minRoleId && <span className="ml-1 text-[10px] font-semibold rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-300">🔒 LOCKED</span>}
                    </p>
                    <p className={hint}>{c.description}</p>
                    {!!c.subs?.length && <p className="text-[11px] text-slate-600 mt-0.5">{c.subs.map((s) => `/${c.name} ${s}`).join(" · ")}</p>}
                  </div>
                  <ToggleSwitch enabled={c.enabled} onChange={(v) => patch(c.name, { enabled: v }, () => api.setCommandToggle(guildId, c.name, v))} label={`Turn /${c.name} on or off`} />
                </div>
                <div className={c.enabled ? "" : "opacity-40 pointer-events-none"}>
                  <select
                    aria-label={`Who can use /${c.name}`}
                    className="w-full bg-base-950 border border-white/10 rounded-lg p-2 text-sm"
                    value={c.minRoleId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      patch(c.name, { minRoleId: id }, () => api.setCommandRoleLock(guildId, c.name, id));
                    }}
                  >
                    <option value="">{c.staff ? "Staff (Discord permission)" : "Everyone"}</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        🔒 @{r.name} and higher
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </NeonCard>
      ))}

      <p className={hint}>
        Want a locked command hidden from people who can&apos;t use it? Discord only lets the server do that: Server Settings › Integrations › Spartacus, then pick
        the command and the roles that can see it.
      </p>
    </div>
  );
}
