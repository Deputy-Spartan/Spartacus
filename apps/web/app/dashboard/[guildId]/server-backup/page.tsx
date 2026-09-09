"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm, usePrompt } from "../../../../components/ui/ConfirmDialog";
import { api, type ServerBackupRow } from "../../../../lib/api";

export default function ServerBackupPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [backups, setBackups] = useState<ServerBackupRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function refresh() {
    api.getServerBackups(params.guildId).then(setBackups);
  }
  useEffect(refresh, [params.guildId]);

  async function create() {
    setCreating(true);
    const name = await prompt("Name this backup:", `Backup ${new Date().toLocaleDateString()}`);
    if (name) await api.createServerBackup(params.guildId, name);
    setCreating(false);
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

      <NeonCard>
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium">Backups</p>
          <button onClick={create} disabled={creating} className="neon-button-sm">
            {creating ? "Creating…" : "+ Create Backup"}
          </button>
        </div>
        {backups.length === 0 && <p className="text-sm text-slate-500">No backups yet.</p>}
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
    </div>
  );
}
