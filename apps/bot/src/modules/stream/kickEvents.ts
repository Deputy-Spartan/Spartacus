import { createPublicKey, verify, type KeyObject } from "node:crypto";
import fetch from "node-fetch";
import { LINK_CODE_PATTERN } from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { recordChat } from "../../lib/chatActivity";
import { getDiscordClient } from "./discordRef";

// Kick sends chat messages and follows for every connected Kick channel to
// one webhook (POST /webhooks/kick on the API, set in the Kick app's settings).
// Each delivery is signed with Kick's key, checked here before anything is used.

let keyCache: { key: KeyObject; at: number } | null = null;
async function kickKey(force = false): Promise<KeyObject | null> {
  if (!force && keyCache && Date.now() - keyCache.at < 6 * 3600_000) return keyCache.key;
  const res = await fetch("https://api.kick.com/public/v1/public-key").catch(() => null);
  if (!res?.ok) return keyCache?.key ?? null;
  const text = await res.text();
  let pem = text;
  try {
    pem = (JSON.parse(text) as { data?: { public_key?: string } }).data?.public_key ?? text;
  } catch {
    // Already the PEM text.
  }
  try {
    keyCache = { key: createPublicKey(pem), at: Date.now() };
    return keyCache.key;
  } catch {
    return null;
  }
}

export async function verifyKickSignature(messageId: string, timestamp: string, body: Buffer, signature: string): Promise<boolean> {
  if (!messageId || !timestamp || !signature) return false;
  const signed = Buffer.concat([Buffer.from(`${messageId}.${timestamp}.`), body]);
  const sig = Buffer.from(signature, "base64");
  for (const force of [false, true]) {
    const key = await kickKey(force);
    if (key && verify("RSA-SHA256", signed, key, sig)) return true;
  }
  return false;
}

// Kick may deliver the same message twice.
const recent = new Set<string>();
function firstTime(id: string) {
  if (recent.has(id)) return false;
  recent.add(id);
  if (recent.size > 5000) for (const k of [...recent].slice(0, 2500)) recent.delete(k);
  return true;
}

interface KickUser {
  user_id?: number;
  username?: string;
  channel_slug?: string;
}

export async function handleKickEvent(type: string, messageId: string, payload: unknown) {
  if (!firstTime(messageId)) return;
  const p = payload as { broadcaster?: KickUser; sender?: KickUser; follower?: KickUser; content?: string };
  const slug = (p.broadcaster?.channel_slug ?? p.broadcaster?.username ?? "").toLowerCase();
  if (!slug) return;
  try {
    if (type === "chat.message.sent" && p.sender?.username) {
      const user = p.sender.username.toLowerCase();
      if (p.sender.user_id !== undefined && p.sender.user_id === p.broadcaster?.user_id) return;
      recordChat("kick", slug, user);
      const code = p.content?.match(LINK_CODE_PATTERN);
      if (code) await verifyKickLink([user, (p.sender.channel_slug ?? "").toLowerCase()].filter(Boolean), code[0]);
    } else if (type === "channel.followed") {
      await prisma.streamSubscription.updateMany({ where: { platform: "kick", channelName: { equals: slug, mode: "insensitive" }, isLive: true }, data: { streamFollows: { increment: 1 } } });
    }
  } catch (err) {
    logError("bot", err);
  }
}

// A viewer typed their /link kick code in a live Kick chat.
async function verifyKickLink(names: string[], code: string) {
  const link = await prisma.streamLink.findFirst({ where: { platform: "kick", handle: { in: names }, code, verified: false } });
  if (!link) return;
  await prisma.streamLink.update({ where: { id: link.id }, data: { verified: true, verifiedAt: new Date() } });
  const user = await getDiscordClient()?.users.fetch(link.userId).catch(() => null);
  await user?.send(`✅ Your Kick name **${link.handle}** is linked. Chatting in the server's live Kick streams now earns rewards and counts for Viewer of the Week.`).catch(() => null);
}
