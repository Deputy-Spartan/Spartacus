"use client";

import Link from "next/link";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { AppIcon } from "../../../../components/ui/AppIcon";
import { PageGuideButton } from "../../../../components/nav/PageGuideButton";
import { OVERLAYS } from "../../../../components/streaming/OverlayTabs";

// Streaming › Overlays: one card for each thing you put on stream with OBS,
// in three groups.
const SECTIONS: Array<[string, string, "counters" | "extras" | "tools"]> = [
  ["Counters & boxes", "Numbers and boxes you change with buttons or a Stream Deck.", "counters"],
  ["Stream extras", "Alerts, chat, scenes and more that fill in from your stream.", "extras"],
  ["Tools", "Handy helpers and fun extras for chat.", "tools"],
];

export default function OverlaysPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">🎨 Overlays</h1>
          <p className="text-slate-400 text-sm mt-1">Everything you put on stream with OBS. Each one has its own OBS link.</p>
        </div>
        <PageGuideButton guildId={guildId} inline />
      </div>
      <div className="space-y-7">
        {SECTIONS.map(([title, line, key]) => (
          <section key={key}>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="text-slate-400 text-sm mb-3">{line}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {OVERLAYS.filter((o) => o.section === key).map((o) => (
                <NeonCard key={o.href} className="sp-card-link relative !p-4 flex flex-col gap-2">
                  <Link href={`/dashboard/${guildId}${o.href}`} className="absolute inset-0 rounded-[inherit]" aria-label={`Open ${o.label}`} />
                  <div className="relative flex items-center gap-3 pointer-events-none">
                    <AppIcon emoji={o.icon} size={30} className="sp-card-icon" />
                    <span className="flex-1 min-w-0 font-semibold truncate">{o.label}</span>
                  </div>
                  <p className="relative text-sm text-slate-400 leading-snug pointer-events-none">{o.line}</p>
                  <div className="relative mt-auto flex items-center justify-end gap-2 pointer-events-none">
                    <span className="sp-card-open text-xs font-semibold text-neon-blue">Open ›</span>
                  </div>
                </NeonCard>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
