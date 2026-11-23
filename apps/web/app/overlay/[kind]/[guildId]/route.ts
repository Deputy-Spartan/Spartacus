import { NextResponse } from "next/server";

// The OBS links for Streaming › Overlays: /overlay/game/<server>, /overlay/timer/<server>…
// (money, kd and socials have their own folders). The overlay page checks
// for changes every second, so this only hands it the server and API.
export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const KINDS = ["game", "message", "winloss", "timer", "goal", "challenge", "discord", "ticker"];
// Stream tools (packages/shared/tools.ts) use the full-screen tool page.
const TOOLS = ["alerts", "chat", "scenes", "stats", "giveaway", "leader", "next", "subathon", "cam", "clip", "cmds", "qr", "squad", "poll", "wheel", "dice", "predict", "welcome"];

export async function GET(req: Request, { params }: { params: { kind: string; guildId: string } }) {
  const q = new URLSearchParams({ kind: params.kind, g: params.guildId, api: API_URL });
  if (TOOLS.includes(params.kind)) return NextResponse.redirect(new URL(`/overlays/tool.html?${q}`, req.url), 307);
  if (!KINDS.includes(params.kind)) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(new URL(`/overlays/counter.html?${q}`, req.url), 307);
}
