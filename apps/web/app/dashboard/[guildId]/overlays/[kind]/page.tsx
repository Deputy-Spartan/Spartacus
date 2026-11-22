"use client";

import { isOverlayKind, isToolKind } from "@spartacus/shared";
import { OverlayEditor } from "../../../../../components/streaming/OverlayEditor";
import { ToolEditor } from "../../../../../components/streaming/ToolEditor";

// Streaming › Overlays › one overlay or stream tool (Socials, Money and K/D
// have their own folders).
export default function OverlayKindPage({ params }: { params: { guildId: string; kind: string } }) {
  if (isOverlayKind(params.kind)) return <OverlayEditor key={params.kind} guildId={params.guildId} kind={params.kind} />;
  if (isToolKind(params.kind)) return <ToolEditor key={params.kind} guildId={params.guildId} kind={params.kind} />;
  return <p className="text-slate-400">There&apos;s no overlay called &quot;{params.kind}&quot;.</p>;
}
