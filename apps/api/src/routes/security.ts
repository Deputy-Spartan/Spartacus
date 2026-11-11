import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { HONEYPOT_ACTIONS, HONEYPOT_COUNTER_SCOPES, type HoneypotAction, type HoneypotCounterScope } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission, requireGuildOwner } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();

// --- Verification ---
// Fields the dashboard may set, by kind, so nothing else can be written.
const V_TEXT = [
  "verifiedRoleId", "panelChannelId", "savedEmbedId", "defaultEmbedTitle", "defaultEmbedDescription", "embedColor", "buttonLabel", "buttonEmoji",
  "accountTooNewMessage", "noAvatarMessage", "unverifiedRoleId", "logChannelId", "dmConfirmMessage", "reminderMessage", "kickMessage",
  "verifiedReply", "alreadyVerifiedReply", "noRoleReply", "captchaPrompt", "captchaWrongReply",
] as const;
const V_BOOL = ["requireAvatar", "giveUnverifiedOnJoin", "dmConfirmEnabled", "reminderEnabled", "kickEnabled"] as const;
const V_INT: Record<string, [number, number]> = { minAccountAgeDays: [0, 365], maxFailures: [0, 10], reminderDelayHours: [1, 336], kickAfterHours: [1, 720] };
// Changing any of these redraws the panel.
const V_PANEL = ["panelChannelId", "savedEmbedId", "defaultEmbedTitle", "defaultEmbedDescription", "embedColor", "buttonLabel", "buttonEmoji"];

function verificationData(body: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const k of V_TEXT) if (k in body) data[k] = typeof body[k] === "string" && (body[k] as string).trim() ? (body[k] as string).slice(0, 2000) : null;
  for (const k of V_BOOL) if (typeof body[k] === "boolean") data[k] = body[k];
  for (const [k, [lo, hi]] of Object.entries(V_INT)) if (k in body && Number.isFinite(Number(body[k]))) data[k] = Math.min(hi, Math.max(lo, Math.round(Number(body[k]))));
  if (body.method === "BUTTON" || body.method === "CAPTCHA") data.method = body.method;
  if (body.failAction === "NONE" || body.failAction === "KICK") data.failAction = body.failAction;
  return data;
}

// Deletes the old panel and posts the current one.
async function repostVerificationPanel(guildId: string, old?: { panelChannelId: string | null; panelMessageId: string | null } | null) {
  const client = getBotClient();
  if (!client) return false;
  if (old?.panelMessageId && old.panelChannelId) {
    const oldChannel = await client.channels.fetch(old.panelChannelId).catch(() => null);
    if (oldChannel?.isTextBased()) await oldChannel.messages.delete(old.panelMessageId).catch(() => null);
  }
  const config = await prisma.verificationConfig.update({ where: { guildId }, data: { panelMessageId: null } });
  if (!config.panelChannelId) return false;
  const { postVerificationPanel } = await import("@spartacus/bot");
  return postVerificationPanel(client, config).catch(() => false);
}

// Redraws a moment after the last change, so typing doesn't repost each keystroke.
const panelTimers = new Map<string, ReturnType<typeof setTimeout>>();
function repostSoon(guildId: string, old: { panelChannelId: string | null; panelMessageId: string | null } | null) {
  const pendingOld = panelTimers.has(guildId) ? null : old;
  clearTimeout(panelTimers.get(guildId));
  panelTimers.set(
    guildId,
    setTimeout(async () => {
      panelTimers.delete(guildId);
      const current = await prisma.verificationConfig.findUnique({ where: { guildId } });
      // Delete whichever message is up now (the old channel's if it moved).
      await repostVerificationPanel(guildId, pendingOld?.panelMessageId ? pendingOld : current).catch(() => null);
    }, 1500),
  );
}

