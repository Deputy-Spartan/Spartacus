"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { api, type LevelRoleRow } from "../../../../lib/api";

export default function LevelRolesPage({ params }: { params: { guildId: string } }) {
  const [rows, setRows] = useState<LevelRoleRow[]>([]);
  const [level, setLevel] = useState(10);
  const [roleId, setRoleId] = useState<string | null>(null);

  function refresh() {
    api.getLevelRoles(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  async function add() {
    if (!roleId) return;
    await api.addLevelRole(params.guildId, level, roleId);
    refresh();
  }

  async function remove(id: string) {
    await api.deleteLevelRole(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Level Roles</h1>
      <p className="text-slate-400 mb-6">Roles the bot grants automatically the moment a member reaches a milestone level.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Milestones</p>
          {rows.length === 0 && <p className="text-sm text-slate-500">None configured yet.</p>}
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  Level <span className="text-neon-blue font-semibold">{r.level}</span> → role {r.roleId}
                </span>
                <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Add Milestone</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Level</label>
          <input
            type="number"
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          />
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Role to Grant</label>
          <RoleSelect guildId={params.guildId} value={roleId} onChange={setRoleId} />
          <button onClick={add} className="neon-button">
            Add
          </button>
        </NeonCard>
      </div>
    </div>
  );
}
