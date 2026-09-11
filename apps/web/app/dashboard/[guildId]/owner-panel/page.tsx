"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { FormError } from "../../../../components/ui/FormError";
import { api, type AccessRequestRow, type DashboardAccessRow } from "../../../../lib/api";
import { useOwnerGuard } from "../../../../lib/useOwnerGuard";

export default function OwnerPanelPage({ params }: { params: { guildId: string } }) {
  const ownerAccess = useOwnerGuard(params.guildId);
  const confirm = useConfirm();
  const [requests, setRequests] = useState<AccessRequestRow[] | null>(null);
  const [access, setAccess] = useState<DashboardAccessRow[] | null>(null);
  const [id, setId] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getAccessRequests().then(setRequests);
    api.getDashboardAccess().then(setAccess);
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
        <p className="font-medium mb-1">Grant access directly</p>
        <p className="text-xs text-slate-500 mb-3">Add someone by Discord ID without waiting for a request.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm font-mono"
            placeholder="Discord ID, e.g. 573920184756201933"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
          <input
            className="flex-1 bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm"
            placeholder="Username (for your reference)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button onClick={grant} className="neon-button shrink-0">
            Grant access
          </button>
        </div>
        <FormError message={error} />
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-3">Approved users</p>
        <p className="text-xs text-slate-500 mb-3">Click a plan badge to flip it between Free and Paid.</p>
        {access?.length === 0 && <p className="text-sm text-slate-500">No one has access yet — grant it above.</p>}
        <div className="divide-y divide-white/5">
          {access?.map((a) => (
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
    </div>
  );
}
