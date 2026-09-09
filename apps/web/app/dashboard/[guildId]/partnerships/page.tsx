"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api } from "../../../../lib/api";

interface PartnershipRow {
  id: string;
  partnerName: string;
  partnerInvite: string | null;
  type: string;
  since: string;
}

export default function PartnershipsPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<PartnershipRow[]>([]);
  const [partnerName, setPartnerName] = useState("");
  const [partnerInvite, setPartnerInvite] = useState("");
  const [type, setType] = useState("Ad Exchange");

  function refresh() {
    api.getPartnerships(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  async function add() {
    if (!partnerName) return;
    await api.addPartnership(params.guildId, { partnerName, partnerInvite, type });
    setPartnerName("");
    setPartnerInvite("");
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Partners</p>
          {rows.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium">{r.partnerName}</p>
                  <p className="text-xs text-slate-500">
                    {r.type} · since {new Date(r.since).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Add Partner</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Partner Server Name</label>
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
          <button onClick={add} className="neon-button">
            Add Partner
          </button>
        </NeonCard>
      </div>
    </div>
  );
}
