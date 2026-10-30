"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { FormError } from "../../../../components/ui/FormError";
import { api, type AccessAuditEntryRow, type AccessRequestRow, type DashboardAccessRow } from "../../../../lib/api";
import { useOwnerGuard } from "../../../../lib/useOwnerGuard";

type Tab = "active" | "grant" | "audit";

export default function OwnerPanelPage({ params }: { params: { guildId: string } }) {
  const ownerAccess = useOwnerGuard(params.guildId);
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
  const [requests, setRequests] = useState<AccessRequestRow[] | null>(null);
  const [access, setAccess] = useState<DashboardAccessRow[] | null>(null);
  const [auditLog, setAuditLog] = useState<AccessAuditEntryRow[] | null>(null);
  const [id, setId] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [revokingAll, setRevokingAll] = useState(false);

  function refresh() {
    api.getAccessRequests().then(setRequests);
    api.getDashboardAccess().then(setAccess);
    api.getAccessAuditLog().then(setAuditLog);
  }
  useEffect(() => {
    if (ownerAccess === "allowed") refresh();
  }, [ownerAccess]);

  async function approve(reqId: string) {
    await api.approveAccessRequest(reqId);
    refresh();
  }
  async function deny(reqId: string) {
    await api.denyAccessRequest(reqId);
    refresh();
  }
  function resetDraft() {
    setId("");
    setUsername("");
    setError(null);
  }
  async function grant() {
    if (!/^\d{15,25}$/.test(id.trim())) {
      setError("Discord IDs are 15-25 digit numbers — check for typos.");
      return;
    }
    if (!username.trim()) {
      setError("Enter the Discord username, for your own reference in the list.");
      return;
    }
    setError(null);
    try {
      await api.grantDashboardAccess(id.trim(), username.trim());
      setId("");
      setUsername("");
      setTab("active");
      refresh();
    } catch {
      setError("Could not grant access — that user may already have it.");
    }
  }
  async function togglePlan(row: DashboardAccessRow) {
    await api.setDashboardAccessPlan(row.id, row.plan === "FREE" ? "PAID" : "FREE");
    refresh();
  }
  async function revoke(row: DashboardAccessRow) {
    if (!(await confirm(`Revoke ${row.username}'s access to the dashboard?`))) return;
    await api.revokeDashboardAccess(row.id);
    refresh();
  }
  async function revokeAll() {
    if (
      !(await confirm(
        `Revoke ALL ${access?.length ?? 0} approved user(s)? Everyone except you will need to be re-approved to get back in.`
      ))
    )
      return;
    setRevokingAll(true);
    await api.revokeAllDashboardAccess().finally(() => setRevokingAll(false));
    refresh();
  }

  const filteredAccess = access?.filter((a) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return a.username.toLowerCase().includes(q) || a.discordUserId.includes(q);
  });

  const AUDIT_LABELS: Record<string, string> = {
    APPROVED: "✅ Approved",
    DENIED: "❌ Denied",
    GRANTED: "➕ Granted",
    REVOKED: "🚫 Revoked",
    PLAN_CHANGED: "🔄 Plan changed",
    REVOKED_ALL: "🔒 Revoked everyone",
  };

  if (ownerAccess !== "allowed") {
    return <p className="text-sm text-slate-500">Checking access…</p>;
  }

  return (
    <div>
      <span className="inline-flex items-center gap-1 bg-purple-500/15 text-purple-300 text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full mb-2">
        🔑 Owner only
      </span>
      <h1 className="text-2xl font-bold mb-1">Access Control</h1>
      <p className="text-slate-400 mb-6 max-w-2xl">
        No one can open this dashboard without your say-so. Approve requests, grant access directly, or revoke it — changes apply the next time
        that person loads the dashboard.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <NeonCard>
          <p className="text-slate-400 text-sm">Approved Users</p>
          <p className="text-2xl font-bold mt-1">{access?.length ?? "…"}</p>
        </NeonCard>
        <NeonCard>
          <p className="text-slate-400 text-sm">Pending Requests</p>
          <p className="text-2xl font-bold mt-1 text-amber-400">{requests?.length ?? "…"}</p>
        </NeonCard>
        <NeonCard>
          <p className="text-slate-400 text-sm">Paid Plan</p>
          <p className="text-2xl font-bold mt-1 text-amber-400">{access?.filter((a) => a.plan === "PAID").length ?? "…"}</p>
        </NeonCard>
      </div>

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Active Access
        </button>
        <button
          onClick={() => {
            resetDraft();
            setTab("grant");
          }}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "grant" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          + Grant Access
        </button>
        <button
          onClick={() => setTab("audit")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "audit" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Audit Log
        </button>
      </div>

      {tab === "active" && (
        <>
          {requests && requests.length > 0 && (
            <NeonCard className="mb-4">
              <p className="font-medium mb-1">Pending requests</p>
              <p className="text-xs text-slate-500 mb-3">These Discord accounts tried to sign in and asked for access.</p>
              <div className="divide-y divide-white/5">
                {requests.map((r) => (
                  <div key={r.id} className="flex items-start justify-between py-2.5 text-sm gap-3">
                    <div className="min-w-0">
                      <p className="truncate">{r.username}</p>
                      <p className="text-xs text-slate-600 font-mono">{r.discordUserId}</p>
                      {r.message && (
                        <p className="text-xs text-slate-400 mt-1.5 bg-base-950 border border-white/5 rounded-lg p-2 whitespace-pre-wrap">
                          {r.message}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => approve(r.id)} className="text-xs text-emerald-400 hover:text-emerald-300">
                        Approve
                      </button>
                      <button onClick={() => deny(r.id)} className="text-xs text-rose-400 hover:text-rose-300">
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </NeonCard>
          )}

          <NeonCard className="mb-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="font-medium">Approved users</p>
                <p className="text-xs text-slate-500 mt-0.5">Click a plan badge to flip it between Free and Paid.</p>
              </div>
              {access && access.length > 0 && (
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or ID…"
                  className="bg-base-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs w-44 shrink-0"
                />
              )}
            </div>
            {access?.length === 0 && <p className="text-sm text-slate-500">No one has access yet — grant it in the "+ Grant Access" tab.</p>}
            {access && access.length > 0 && filteredAccess?.length === 0 && (
              <p className="text-sm text-slate-500">No matches for "{search}".</p>
            )}
            <div className="divide-y divide-white/5">
              {filteredAccess?.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                  <div className="min-w-0">
                    <p className="truncate">{a.username}</p>
                    <p className="text-xs text-slate-600 font-mono">{a.discordUserId}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => togglePlan(a)}
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        a.plan === "PAID" ? "bg-amber-500/15 text-amber-400" : "bg-base-800 text-slate-400"
                      }`}
                    >
                      {a.plan}
                    </button>
                    <span className="text-xs text-slate-600">{new Date(a.grantedAt).toLocaleDateString()}</span>
                    <button onClick={() => revoke(a)} className="text-xs text-slate-500 hover:text-rose-400">
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </NeonCard>

          <NeonCard className="border-rose-500/20">
            <p className="font-medium text-rose-400 mb-1">Danger zone</p>
            <p className="text-xs text-slate-500 mb-3">
              Instantly revokes every approved user's access. You keep yours regardless — use this if you suspect the dashboard or a granted
              account has been compromised.
            </p>
            <button
              onClick={revokeAll}
              disabled={revokingAll || !access?.length}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 disabled:opacity-40"
            >
              {revokingAll ? "Revoking…" : "Revoke everyone's access"}
            </button>
          </NeonCard>
        </>
      )}

      {tab === "grant" && (
        <NeonCard className="mb-4 max-w-xl">
          <p className="font-medium mb-1">Grant access directly</p>
          <p className="text-xs text-slate-500 mb-4">Add someone by Discord ID without waiting for a request.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-1.5">Discord ID</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-neon-blue/50"
                placeholder="573920184756201933"
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-1.5">Username (for your reference)</label>
              <input
                className="w-full bg-base-950 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-neon-blue/50"
                placeholder="e.g. deputy_spartan"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>
          <button onClick={grant} className="neon-button w-full sm:w-auto mt-4">
            Grant access
          </button>
          <FormError message={error} />
        </NeonCard>
      )}

      {tab === "audit" && (
        <NeonCard className="mb-4">
          <p className="font-medium mb-1">Recent activity</p>
          <p className="text-xs text-slate-500 mb-3">Last 50 access-control decisions.</p>
          {(!auditLog || auditLog.length === 0) && <p className="text-sm text-slate-500">No activity yet.</p>}
          <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
            {auditLog?.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 text-xs gap-3">
                <div className="min-w-0">
                  <span className="text-slate-300">{AUDIT_LABELS[e.action] ?? e.action}</span>{" "}
                  <span className="text-slate-500">
                    — {e.username} {e.detail ? `(${e.detail})` : ""}
                  </span>
                </div>
                <span className="text-slate-600 shrink-0">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </NeonCard>
      )}
    </div>
  );
}
