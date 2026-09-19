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

router.get("/guilds/:guildId/embed-creator/presets", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.embedCreatorPreset.findMany({ where: { guildId: req.params.guildId }, orderBy: { name: "asc" } });
  res.json(rows);
});

router.post("/guilds/:guildId/embed-creator/presets", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, data } = req.body as { name: string; data: unknown };
  if (!name || !name.trim()) return res.status(400).json({ error: "Preset name is required." });

  const row = await prisma.embedCreatorPreset.upsert({
    where: { guildId_name: { guildId: req.params.guildId, name: name.trim() } },
    create: { guildId: req.params.guildId, name: name.trim(), data: data as object },
    update: { data: data as object },
  });
  const sync = await syncPresetUsage(req.params.guildId, row.id).catch(() => ({ updated: 0, failed: 0, places: [] as string[] }));
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
