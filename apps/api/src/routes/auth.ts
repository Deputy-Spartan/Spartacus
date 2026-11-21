import { Router } from "express";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { requireAuthOnly, type AuthedRequest } from "../middleware/requireAuth";

const router = Router();

const DISCORD_API = "https://discord.com/api/v10";

// Step 1: redirect the user to Discord's authorization screen.
router.get("/auth/discord", (_req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID as string,
    redirect_uri: process.env.DISCORD_REDIRECT_URI as string,
    response_type: "code",
    scope: "identify guilds",
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

// Step 2: exchange the code, fetch the user + their guilds, mint a session.
router.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) return res.status(400).send("Missing code");

  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID as string,
      client_secret: process.env.DISCORD_CLIENT_SECRET as string,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI as string,
    }),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => "");
    console.error("[auth] Discord token exchange failed:", tokenRes.status, detail);
    // Discord's own error names are safe to show back — "invalid_grant" (code
    // already used or expired) is by far the most common, usually from a
    // double navigation, a slow switch back from the Discord app, or a
    // reloaded/back-navigated callback page reusing a spent one-time code.
    return res.status(401).send(`Discord token exchange failed: ${detail || tokenRes.status}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  const [userRes, guildsRes] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    }),
    // with_counts adds each server's rough member count for the server picker.
    fetch(`${DISCORD_API}/users/@me/guilds?with_counts=true`, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    }),
  ]);

  const user = (await userRes.json()) as { id: string; username: string; avatar: string | null };
  const allGuilds = (await guildsRes.json()) as Array<{
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
    owner: boolean;
    approximate_member_count?: number;
  }>;

  // Only servers the user can actually manage go into the session — a
  // Discord power user can belong to hundreds of servers, and embedding
  // all of them in the JWT (now sent as a Bearer header, previously a
  // cookie) blows past proxy/CDN header-size limits (431 errors on every
  // authenticated request).
  const MANAGE_GUILD = 0x20;
  const ADMINISTRATOR = 0x8;
  // Only the fields the dashboard uses, so the token stays small.
  const guilds = allGuilds
    .filter((g) => {
      const perms = BigInt(g.permissions);
      return (perms & BigInt(MANAGE_GUILD)) !== 0n || (perms & BigInt(ADMINISTRATOR)) !== 0n;
    })
    .map((g) => ({ id: g.id, name: g.name, icon: g.icon, permissions: g.permissions, owner: g.owner, members: g.approximate_member_count ?? null }));

  const session = signSession({ id: user.id, username: user.username, avatar: user.avatar, guilds });

  // Dashboard (Vercel) and API (Render) live on different origins. A cookie
  // set here is cross-site from the dashboard's perspective, and browsers
  // increasingly drop cross-site cookies outright regardless of SameSite
  // settings (Safari ITP, Chrome's third-party cookie phase-out, private
  // browsing, etc). So the session is handed to the frontend as a token in
  // the URL fragment instead — fragments never reach the server, so it
  // never appears in logs or Referer headers — and the frontend stores it
  // itself (localStorage) and sends it back as a Bearer header.
  res.redirect(`${process.env.NEXTAUTH_URL ?? ""}/auth/callback#token=${session}`);
});

// A sign-in lasts 30 days, and the dashboard swaps in a fresh token about once
// a day while you use it, so you stay signed in as long as you keep visiting.
// Dashboard access is still checked on every request (requireAuth), so taking
// someone's access away locks them out right away.
const SESSION_LIFETIME = "30d";

function signSession(payload: object) {
  return jwt.sign(payload, process.env.NEXTAUTH_SECRET as string, { expiresIn: SESSION_LIFETIME });
}

router.post("/auth/refresh", requireAuthOnly, (req: AuthedRequest, res) => {
  const { iat: _iat, exp: _exp, ...payload } = req.session as unknown as Record<string, unknown>;
  res.json({ token: signSession(payload) });
});

router.post("/auth/logout", (_req, res) => {
  res.status(204).send();
});

export default router;
