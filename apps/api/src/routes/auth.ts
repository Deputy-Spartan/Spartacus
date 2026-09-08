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
  const guilds = (await guildsRes.json()) as Array<{
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
  }>;

  // Session payload stays small and short-lived — guild/permission list is
  // refreshed on next login rather than cached indefinitely, keeping token
  // size (and thus cookie overhead) low.
  const session = jwt.sign(
    { id: user.id, username: user.username, avatar: user.avatar, guilds },
    process.env.NEXTAUTH_SECRET as string,
    { expiresIn: "7d" }
  );

  res.cookie("spartacus_session", session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.redirect(process.env.NEXTAUTH_URL ?? "/");
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("spartacus_session");
  res.status(204).send();
});

export default router;
