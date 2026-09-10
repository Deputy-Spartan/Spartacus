"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api } from "../../../../lib/api";

export default function ServerTemplatesPage({ params }: { params: { guildId: string } }) {
  const confirm = useConfirm();
  const [guilds, setGuilds] = useState<Array<{ id: string; name: string }> | null>(null);
  const [sourceGuildId, setSourceGuildId] = useState<string>("");
  const [copying, setCopying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    api.getGuilds().then((all) => setGuilds(all.filter((g) => g.id !== params.guildId)));
  }, [params.guildId]);

  async function copy() {
    if (!sourceGuildId) return;
    const sourceName = guilds?.find((g) => g.id === sourceGuildId)?.name ?? "that server";
    const ok = await confirm(
      `Copy module settings from "${sourceName}"? This will overwrite which modules are enabled or disabled on THIS server — it does not copy any channel/message settings, only the on/off state of each module. This can't be undone.`
    );
    if (!ok) return;

    setCopying(true);
    setResult(null);
    try {
      const { copied } = await api.cloneModules(params.guildId, sourceGuildId);
      setResult(`Copied ${copied} module toggle${copied === 1 ? "" : "s"} from "${sourceName}".`);
    } catch {
      setResult("Something went wrong copying module settings. Please try again.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="SERVER_TEMPLATES"
        title="Server Config Templates"
        description="Copy which modules are enabled or disabled from another server you manage — a quick way to set up a new community with the same feature set. Only on/off state is copied, never channel IDs, messages, or other guild-specific settings."
      />

      <NeonCard className="max-w-xl">
        <p className="font-medium mb-3">Copy Module Settings From Another Server</p>

        {guilds === null ? (
          <p className="text-sm text-slate-500">Loading your servers…</p>
        ) : guilds.length === 0 ? (
          <p className="text-sm text-slate-500">You don't manage any other servers with Spartacus yet.</p>
        ) : (
          <>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Source server</label>
            <select
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm mb-4"
              value={sourceGuildId}
              onChange={(e) => setSourceGuildId(e.target.value)}
            >
              <option value="">Select a server…</option>
              {guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            <button onClick={copy} disabled={!sourceGuildId || copying} className="neon-button disabled:opacity-50">
              {copying ? "Copying…" : "Copy Module Settings From This Server"}
            </button>
          </>
        )}

        {result && <p className="text-sm text-slate-300 mt-4">{result}</p>}
      </NeonCard>
    </div>
  );
}
