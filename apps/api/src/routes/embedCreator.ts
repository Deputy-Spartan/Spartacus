import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import {
  postChannelMessage,
  editChannelMessage,
  getChannelMessage,
  executeWebhook,
  editWebhookMessage,
  getWebhookMessage,
  parseMessageLink,
  parseWebhookUrl,
} from "../lib/discordRest";
import { syncPresetUsage } from "../lib/embedSync";
import { buildMessagePayload, type BuilderEmbed, type BuilderComponentRow } from "../lib/embedCreatorPayload";

const router = Router();

interface SendBody {
  mode: "bot" | "webhook";
  channelId?: string;
  webhookUrl?: string;
  profileName?: string;
  profileAvatar?: string;
  content?: string;
  embeds?: BuilderEmbed[];
  components?: BuilderComponentRow[];
  presetId?: string; // when sending/updating from a saved preset in the library, records where it landed
}

async function recordLastSent(guildId: string, presetId: string | undefined, fields: { mode: string; channelId?: string; webhookUrl?: string; messageId: string }) {
  if (!presetId) return;
  const preset = await prisma.embedCreatorPreset.findUnique({ where: { id: presetId } });
  if (!preset || preset.guildId !== guildId) return;
  await prisma.embedCreatorPreset.update({
    where: { id: presetId },
    data: {
      lastSentMode: fields.mode,
      lastSentChannelId: fields.channelId ?? null,
      lastSentWebhookUrl: fields.webhookUrl ?? null,
      lastSentMessageId: fields.messageId,
    },
  });
}

// The library: embeds people saved themselves. A module's own embed (built
// with "Build here" on that module's page) has an ownerKey and stays out.
router.get("/guilds/:guildId/embed-creator/presets", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.embedCreatorPreset.findMany({ where: { guildId: req.params.guildId, ownerKey: null }, orderBy: { name: "asc" } });
  res.json(rows);
});

// One saved embed by id, library or module-owned (for previews).
router.get("/guilds/:guildId/embed-creator/presets/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.embedCreatorPreset.findUnique({ where: { id: req.params.id } });
  if (!row || row.guildId !== req.params.guildId) return res.status(404).json({ error: "That saved embed was deleted." });
  res.json(row);
});

// ---- A module's own embed ("Build here") ----
// key looks like "welcome:join" or "ticketPanel:<id>".
const OWNER_KEY = /^[a-z0-9][a-z0-9:._-]{0,119}$/i;

// The module's own embed, plus whichever embed the module points at now
// (`current`), so the page knows if it's using its own or a library one.
router.get("/guilds/:guildId/module-embeds", requireAuth, requireGuildPermission, async (req, res) => {
  const key = String(req.query.key ?? "");
  const currentId = req.query.current ? String(req.query.current) : null;
  if (!OWNER_KEY.test(key)) return res.status(400).json({ error: "Bad key." });
  const guildId = req.params.guildId;
  let own = await prisma.embedCreatorPreset.findUnique({ where: { guildId_ownerKey: { guildId, ownerKey: key } } });
  const current = currentId ? await prisma.embedCreatorPreset.findUnique({ where: { id: currentId } }) : null;
  // A row made before it had an id (a new panel, say) keeps the embed it was built with.
  if (!own && current && current.guildId === guildId && current.ownerKey) own = current;
  res.json({ own, current: current && current.guildId === guildId ? current : null });
});

router.put("/guilds/:guildId/module-embeds", requireAuth, requireGuildPermission, async (req, res) => {
  const { key, data, id } = req.body as { key?: string; data?: unknown; id?: string };
  const guildId = req.params.guildId;
  if (!key || !OWNER_KEY.test(key)) return res.status(400).json({ error: "Bad key." });
  if (!data || typeof data !== "object") return res.status(400).json({ error: "Nothing to save." });
  if (JSON.stringify(data).length > 200_000) return res.status(400).json({ error: "That message is too big to save." });

  // Editing the embed found through `current` (see above) keeps its own key.
  const existing = id ? await prisma.embedCreatorPreset.findUnique({ where: { id } }) : null;
  const row =
    existing && existing.guildId === guildId && existing.ownerKey
      ? await prisma.embedCreatorPreset.update({ where: { id: existing.id }, data: { data: data as object } })
      : await prisma.embedCreatorPreset.upsert({
          where: { guildId_ownerKey: { guildId, ownerKey: key } },
          create: { guildId, ownerKey: key, name: `module:${key}`, data: data as object },
          update: { data: data as object },
        });
  const sync = await syncPresetUsage(guildId, row.id).catch(() => ({ updated: 0, failed: 0, places: [] as string[], failures: [] as string[] }));
  res.json({ ...row, sync });
});

// "Save this to my library": copies a module's embed into the library under a free name.
router.post("/guilds/:guildId/module-embeds/to-library", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, data } = req.body as { name?: string; data?: unknown };
  const guildId = req.params.guildId;
  if (!data || typeof data !== "object") return res.status(400).json({ error: "Nothing to save." });
  const base = (name ?? "").trim().slice(0, 90) || "Module embed";
  let free = base;
  for (let n = 2; await prisma.embedCreatorPreset.findUnique({ where: { guildId_name: { guildId, name: free } } }); n++) free = `${base} (${n})`;
  const row = await prisma.embedCreatorPreset.create({ data: { guildId, name: free, data: data as object } });
  res.status(201).json(row);
});

