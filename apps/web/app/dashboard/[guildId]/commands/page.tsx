"use client";

import { useState } from "react";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ActionCatalog, CommandBuilder, CommandLog } from "../../../../components/commands/CommandBuilder";
import { TextTriggers } from "../../../../components/commands/TextTriggers";
import type { CustomSlashCommandRow } from "../../../../lib/api";

// Custom Commands: your own /commands (the Command Builder), !text triggers,
// the Command Log, and the list of every action.
type Tab = "slash" | "text" | "log" | "list";
const TABS: Array<[Tab, string]> = [
  ["slash", "⚡ Slash commands"],
  ["text", "💬 Text triggers"],
  ["log", "📜 Command Log"],
  ["list", "📋 All actions"],
];

export default function CommandsPage({ params }: { params: { guildId: string } }) {
  const [tab, setTab] = useState<Tab>("slash");
  const [commands, setCommands] = useState<CustomSlashCommandRow[]>([]);
  return (
    <div>
      <ModuleHeader guildId={params.guildId} moduleKey="CUSTOM_COMMANDS" title="Custom Commands" description="Your own /commands that can do anything Spartacus can, plus !text triggers." />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-white/5">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors ${tab === k ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "slash" && <CommandBuilder guildId={params.guildId} onCommands={setCommands} />}
      {tab === "text" && <TextTriggers guildId={params.guildId} />}
      {tab === "log" && <CommandLog guildId={params.guildId} commands={commands} />}
      {tab === "list" && <ActionCatalog />}
    </div>
  );
}
