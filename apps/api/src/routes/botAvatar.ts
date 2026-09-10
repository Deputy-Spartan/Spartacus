import { Router } from "express";
import fetch from "node-fetch";
import { getBotUser } from "../lib/discordRest";

const router = Router();

// Public and unauthenticated on purpose — a bot's avatar is already
// visible to anyone in any server it's in, and this exists specifically
// so the website's favicon (apps/web/app/icon.tsx, requested anonymously
// by every visitor's browser) can mirror whatever the bot's real current
// Discord avatar is, without needing a logged-in session.
router.get("/bot-avatar", async (_req, res) => {
  const user = await getBotUser();
  if (!user?.avatar) return res.status(404).send("No avatar set");

  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  const cdnUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;

  const discordRes = await fetch(cdnUrl);
  if (!discordRes.ok) return res.status(502).send("Could not fetch avatar");

  res.set("Content-Type", discordRes.headers.get("content-type") ?? `image/${ext}`);
  res.set("Cache-Control", "public, max-age=3600"); // avatars change rarely; don't hit Discord on every favicon request
  const buffer = Buffer.from(await discordRes.arrayBuffer());
  res.send(buffer);
});

export default router;
