"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { Required } from "../../../../components/ui/Required";
import { FormError } from "../../../../components/ui/FormError";
import { api, type DiscordRoleOption, type LevelRoleRow } from "../../../../lib/api";

type Tab = "active" | "create";

export default function LevelRolesPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
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

  function resetDraft() {
    setLevel(10);
    setRoleId(null);
    setError(null);
  }

  async function add() {
    if (!roleId) {
      setError("Select a role to grant before adding.");
      return;
    }
    setError(null);
    await api.addLevelRole(params.guildId, level, roleId);
    resetDraft();
    setTab("active");
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

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Active Level Roles
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
              <p className="text-sm text-slate-400 mb-1">No level roles yet.</p>
              <p className="text-xs text-slate-600 mb-4">Create one to auto-grant a role at a milestone level.</p>
              <button onClick={() => setTab("create")} className="neon-button-sm">
                + Create New
              </button>
            </div>
          </NeonCard>
        ) : (
          <NeonCard>
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
        ))}

      {tab === "create" && (
        <NeonCard className="max-w-lg">
          <p className="font-medium mb-3">New Level Role</p>
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
          <button onClick={add} disabled={!roleId} className="neon-button disabled:opacity-50">
            Create Level Role
          </button>
          <FormError message={error} />
        </NeonCard>
      )}
    </div>
  );
}