router.get("/guilds/:guildId/verification", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.verificationConfig.findUnique({ where: { guildId: req.params.guildId } });
  const pending = await prisma.verificationPendingMember.count({ where: { guildId: req.params.guildId } });
  res.json({
    ...(config ?? {
      guildId: req.params.guildId,
      verifiedRoleId: null,
      minAccountAgeDays: 0,
      panelChannelId: null,
      panelMessageId: null,
      savedEmbedId: null,
      method: "BUTTON",
      maxFailures: 3,
      failAction: "NONE",
      requireAvatar: false,
      giveUnverifiedOnJoin: false,
      dmConfirmEnabled: false,
      reminderEnabled: false,
      reminderDelayHours: 24,
      kickEnabled: false,
      kickAfterHours: 48,
    }),
    pendingCount: pending,
  });
});

router.put("/guilds/:guildId/verification", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const data = verificationData(req.body ?? {});
  const existing = await prisma.verificationConfig.findUnique({ where: { guildId } });
  const config = await prisma.verificationConfig.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });

  const panelChanged = V_PANEL.some((k) => k in data && (existing as Record<string, unknown> | null)?.[k] !== data[k]);
  if (panelChanged && (config.panelChannelId || existing?.panelMessageId)) {
    if (!config.panelChannelId && existing?.panelMessageId) {
      // Panel switched off: just take the old one down.
      const client = getBotClient();
      const ch = client && existing.panelChannelId ? await client.channels.fetch(existing.panelChannelId).catch(() => null) : null;
      if (ch?.isTextBased()) await ch.messages.delete(existing.panelMessageId).catch(() => null);
      await prisma.verificationConfig.update({ where: { guildId }, data: { panelMessageId: null } });
    } else repostSoon(guildId, existing);
  }
  res.json(config);
});

router.post("/guilds/:guildId/verification/repost", requireAuth, requireGuildPermission, async (req, res) => {
  const existing = await prisma.verificationConfig.findUnique({ where: { guildId: req.params.guildId } });
  if (!existing?.panelChannelId) return res.status(400).json({ error: "Pick a panel channel first." });
  if (!getBotClient()) return res.status(503).json({ error: "The bot isn't connected right now — try again in a moment." });
  const ok = await repostVerificationPanel(req.params.guildId, existing);
  if (!ok) return res.status(502).json({ error: "Spartacus couldn't post in that channel. Check it can see and send messages there." });
  res.json({ ok: true });
});

// Gives the Verified role to everyone already in the server.
router.post("/guilds/:guildId/verification/verify-existing", requireAuth, requireGuildPermission, async (req, res) => {
  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "The bot isn't connected right now — try again in a moment." });
  const { verifyExistingMembers } = await import("@spartacus/bot");
  const result = await verifyExistingMembers(client, req.params.guildId);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

router.get("/guilds/:guildId/verification/logs", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.verificationLog.findMany({ where: { guildId: req.params.guildId }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json(rows);
});

// Owner only, same as the Rules audit trail.
router.delete("/guilds/:guildId/verification/logs", requireAuth, requireGuildPermission, requireGuildOwner, async (req, res) => {
  const result = await prisma.verificationLog.deleteMany({ where: { guildId: req.params.guildId } });
  res.json({ deleted: result.count });
});

// --- Anti-Nuke ---
router.get("/guilds/:guildId/anti-nuke", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.antiNukeConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(
    config ?? {
      guildId: req.params.guildId,
      alertChannelId: null,
      maxBansPerMinute: 3,
      maxChannelDeletesPerMinute: 3,
      stripRolesOnTrigger: true,
    }
  );
});

router.put("/guilds/:guildId/anti-nuke", requireAuth, requireGuildPermission, async (req, res) => {
  const { alertChannelId, maxBansPerMinute, maxChannelDeletesPerMinute, stripRolesOnTrigger } = req.body;
  const config = await prisma.antiNukeConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, alertChannelId, maxBansPerMinute, maxChannelDeletesPerMinute, stripRolesOnTrigger },
    update: { alertChannelId, maxBansPerMinute, maxChannelDeletesPerMinute, stripRolesOnTrigger },
  });
  res.json(config);
});

// --- Honeypot ---
const HONEYPOT_DEFAULTS = {
  channelId: null as string | null,
  action: "BAN",
  timeoutMinutes: 1440,
  deleteMessage: true,
  messageEnabled: false,
  creatorData: null,
  savedEmbedId: null as string | null,
  showCounter: true,
  counterScope: "SERVER",
  showStatsButton: true,
};

