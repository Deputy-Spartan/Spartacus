"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { FormError } from "../../../../components/ui/FormError";
import { api, type ServerBackupRow } from "../../../../lib/api";

type Tab = "active" | "create";

function defaultName() {
  return `Backup ${new Date().toLocaleDateString()}`;
}

export default function ServerBackupPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("active");
  const [backups, setBackups] = useState<ServerBackupRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [name, setName] = useState(defaultName());
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getServerBackups(params.guildId).then(setBackups);
  }
  useEffect(refresh, [params.guildId]);

  function resetDraft() {
    setName(defaultName());
    setError(null);
  }

  async function create() {
    if (!name.trim()) {
      setError("Enter a name for this backup.");
      return;
    }
    setError(null);
    setCreating(true);
    await api.createServerBackup(params.guildId, name.trim());
    setCreating(false);
    resetDraft();
    setTab("active");
    refresh();
  }

  async function restore(id: string) {
    if (!(await confirm("Missing roles and channels will be recreated by name — nothing existing gets deleted or overwritten.", { title: "Restore this backup?" }))) {
      return;
    }
    setRestoringId(id);
    setResult(null);
    const { created } = await api.restoreServerBackup(params.guildId, id);
    setResult(`Restored: ${created.roles} role(s), ${created.channels} channel(s) recreated.`);
    setRestoringId(null);
  }

  async function remove(id: string) {
    await api.deleteServerBackup(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="SERVER_BACKUP"
        title="Server Backup"
        description="Snapshot your server's roles and channels so you can recover after a raid or accidental mass-deletion. Restoring only recreates what's missing by name — it never deletes or overwrites anything that already exists."
      />

      {result && <div className="mb-4 bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-3 text-sm text-emerald-300">{result}</div>}

      <div className="flex gap-1 mb-5 border-b border-white/5">
        <button
          onClick={() => setTab("active")}
          className={[
            "px-4 py-2 text-sm border-b-2 transition-colors",
            tab === "active" ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
          ].join(" ")}
        >
          Active Backups
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
        (backups.length === 0 ? (
          <NeonCard>
            <div className="text-center py-10">
              <p className="text-sm text-slate-400 mb-1">No backups yet.</p>
              <p className="text-xs text-slate-600 mb-4">Create one to snapshot this server's roles and channels.</p>
              <button onClick={() => setTab("create")} className="neon-button-sm">
                + Create New
              </button>
            </div>
          </NeonCard>
        ) : (
          <NeonCard>
            <div className="divide-y divide-white/5">
              {backups.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-3 text-sm gap-3">
                  <div className="min-w-0">
                    <p className="text-slate-300 truncate">{b.name}</p>
                    <p className="text-xs text-slate-600">
                      {new Date(b.createdAt).toLocaleString()} · {b.roleCount} roles · {b.channelCount} channels
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => restore(b.id)}
                      disabled={restoringId === b.id}
                      className="text-neon-blue hover:text-neon-purple text-xs"
                    >
                      {restoringId === b.id ? "Restoring…" : "Restore"}
                    </button>
                    <button onClick={() => remove(b.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </NeonCard>
        ))}

      {tab === "create" && (
        <NeonCard className="max-w-lg">
          <p className="font-medium mb-3">New Backup</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Backup Name</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={defaultName()}
          />

          <button onClick={create} disabled={creating} className="neon-button disabled:opacity-50">
            {creating ? "Creating…" : "Create Backup"}
          </button>
          <FormError message={error} />
        </NeonCard>
      )}
    </div>
  );
}
