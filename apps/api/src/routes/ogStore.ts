import { Router, type NextFunction, type Response } from "express";
import { requireAuth, isOwner, type AuthedRequest } from "../middleware/requireAuth";
import { getGuildChannels, postChannelMessage } from "../lib/discordRest";

// Owner Only → Store. Reads and changes the store website through its /api/bridge/*
// endpoints (server to server, with STORE_BRIDGE_SECRET, the same value set on Netlify), and posts
// store announcements to Discord as Spartacus. Only the owner (OWNER_DISCORD_ID) can use it.
const router = Router();
const storeUrl = () => (process.env.STORE_URL || "https://outpostgaming.netlify.app").replace(/\/$/, "");
const SNOWFLAKE = /^\d{17,20}$/;

function ownerOnly(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!isOwner(req.user?.id ?? req.session?.id)) return res.status(403).json({ error: "The store page is for the bot owner only." });
  next();
}

async function bridge(req: AuthedRequest, path: string, method: "GET" | "PUT" | "POST", body?: unknown) {
  const secret = process.env.STORE_BRIDGE_SECRET || "";
  if (secret.length < 32) {
    return { status: 503, body: { notConnected: true, error: "The store isn't connected yet. Add STORE_BRIDGE_SECRET (32+ random characters, the same value) on Render and on Netlify." } };
  }
  try {
    const res = await fetch(`${storeUrl()}/api/bridge/${path}`, {
      method,
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "x-spartacus-user": req.user?.id ?? "" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return { status: 502, body: { notConnected: true, error: "The store didn't accept Spartacus's key. Make sure STORE_BRIDGE_SECRET is exactly the same on Render and Netlify, then redeploy both." } };
    return { status: res.status, body: data };
  } catch {
    return { status: 502, body: { error: "Couldn't reach the store. Try again in a minute." } };
  }
}

const relay = (path: string, method: "GET" | "PUT" | "POST") => async (req: AuthedRequest, res: Response) => {
  const r = await bridge(req, path, method, req.body);
  res.status(r.status).json(r.body);
};

router.get("/owner/og-store", requireAuth, ownerOnly, relay("summary", "GET"));
router.put("/owner/og-store/routing", requireAuth, ownerOnly, relay("routing", "PUT"));
router.put("/owner/og-store/tickets", requireAuth, ownerOnly, relay("tickets", "PUT"));
router.put("/owner/og-store/banner", requireAuth, ownerOnly, relay("banner", "PUT"));
router.post("/owner/og-store/test", requireAuth, ownerOnly, relay("test", "POST"));

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const httpsUrl = (v: unknown) => {
  const s = text(v, 500);
  try {
    return s && new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
};

// Posts a store announcement (an embed with link buttons) in up to 5 channels of one server.
router.post("/owner/og-store/post", requireAuth, ownerOnly, async (req: AuthedRequest, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const guildId = text(b.guildId, 20);
  const channelIds = [...new Set((Array.isArray(b.channelIds) ? b.channelIds : []).map(String).filter((id) => SNOWFLAKE.test(id)))].slice(0, 5);
  const title = text(b.title, 256);
  const description = text(b.description, 4000);
  if (!SNOWFLAKE.test(guildId)) return res.status(400).json({ error: "Pick a server first." });
  if (!channelIds.length) return res.status(400).json({ error: "Pick at least one channel." });
  if (!title && !description) return res.status(400).json({ error: "Add a title or a message." });

  const inServer = new Set((await getGuildChannels(guildId).catch(() => [])).map((c) => c.id));
  if (channelIds.some((id) => !inServer.has(id))) return res.status(400).json({ error: "One of those channels isn't in this server. Reload and pick again." });

  const ping = text(b.ping, 20);
  const pingRole = SNOWFLAKE.test(ping) ? ping : null;
  const content = ping === "here" ? "@here" : pingRole ? `<@&${pingRole}>` : undefined;
  const fields = (Array.isArray(b.fields) ? b.fields : [])
    .slice(0, 3)
    .map((f) => ({ name: text((f as Record<string, unknown>)?.name, 256), value: text((f as Record<string, unknown>)?.value, 1024), inline: true }))
    .filter((f) => f.name && f.value);
  const buttons = (Array.isArray(b.buttons) ? b.buttons : [])
    .slice(0, 3)
    .map((x) => ({ label: text((x as Record<string, unknown>)?.label, 80), url: httpsUrl((x as Record<string, unknown>)?.url) }))
    .filter((x): x is { label: string; url: string } => !!x.label && !!x.url);
  const image = httpsUrl(b.image);
  const payload = {
    content,
    embeds: [
      {
        title: title || undefined,
        description: description || undefined,
        url: httpsUrl(b.url) ?? undefined,
        color: 0xe7bb5f,
        fields,
        thumbnail: image ? { url: image } : undefined,
        footer: { text: `Outpost Gaming Store · ${storeUrl().replace(/^https:\/\//, "")}` },
      },
    ],
    components: buttons.length ? [{ type: 1, components: buttons.map((x) => ({ type: 2, style: 5, label: x.label, url: x.url })) }] : [],
    allowed_mentions: { parse: ping === "here" ? ["everyone"] : [], roles: pingRole ? [pingRole] : [] },
  };

  const errors: string[] = [];
  let posted = 0;
  for (const id of channelIds) {
    const r = await postChannelMessage(id, payload);
    if (r.error) errors.push(`<#${id}>: ${r.error.includes("Missing Permissions") || r.error.includes("50013") ? "Spartacus can't post there (needs Send Messages and Embed Links)." : "Discord refused the post."}`);
    else posted++;
  }
  res.status(posted ? 200 : 400).json({ posted, errors, ...(posted ? {} : { error: errors[0] ?? "Nothing was posted." }) });
});

export default router;
