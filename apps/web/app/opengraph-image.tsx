import { ImageResponse } from "next/og";

// The picture Discord, X and others show when someone pastes spartc.us.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Spartacus: run your gaming community from one dashboard";
// Rendered when asked for (like app/icon.tsx), so it always shows the bot's
// current avatar and never bakes in a failed build-time fetch.
export const dynamic = "force-dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default async function OpenGraphImage() {
  // The bot's real avatar, the same one the favicon uses. If the API can't
  // be reached, the card still renders with just the words.
  let avatar: string | null = null;
  try {
    const res = await fetch(`${API_URL}/bot-avatar`, { next: { revalidate: 3600 } });
    if (res.ok) avatar = `data:${res.headers.get("content-type") ?? "image/png"};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    avatar = null;
  }
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          padding: "0 96px",
          // The color has to be its own property: the image renderer rejects a
          // plain color mixed into a list of gradients.
          backgroundColor: "#1c1d20",
          backgroundImage: "radial-gradient(circle at 8% 0%, rgba(123,153,188,0.55), rgba(28,29,32,0) 55%), radial-gradient(circle at 100% 100%, rgba(94,127,166,0.6), rgba(28,29,32,0) 55%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" width={220} height={220} style={{ borderRadius: 9999, border: "6px solid rgba(255,255,255,0.18)" }} />
        ) : (
          <div style={{ width: 220, height: 220, borderRadius: 48, background: "linear-gradient(135deg, #7b99bc, #5e7fa6)", display: "flex" }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 720 }}>
          <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: -2 }}>Spartacus</div>
          <div style={{ fontSize: 40, color: "#c9d4e2", lineHeight: 1.25 }}>Run your gaming community from one dashboard.</div>
          <div style={{ fontSize: 28, color: "#9fb6d3" }}>Matchmaking · Moderation · Stream alerts · Levels</div>
        </div>
      </div>
    ),
    size
  );
}
