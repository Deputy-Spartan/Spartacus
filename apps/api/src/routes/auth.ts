import { Router } from "express";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

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

  if (!tokenRes.ok) return res.status(401).send("Discord token exchange failed");
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  const [userRes, guildsRes] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    }),
    fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    }),
  ]);

  const user = (await userRes.json()) as { id: string; username: string; avatar: string | null };
  const allGuilds = (await guildsRes.json()) as Array<{
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
  }>;

  // Only servers the user can actually manage go into the session — a
  // Discord power user can belong to hundreds of servers, and embedding
  // all of them in the JWT (now sent as a Bearer header, previously a
  // cookie) blows past proxy/CDN header-size limits (431 errors on every
  // authenticated request).
  const MANAGE_GUILD = 0x20;
  const ADMINISTRATOR = 0x8;
  const guilds = allGuilds.filter((g) => {
    const perms = BigInt(g.permissions);
    return (perms & BigInt(MANAGE_GUILD)) !== 0n || (perms & BigInt(ADMINISTRATOR)) !== 0n;
  });

  const session = jwt.sign(
    { id: user.id, username: user.username, avatar: user.avatar, guilds },
    process.env.NEXTAUTH_SECRET as string,
    { expiresIn: "7d" }
  );

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

router.post("/auth/logout", (_req, res) => {
  res.status(204).send();
});

export default router;
