import { NextResponse } from "next/server";

// The link OBS opens for Streaming › Money Counter. The overlay page itself
// checks the number every second, so this only hands it the server and API.
export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function GET(req: Request, { params }: { params: { guildId: string } }) {
  const q = new URLSearchParams({ kind: "money", g: params.guildId, api: API_URL });
  return NextResponse.redirect(new URL(`/overlays/counter.html?${q}`, req.url), 307);
}