router.get("/guilds/:guildId/honeypot", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.honeypotConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(config ?? { guildId: req.params.guildId, ...HONEYPOT_DEFAULTS });
});

router.put("/guilds/:guildId/honeypot", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const body = req.body as Record<string, unknown>;
  const existing = await prisma.honeypotConfig.findUnique({ where: { guildId } });
  const channelId = (body.channelId as string | null) || null;

  // The old message is in the old channel, so it's taken down there before
  // the new one is posted.
  const client = getBotClient();
  if (existing?.messageId && existing.channelId && existing.channelId !== channelId && client) {
    const oldChannel = await client.channels.fetch(existing.channelId).catch(() => null);
    if (oldChannel && "messages" in oldChannel) await oldChannel.messages.delete(existing.messageId).catch(() => null);
  }

  const data = {
    channelId,
    action: HONEYPOT_ACTIONS.includes(body.action as HoneypotAction) ? (body.action as string) : "BAN",
    timeoutMinutes: Math.min(Math.max(Math.round(Number(body.timeoutMinutes)) || 1440, 1), 40320),
    deleteMessage: body.deleteMessage !== false,
    messageEnabled: Boolean(body.messageEnabled),
    creatorData: body.creatorData ? (body.creatorData as Prisma.InputJsonValue) : Prisma.JsonNull,
    savedEmbedId: (body.savedEmbedId as string | null) || null,
    showCounter: body.showCounter !== false,
    counterScope: HONEYPOT_COUNTER_SCOPES.includes(body.counterScope as HoneypotCounterScope) ? (body.counterScope as string) : "SERVER",
    showStatsButton: body.showStatsButton !== false,
    ...(existing && existing.channelId !== channelId ? { messageId: null } : {}),
  };
  const config = await prisma.honeypotConfig.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });

  // Posts, edits or removes the channel's message to match what was saved.
  let messageError: string | null = null;
  if (client) {
    const { syncHoneypotMessage } = await import("@spartacus/bot");
    const result = await syncHoneypotMessage(client, guildId);
    if (!result.ok) messageError = result.error ?? "The message couldn't be posted.";
  }
  const fresh = await prisma.honeypotConfig.findUnique({ where: { guildId } });
  res.json({ ...(fresh ?? config), messageError });
});

// This server's catches and the totals across every server, plus the most
// recent catches here for the dashboard's list.
router.get("/guilds/:guildId/honeypot/stats", requireAuth, requireGuildPermission, async (req, res) => {
  const { guildId } = req.params;
  const { getHoneypotStats } = await import("@spartacus/bot");
  const [stats, recent, byAction] = await Promise.all([
    getHoneypotStats(guildId),
    prisma.honeypotCatch.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.honeypotCatch.groupBy({ by: ["action"], where: { guildId }, _count: { _all: true } }),
  ]);
  res.json({ ...stats, recent, byAction: Object.fromEntries(byAction.map((row) => [row.action, row._count._all])) });
});

// --- Moderation Cases (read history) ---
router.get("/guilds/:guildId/cases", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.moderationCase.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { caseNumber: "desc" },
    take: 100,
  });
  res.json(rows);
});

// Server-owner-only — moderation history is evidence; letting any
// Manage-Server mod erase it would let them cover their own tracks.
router.delete(
  "/guilds/:guildId/cases/:caseNumber",
  requireAuth,
  requireGuildPermission,
  requireGuildOwner,
  async (req, res) => {
    const caseNumber = Number(req.params.caseNumber);
    if (!Number.isInteger(caseNumber)) return res.status(400).json({ error: "Invalid case number" });

    const existing = await prisma.moderationCase.findUnique({
      where: { guildId_caseNumber: { guildId: req.params.guildId, caseNumber } },
    });
    if (!existing) return res.status(404).json({ error: "Case not found" });

    await prisma.moderationCase.delete({ where: { id: existing.id } });
    res.status(204).send();
  }
);

// --- Quarantine (read active records) ---
router.get("/guilds/:guildId/quarantine", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.quarantineRecord.findMany({
    where: { guildId: req.params.guildId, active: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

export default router;
