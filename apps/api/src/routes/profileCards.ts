import { Router } from "express";
import { prisma } from "@spartacus/db";
import { DEFAULT_PROFILE_STATS, PROFILE_PANEL_DEFAULTS, cleanProfileStats } from "@spartacus/shared";
import { deleteChannelMessage } from "../lib/discordRest";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();

type Settings = Awaited<ReturnType<typeof prisma.profileCardSettings.findUnique>>;
function view(s: Settings, panelError: string | null = null) {
  return {
    stats: s ? cleanProfileStats(s.stats) : DEFAULT_PROFILE_STATS,
    allowBios: s?.allowBios ?? true,
    panelChannelId: s?.panelChannelId ?? null,
    panelPosted: !!s?.panelMessageId,
    panelTitle: s?.panelTitle || PROFILE_PANEL_DEFAULTS.panelTitle,
    panelText: s?.panelText || PROFILE_PANEL_DEFAULTS.panelText,
    panelColor: s?.panelColor || PROFILE_PANEL_DEFAULTS.panelColor,
    panelPublic: s?.panelPublic ?? false,
    panelError,
  };
}

router.get("/guilds/:guildId/profile-cards", requireAuth, requireGuildPermission, async (req, res) => {
  res.json(view(await prisma.profileCardSettings.findUnique({ where: { guildId: req.params.guildId } })));
});

router.put("/guilds/:guildId/profile-cards", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const before = await prisma.profileCardSettings.findUnique({ where: { guildId } });
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const data = {
    stats: cleanProfileStats(b.stats),
    allowBios: b.allowBios !== false,
    panelChannelId: str(b.panelChannelId, 30) || null,
    panelTitle: str(b.panelTitle, 256) || null,
    panelText: str(b.panelText, 4000) || null,
    panelColor: /^#[0-9a-f]{6}$/i.test(str(b.panelColor, 7)) ? str(b.panelColor, 7) : null,
    panelPublic: b.panelPublic === true,
  };
  // A new channel or new panel wording replaces the posted panel.
  const panelChanged =
    data.panelChannelId !== (before?.panelChannelId ?? null) ||
    (data.panelTitle ?? "") !== (before?.panelTitle ?? "") ||
    (data.panelText ?? "") !== (before?.panelText ?? "") ||
    (data.panelColor ?? "") !== (before?.panelColor ?? "");
  const repost = b.repost === true;
  if ((panelChanged || repost) && before?.panelChannelId && before.panelMessageId) {
    await deleteChannelMessage(before.panelChannelId, before.panelMessageId).catch(() => null);
  }
  const panelMessageId = panelChanged || repost ? null : (before?.panelMessageId ?? null);
  let s = await prisma.profileCardSettings.upsert({
    where: { guildId },
    create: { guildId, ...data, panelMessageId },
    update: { ...data, panelMessageId },
  });
  // Post it now rather than on the next minute's check.
  let panelError: string | null = null;
  const client = getBotClient();
  if (client && s.panelChannelId && !s.panelMessageId) {
    const { postProfilePanel } = await import("@spartacus/bot");
    panelError = await postProfilePanel(client, guildId).catch((e: Error) => e.message);
    s = (await prisma.profileCardSettings.findUnique({ where: { guildId } })) ?? s;
  }
  res.json(view(s, panelError));
});

// The signed-in person's own card in this server, as /profile would draw it.
router.get("/guilds/:guildId/profile-cards/preview", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const client = getBotClient();
  const guild = client?.guilds.cache.get(req.params.guildId);
  const userId = req.user?.id ?? req.session?.id;
  if (!guild || !userId) return res.status(503).json({ error: "The bot isn't connected to this server right now." });
  try {
    const { renderProfile } = await import("@spartacus/bot");
    const png = await renderProfile(guild, userId);
    res.set("Content-Type", "image/png").set("Cache-Control", "no-store").send(png);
  } catch (err) {
    res.status(500).json({ error: "Couldn't draw the card: " + (err instanceof Error ? err.message : "unknown error") });
  }
});

export default router;
