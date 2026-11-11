"use client";

import { useState } from "react";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { DailyPostEditor } from "../../../../components/dailyPosts/DailyPostEditor";
import type { DailyPostFeedKind } from "../../../../lib/api";

const TABS: Array<{ kind: DailyPostFeedKind; label: string }> = [
  { kind: "QUOTE", label: "Quote of the Day" },
  { kind: "QUESTION", label: "Question of the Day" },
];

export default function QuoteOfTheDayPage({ params }: { params: { guildId: string } }) {
  const [tab, setTab] = useState<DailyPostFeedKind>("QUOTE");

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="QOTD"
        title="Quote & Question of the Day"
        description="Posts a quote and a question every day. Each has its own channel, time, message and list, so they can share a channel or use separate ones."
      />

      <div className="flex gap-1 mb-5 border-b border-white/5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setTab(t.kind)}
            className={[
              "px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap shrink-0",
              tab === t.kind ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Both stay mounted so switching tabs never drops an edit that's still saving. */}
      {TABS.map((t) => (
        <div key={t.kind} className={tab === t.kind ? "" : "hidden"}>
          <DailyPostEditor guildId={params.guildId} kind={t.kind} />
        </div>
      ))}
    </div>
  );
}
