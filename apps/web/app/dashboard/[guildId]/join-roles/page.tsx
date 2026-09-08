"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { api, type JoinRoleRow } from "../../../../lib/api";

export default function JoinRolesPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<JoinRoleRow[]>([]);
  const [roleId, setRoleId] = useState<string | null>(null);

  function refresh() {
    api.getJoinRoles(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  async function add() {
    if (!roleId) return;
    await api.addJoinRole(params.guildId, roleId);
    setRoleId(null);
    refresh();
  }

  async function remove(id: string) {
    await api.deleteJoinRole(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Join Roles</h1>
      <p className="text-slate-400 mb-6">Roles the bot grants automatically the moment a member joins.</p>

      <NeonCard className="max-w-lg">
        <p className="font-medium mb-3">Auto-Assigned Roles</p>
        {rows.length === 0 && <p className="text-sm text-slate-500 mb-4">No join roles configured yet.</p>}
        <div className="divide-y divide-white/5 mb-4">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-neon-blue">@ role {r.roleId}</span>
              <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                Remove
              </button>
            </div>
          ))}
        </div>

        <RoleSelect guildId={params.guildId} value={roleId} onChange={setRoleId} />
        <button onClick={add} className="neon-button">
          Add Role
        </button>
      </NeonCard>
    </div>
  );
}
