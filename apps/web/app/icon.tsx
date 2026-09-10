import { readFile } from "node:fs/promises";
import path from "node:path";

export const size = { width: 256, height: 256 };
export const contentType = "image/png";
// Without this, Next treats icon.tsx like a static asset and generates it
// once at build time — if that build-time fetch to the API fails (e.g. the
// Vercel build sandbox can't reach a free-tier Render service, or the env
// var isn't set the same way at build time), the wrong fallback gets baked
// in permanently until the next deploy. Forcing this dynamic makes it a
// real per-request fetch instead, matching what "always mirrors the bot's
// current avatar" actually requires.
export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Always mirrors whatever the bot's actual current Discord avatar is,
// fetched from the public (no-auth) /bot-avatar endpoint — see
// apps/api/src/routes/botAvatar.ts. Falls back to the bundled default
// image below only if that fetch fails (API unreachable, no avatar set
// yet, etc.), so the favicon is never just a blank/broken icon.
export default async function Icon() {
  try {
    const res = await fetch(`${API_URL}/bot-avatar`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      return new Response(buffer, { headers: { "Content-Type": res.headers.get("content-type") ?? "image/png" } });
    }
  } catch {
    // fall through to the bundled default below
  }

  const fallback = await readFile(path.join(process.cwd(), "app/icon-default.png"));
  return new Response(new Uint8Array(fallback), { headers: { "Content-Type": "image/png" } });
}
