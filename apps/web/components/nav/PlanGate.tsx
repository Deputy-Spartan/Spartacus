"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_MODULE_KEYS, TIER_INFO, tierForPath, type PlanTier } from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { isLocked, useGuildPlan } from "../../lib/useGuildPlan";

// A page that needs a paid plan this server doesn't have shows what the plan
// gives and how to get it, instead of the page. The bot and API refuse the
// feature too; this is just the friendly face of it.
export function PlanGate({ guildId, isOwner, children }: { guildId: string; isOwner: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const plan = useGuildPlan(guildId);
  const path = pathname.replace(`/dashboard/${guildId}`, "") || "/";
  const tier = tierForPath(path, (href) => NAV_MODULE_KEYS[href]);
  if (!isLocked(plan, tier, isOwner)) return <>{children}</>;
  return <LockedPage guildId={guildId} tier={tier!} storeUrl={plan?.storeUrl ?? null} enforced={!!plan?.enforced} />;
}

export function LockedPage({ guildId, tier, storeUrl, enforced }: { guildId: string; tier: PlanTier; storeUrl: string | null; enforced: boolean }) {
  const info = TIER_INFO[tier];
  if (!enforced) {
    return (
      <NeonCard className="max-w-xl mx-auto mt-10 text-center space-y-3">
        <p className="text-4xl" aria-hidden="true">{info.icon}</p>
        <h1 className="text-xl font-bold">{info.name} is coming soon</h1>
        <p className="text-slate-400 text-sm">{info.blurb}</p>
      </NeonCard>
    );
  }
  return (
    <NeonCard className="max-w-xl mx-auto mt-10 text-center space-y-4">
      <p className="text-4xl" aria-hidden="true">🔒</p>
      <div>
        <h1 className="text-xl font-bold">This needs {info.name}</h1>
        <p className="text-slate-400 text-sm mt-1">{info.blurb}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {storeUrl && (
          <a href={`${storeUrl}/p/${info.product}`} target="_blank" rel="noreferrer" className="neon-button">
            {info.icon} Unlock {info.name}
          </a>
        )}
        <Link href={`/dashboard/${guildId}/plans`} className="neon-button-sm self-center">
          I already bought it
        </Link>
      </div>
      <p className="text-xs text-slate-500">
        Buy it on the Outpost Gaming store with this Discord account, then open Plans and put it on this server.
        {tier !== "deck" && " All Access includes it too."}
      </p>
    </NeonCard>
  );
}
