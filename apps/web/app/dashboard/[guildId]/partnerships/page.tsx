"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api } from "../../../../lib/api";

interface PartnershipRow {
  id: string;
  partnerName: string;
  partnerInvite: string | null;
  type: string;
  since: string;
}

type Tab = "active" | "create";

export default function PartnershipsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
  const [rows, setRows] = useState<PartnershipRow[]>([]);
  const [partnerName, setPartnerName] = useState("");
  const [partnerInvite, setPartnerInvite] = useState("");
  const [type, setType] = useState("Ad Exchange");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getPartnerships(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  function resetDraft() {
    setPartnerName("");
    setPartnerInvite("");
    setType("Ad Exchange");
    setError(null);
  }

  async function add() {
    if (!partnerName) {
      setError("Enter the partner server's name before adding.");
      return;
    }
    setError(null);
    await api.addPartnership(params.guildId, { partnerName, partnerInvite, type });
    resetDraft();
    setTab("active");
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Remove this server partnership?"))) return;
    await api.deletePartnership(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Server Partnerships</h1>
      <p className="text-slate-400 mb-6">Track cross-promotion agreements with other servers.</p>

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Active Partnerships
        </button>
        <button
          onClick={() => {
            resetDraft();
            setTab("create");
          }}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "create" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          + Create New
        </button>
      </div>

      {tab === "active" &&
        (rows.length === 0 ? (
          <NeonCard>
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">No partnerships yet.</p>
              <p className="text-xs text-slate-600 mb-4">Add one to track a cross-promotion agreement with another server.</p>
              <button onClick={() => setTab("create")} className="neon-button-sm">
                + Create New
              </button>
            </div>
          </NeonCard>
        ) : (
          <NeonCard>
            <div className="divide-y divide-white/5">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.partnerName}</p>
                    <p className="text-xs text-slate-500">
                      {r.type} · since {new Date(r.since).toLocaleDateString()}
                    </p>
                  </div>
                  <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs shrink-0">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </NeonCard>
        ))}

      {tab === "create" && (
        <NeonCard className="max-w-lg">
          <p className="font-medium mb-3">New Partnership</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Partner Server Name
            <Required />
          </label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
          />
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Invite Link (optional)</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={partnerInvite}
            onChange={(e) => setPartnerInvite(e.target.value)}
          />
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Type</label>
          <select
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option>Ad Exchange</option>
            <option>Full Alliance</option>
            <option>Content Partner</option>
          </select>
          <button onClick={add} disabled={!partnerName} className="neon-button disabled:opacity-50">
            Create Partnership
          </button>
          <FormError message={error} />
        </NeonCard>
      )}
    </div>
  );
}
