"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type ReactionRoleRow } from "../../../../lib/api";

export default function ReactionRolesPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<ReactionRoleRow[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messageId, setMessageId] = useState("");
  const [emoji, setEmoji] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);

  function refresh() {
    api.getReactionRoles(params.guildId).then(setRows);
  }
  useEffect(refresh, [params.guildId]);

  async function add() {
    if (!channelId || !messageId || !emoji || !roleId) return;
    await api.addReactionRole(params.guildId, { channelId, messageId, emoji, roleId });
    setMessageId("");
    setEmoji("");
    refresh();
  }

  async function remove(id: string) {
    if (!(await confirm("Remove this reaction role?"))) return;
    await api.deleteReactionRole(params.guildId, id);
    refresh();
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="REACTION_ROLES"
        title="Reaction Roles"
        description="The bot reacts to the target message with your emoji — members click it to get the role, and it's removed if they un-react."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NeonCard>
          <p className="font-medium mb-3">Existing Mappings</p>
          {rows.length === 0 && <p className="text-sm text-slate-500">No reaction roles configured yet.</p>}
          <div className="divide-y divide-white/5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  {r.emoji} → <span className="text-neon-blue">role {r.roleId}</span> in message {r.messageId.slice(0, 8)}…
                </span>
                <button onClick={() => remove(r.id)} className="text-slate-500 hover:text-rose-400 text-xs">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </NeonCard>

        <NeonCard>
          <p className="font-medium mb-3">Add Mapping</p>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Message Channel</label>
          <ChannelSelect guildId={params.guildId} value={channelId} onChange={setChannelId} />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Message ID</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            placeholder="Right-click the message → Copy Message ID"
            value={messageId}
            onChange={(e) => setMessageId(e.target.value)}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Emoji</label>
          <input
            className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
            placeholder="🛡️"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Role to Grant</label>
          <RoleSelect guildId={params.guildId} value={roleId} onChange={setRoleId} />

          <button onClick={add} className="neon-button">
            Add Mapping
          </button>
        </NeonCard>
      </div>
    </div>
  );
}
