import { readFile } from "node:fs/promises";
import path from "node:path";

export const size = { width: 256, height: 256 };
export const contentType = "image/png";

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
