"use client";

import { useState } from "react";
import Link from "next/link";
import { PAGE_GUIDES } from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { AppIcon } from "../ui/AppIcon";
import { EditableText } from "../ui/EditableText";
import { SetupBadge, setupState, useSetupStatus } from "../ui/SetupStatus";
import { setModuleEnabled, useModules } from "../../lib/useModules";
import { usePinnedModules } from "../../lib/usePinnedModules";
import { useNavLayout } from "../../lib/navLayout";

// A group's own page, opened from its button in the sidebar: one card per
// module with a short description, its status, pin and on/off switch. Tap a
// card to open that module. Order, names and hidden pages follow Edit Mode;
// the owner can reword any description with the pencil.

// The first sentence of the page's guide, as the card's short description.
function brief(href: string): string {
  const purpose = PAGE_GUIDES[href]?.purpose ?? "";
  const m = purpose.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : purpose).trim();
}

export function GroupCards({ guildId, section }: { guildId: string; section: string }) {
  const { sections, owner } = useNavLayout();
  const state = useModules(guildId);
  const setup = useSetupStatus(guildId);
  const { isPinned, togglePin } = usePinnedModules(guildId);
  const group = sections.find((s) => s.key === section);
  // "Turn all on/off" asks for a second tap before it changes every module.
  const [arm, setArm] = useState<"on" | "off" | null>(null);
  const [busy, setBusy] = useState(false);

  if (!group) return <p className="text-sm text-slate-500">No group called &quot;{section}&quot;.</p>;

  const items = group.items.filter((i) => !i.hidden);
  const gated = items.filter((i) => i.moduleKey);
  const on = gated.filter((i) => state?.[i.moduleKey!]?.enabled).length;
  // Each module once (two pages can share one, like Moderator and Cases).
  const keys = [...new Set(gated.map((i) => i.moduleKey!))];
  async function setAll(enabled: boolean) {
    setBusy(true);
    try {
      await Promise.all(keys.map((k) => setModuleEnabled(guildId, k, enabled).catch(() => null)));
    } finally {
      setBusy(false);
    }
  }
  const slug = (href: string) => href.replace(/^\//, "").replace(/[^a-z0-9._-]/gi, "-");

  return (
    <div>
      <div className="mb-5 flex items-start gap-3">
        <AppIcon emoji={group.icon ?? "🧩"} size={40} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{group.label}</h1>
          <p className="text-slate-400 text-sm">
            {group.description && <EditableText id={`group.${slug(group.key)}`}>{group.description}</EditableText>}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <p className="text-xs text-slate-500">{state ? `${on} of ${gated.length} on` : "Loading…"}</p>
            {state && keys.length > 1 && (
              <>
                {(["on", "off"] as const).map((to) => {
                  const armed = arm === to;
                  const allThere = to === "on" ? on === gated.length : on === 0;
                  return (
                    <button
                      key={to}
                      type="button"
                      disabled={allThere || busy}
                      onClick={() => {
                        if (!armed) return setArm(to);
                        setArm(null);
                        void setAll(to === "on");
                      }}
                      onBlur={() => armed && setArm(null)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold disabled:opacity-40 ${
                        armed ? "border-amber-400 text-amber-300" : "border-white/10 text-slate-300 hover:border-neon-blue/60"
                      }`}
                    >
                      {armed ? `Tap again to turn all ${to}` : `Turn all ${to}`}
                    </button>
                  );
                })}
                {busy && <span className="text-xs text-slate-500">Saving…</span>}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((item) => {
          const href = `/dashboard/${guildId}${item.href}`;
          const moduleKey = item.moduleKey;
          const enabled = moduleKey ? (state?.[moduleKey]?.enabled ?? false) : null;
          const pinned = isPinned(item.href);
          return (
            <NeonCard key={item.href} className="sp-card-link relative !p-4 flex flex-col gap-2">
              {/* The whole card opens the page; the switch, pin and pencil sit above this link. */}
              <Link href={href} className="absolute inset-0 rounded-[inherit]" aria-label={`Open ${item.label}`} />
              <div className="relative flex items-center gap-3 pointer-events-none">
                <AppIcon emoji={item.icon} size={30} className="sp-card-icon" />
                <span className="flex-1 min-w-0 font-semibold truncate">{item.label}</span>
                <button
                  type="button"
                  onClick={() => togglePin(item.href)}
                  title={pinned ? "Unpin" : "Pin to the sidebar and phone dock"}
                  aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
                  className={`pointer-events-auto shrink-0 w-8 h-8 flex items-center justify-center rounded text-sm ${pinned ? "text-neon-blue" : "text-slate-600 hover:text-slate-300"}`}
                >
                  📌
                </button>
                {moduleKey && (
                  <span className="pointer-events-auto">
                    <ToggleSwitch enabled={enabled ?? false} onChange={(next) => void setModuleEnabled(guildId, moduleKey, next).catch(() => null)} label={item.label} disabled={!state} />
                  </span>
                )}
              </div>
              <p className={`relative text-sm text-slate-400 leading-snug ${owner ? "[&_button]:pointer-events-auto pointer-events-none" : "pointer-events-none"}`}>
                <EditableText id={`card.${slug(item.href)}`}>{brief(item.href) || item.label}</EditableText>
              </p>
              <div className="relative mt-auto flex items-center justify-between gap-2 pointer-events-none">
                {enabled !== null ? <SetupBadge state={setupState(enabled, setup?.[moduleKey!])} count={setup?.[moduleKey!]?.length ?? 0} /> : <span className="text-xs text-slate-600">Always on</span>}
                <span className="sp-card-open text-xs font-semibold text-neon-blue">Open ›</span>
              </div>
            </NeonCard>
          );
        })}
      </div>
    </div>
  );
}
