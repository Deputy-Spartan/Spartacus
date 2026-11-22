"use client";

import { isOverlayKind } from "@spartacus/shared";
import { OverlayEditor } from "../../../../../components/streaming/OverlayEditor";

// Streaming › Overlays › Game, Win/Loss, Timer, Goal bar, Challenge, Discord box
// and Latest follower (Socials, Money and K/D have their own folders).
export default function OverlayKindPage({ params }: { params: { guildId: string; kind: string } }) {
  if (!isOverlayKind(params.kind)) return <p className="text-slate-400">There&apos;s no overlay called &quot;{params.kind}&quot;.</p>;
  return <OverlayEditor key={params.kind} guildId={params.guildId} kind={params.kind} />;
}
