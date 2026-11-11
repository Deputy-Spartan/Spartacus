"use client";

import { NAV_SECTIONS, type ModuleKey } from "@spartacus/shared";
import { AppIcon } from "./AppIcon";
import { SetupBadge, SetupNotice, setupState, useSetupStatus } from "./SetupStatus";
import { ToggleSwitch } from "./ToggleSwitch";
import { setModuleEnabled, useModules } from "../../lib/useModules";
import { EditableText } from "./EditableText";
import { useEmbedded } from "./EmbeddedPage";

interface ModuleHeaderProps {
  guildId: string;
  moduleKey: ModuleKey;
  title: string;
  description: React.ReactNode;
}

const iconFor = (key: ModuleKey) => NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.moduleKey === key)?.icon;

// Drop this at the top of any module's page for a quick on/off switch
// without leaving the page to go find it in the Modules grid.
export function ModuleHeader({ guildId, moduleKey, title, description }: ModuleHeaderProps) {
  // The same copy the sidebar and the group tabs read, so flipping this
  // switch updates their dots at once and opening a page asks the API once.
  const modules = useModules(guildId);
  const enabled = modules ? (modules[moduleKey]?.enabled ?? false) : null;
  const embedded = useEmbedded();
  const setup = useSetupStatus(guildId);
  const missing = setup?.[moduleKey] ?? [];

  async function toggle(next: boolean) {
    await setModuleEnabled(guildId, moduleKey, next).catch(() => null);
  }

  if (embedded) return null;

  return (
    <>
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="flex items-start gap-3.5 min-w-0">
        {iconFor(moduleKey) && <AppIcon emoji={iconFor(moduleKey)!} size={44} className="mt-0.5" />}
        <div className="min-w-0">
        <h1 className="text-2xl font-bold mb-1">{title}</h1>
        <p className="text-slate-400">{typeof description === "string" ? <EditableText id={`module.${moduleKey}.description`}>{description}</EditableText> : description}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 bg-base-900 border border-white/5 rounded-lg px-3 py-2">
        {enabled === null ? (
          <>
            <span className="h-3 w-14 animate-pulse rounded bg-white/5" />
            <span className="h-6 w-11 animate-pulse rounded-full bg-white/5" aria-label="Loading" />
          </>
        ) : (
          <>
            {setup ? <SetupBadge state={setupState(enabled, missing)} count={missing.length} /> : <span className="text-xs text-slate-400">{enabled ? "Enabled" : "Disabled"}</span>}
            <ToggleSwitch enabled={enabled} onChange={toggle} label={`Toggle ${title}`} />
          </>
        )}
      </div>
    </div>
    {enabled && <SetupNotice title={title} missing={missing} />}
    </>
  );
}