router.post("/guilds/:guildId/embed-creator/presets", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, data } = req.body as { name: string; data: unknown };
  if (!name || !name.trim()) return res.status(400).json({ error: "Preset name is required." });
  if (/^module:/i.test(name.trim())) return res.status(400).json({ error: "Names can't start with “module:”. Pick another name." });

  const row = await prisma.embedCreatorPreset.upsert({
    where: { guildId_name: { guildId: req.params.guildId, name: name.trim() } },
    create: { guildId: req.params.guildId, name: name.trim(), data: data as object },
    update: { data: data as object },
  });
  const sync = await syncPresetUsage(req.params.guildId, row.id).catch(() => ({ updated: 0, failed: 0, places: [] as string[], failures: [] as string[] }));
  res.status(201).json({ ...row, sync });
});

router.delete("/guilds/:guildId/embed-creator/presets/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.embedCreatorPreset.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Preset not found" });
  }
  await prisma.embedCreatorPreset.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

router.post("/guilds/:guildId/embed-creator/send", requireAuth, requireGuildPermission, async (req, res) => {
  const body = req.body as SendBody;
  const payload = await buildMessagePayload(req.params.guildId, body);
  if (!payload.content && !payload.embeds && !payload.components) {
    return res.status(400).json({ error: "Nothing to send — add message content, at least one embed, or a component." });
  }

  if (body.mode === "webhook") {
    if (!body.webhookUrl || !parseWebhookUrl(body.webhookUrl)) {
      return res.status(400).json({ error: "That doesn't look like a valid Discord webhook URL." });
    }
    const result = await executeWebhook(body.webhookUrl, {
      ...payload,
      username: body.profileName || undefined,
      avatar_url: body.profileAvatar || undefined,
    });
    if ("error" in result && result.error) return res.status(502).json({ error: `Discord rejected this message: ${result.error}` });
    if (result.id) await recordLastSent(req.params.guildId, body.presetId, { mode: "webhook", webhookUrl: body.webhookUrl, messageId: result.id });
    return res.status(201).json({ id: result.id });
  }

  if (!body.channelId) return res.status(400).json({ error: "Pick a channel to send to." });
  const result = await postChannelMessage(body.channelId, payload);
  if ("error" in result && result.error) return res.status(502).json({ error: `Discord rejected this message: ${result.error}` });
  if (result.id) await recordLastSent(req.params.guildId, body.presetId, { mode: "bot", channelId: body.channelId, messageId: result.id });
  res.status(201).json({ id: result.id });
});

router.post("/guilds/:guildId/embed-creator/fetch", requireAuth, requireGuildPermission, async (req, res) => {
  const { messageLink, webhookUrl } = req.body as { messageLink: string; webhookUrl?: string };
  const parsed = parseMessageLink(messageLink || "");
  if (!parsed) return res.status(400).json({ error: "That doesn't look like a Discord message link." });

  // Bot-mode fetch reads through the bot's own guild access, so it must be
  // scoped to the guild this dashboard session actually has permission on —
  // otherwise a message link from any server would let someone read a
  // message from a server they have no access to here.
  let raw;
  if (webhookUrl) {
    raw = await getWebhookMessage(webhookUrl, parsed.messageId);
  } else {
    if (parsed.guildId !== req.params.guildId) {
      return res.status(403).json({ error: "That message link isn't from this server." });
    }
    raw = await getChannelMessage(parsed.channelId, parsed.messageId);
  }
  if ("error" in raw) return res.status(502).json({ error: `Couldn't fetch that message: ${raw.error}` });

  res.json({
    channelId: raw.channel_id,
    messageId: raw.id,
    content: raw.content || "",
    embeds: (raw.embeds || []).map((e: any) => ({
      authorName: e.author?.name || "",
      authorIconUrl: e.author?.icon_url || "",
      authorUrl: e.author?.url || "",
      title: e.title || "",
      titleUrl: e.url || "",
      description: e.description || "",
      color: typeof e.color === "number" ? "#" + e.color.toString(16).padStart(6, "0") : "#7B99BC",
      thumbnailUrl: e.thumbnail?.url || "",
      imageUrl: e.image?.url || "",
      fields: (e.fields || []).map((f: any) => ({ name: f.name, value: f.value, inline: !!f.inline })),
      footerText: e.footer?.text || "",
      footerIconUrl: e.footer?.icon_url || "",
      timestamp: !!e.timestamp,
    })),
  });
});

router.patch("/guilds/:guildId/embed-creator/update", requireAuth, requireGuildPermission, async (req, res) => {
  const body = req.body as SendBody & { channelId?: string; messageId: string };
  if (!body.messageId) return res.status(400).json({ error: "Missing message id." });
  const payload = await buildMessagePayload(req.params.guildId, body);

  if (body.mode === "webhook") {
    if (!body.webhookUrl || !parseWebhookUrl(body.webhookUrl)) {
      return res.status(400).json({ error: "That doesn't look like a valid Discord webhook URL." });
    }
    const result = await editWebhookMessage(body.webhookUrl, body.messageId, payload);
    if (result.error) return res.status(502).json({ error: `Discord rejected the update: ${result.error}` });
    await recordLastSent(req.params.guildId, body.presetId, { mode: "webhook", webhookUrl: body.webhookUrl, messageId: body.messageId });
    return res.json({ ok: true });
  }

  if (!body.channelId) return res.status(400).json({ error: "Missing channel id." });
  const result = await editChannelMessage(body.channelId, body.messageId, payload);
  if (result.error) return res.status(502).json({ error: `Discord rejected the update: ${result.error}` });
  await recordLastSent(req.params.guildId, body.presetId, { mode: "bot", channelId: body.channelId, messageId: body.messageId });
  res.json({ ok: true });
});

export default router;
