"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api, type DiscordRoleOption, type LevelRoleRow } from "../../../../lib/api";

export default function LevelRolesPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<LevelRoleRow[]>([]);
  const [level, setLevel] = useState(10);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [roleOptions, setRoleOptions] = useState<DiscordRoleOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getLevelRoles(params.guildId).then(setRows);
    api.getDiscordRoles(params.guildId).then(setRoleOptions);
  }
  useEffect(refresh, [params.guildId]);

  function roleLabel(id: string): string {
    return roleOptions.find((r) => r.id === id)?.name ?? id;
  }

  async function add() {
    if (!roleId) {
      setError("Select a role to grant before adding.");
      return;
    }
    setError(null);
    await api.addLevelRole(params.guildId, level, roleId);
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Remove this level role?"))) return;
    await api.deleteLevelRole(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="LEVELING"
        title="Level Roles"
        description="Roles the bot grants automatically the moment a member reaches a milestone level."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Milestones</p>
          {rows.length === 0 && <p className="text-sm text-slate-500">None configured yet.</p>}
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  Level <span className="text-neon-blue font-semibold">{r.level}</span> → @{roleLabel(r.roleId)}
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
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">
            Role to Grant
            <Required />
          </label>
          <RoleSelect guildId={params.guildId} value={roleId} onChange={setRoleId} />
          <button onClick={add} className="neon-button">
            Add
          </button>
          <FormError message={error} />
        </NeonCard>
      </div>
    </div>
  );
}
