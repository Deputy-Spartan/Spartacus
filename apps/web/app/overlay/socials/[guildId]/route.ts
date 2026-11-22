import { NextResponse } from "next/server";

// The link OBS opens for Streaming › Socials Overlay. It reads the saved
// settings and sends OBS on to the overlay page (public/overlays) with them,
// so changing them on the dashboard never needs a new link in OBS.
export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Settings = {
  platforms: Array<{ id: string; name: string }>;
  style: string;
  pos: string;
  size: number;
  hold: number;
  every: number;
  updatedAt: string | null;
};

export async function GET(req: Request, { params }: { params: { guildId: string } }) {
  const q = new URLSearchParams({ g: params.guildId, api: API_URL });
  // ?vert=1 is the link for a 1080x1920 (TikTok) canvas: names stacked.
  if (new URL(req.url).searchParams.get("vert") === "1") q.set("vert", "1");
  let file = "sticker";
  try {
    const res = await fetch(`${API_URL}/public/socials-overlay/${encodeURIComponent(params.guildId)}`, { cache: "no-store" });
    if (res.ok) {
      const s = (await res.json()) as Settings;
      file = s.style === "gold" ? "gold" : "sticker";
      q.set("show", s.platforms.map((p) => p.id).join(","));
      for (const p of s.platforms) q.set(p.id, p.name);
      q.set("pos", s.pos);
      q.set("size", String(s.size));
      q.set("hold", String(s.hold));
      q.set("every", String(s.every));
      if (s.updatedAt) q.set("v", s.updatedAt);
    }
  } catch {
    // API asleep: the page loads empty and reloads itself once settings answer
  }
  if (!q.has("show")) q.set("show", "");
  return NextResponse.redirect(new URL(`/overlays/${file}.html?${q}`, req.url), 307);
}
