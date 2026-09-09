import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { buildRestMessagePayload, postChannelMessage } from "../lib/discordRest";

const router = Router();

// Standalone "compose and post a message right now" tool (Event
// Scheduler's Create Embed tab) — not tied to any saved record, so this
// is a single fire-and-forget REST call rather than a CRUD resource.
router.post("/guilds/:guildId/send-message", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, content, embedEnabled, embedTitle, embedDescription, embedColor, buttons } = req.body as {
    channelId: string;
    content?: string;
    embedEnabled?: boolean;
    embedTitle?: string;
    embedDescription?: string;
    embedColor?: string;
    buttons?: Array<{ label: string; url: string }>;
  };

  if (!channelId) return res.status(400).json({ error: "channelId is required" });

  const payload = buildRestMessagePayload({ content, embedEnabled, embedTitle, embedDescription, embedColor, buttons });
  const result = await postChannelMessage(channelId, payload);

  if (result.error) return res.status(502).json({ error: result.error });
  res.status(201).json({ ok: true });
});

export default router;
