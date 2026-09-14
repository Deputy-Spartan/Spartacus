import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { buildTicketPanelPayload, postChannelMessage, fetchChannelTranscriptText, postTranscriptMessage } from "../lib/discordRest";

const router = Router();

// ---- Panels ----

router.get("/guilds/:guildId/ticket-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.ticketPanel.findMany({ where: { guildId: req.params.guildId } });
  res.json(rows);
});

// Posts (or reposts) a panel's live message immediately via REST, rather than
// leaving it to apps/bot/src/jobs/ticketPanelPoster.ts's once-a-minute tick —
// that job still exists as a fallback for when this immediate post fails
// (e.g. the API process is mid-deploy) or the bot was offline when the panel
// was saved.
async function postPanelNow(panel: { id: string; guildId: string; channelId: string; name: string; description: string | null; buttonLabel: string; layout: string; typeIds: unknown }) {
  const typeIds = Array.isArray(panel.typeIds) ? (panel.typeIds as string[]) : [];
  const types = typeIds.length
    ? await prisma.ticketType.findMany({ where: { id: { in: typeIds }, enabled: true } })
    : [];
  const payload = buildTicketPanelPayload(panel, types);
  const result = await postChannelMessage(panel.channelId, payload);
  if (result.id) {
    await prisma.ticketPanel.update({ where: { id: panel.id }, data: { messageId: result.id } });
  }
  return result;
}

// The dashboard defines where a panel should go and which ticket types it
// offers; postPanelNow() above sends the actual button/dropdown message the
// instant it's created or edited.
router.post("/guilds/:guildId/ticket-panels", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, channelId, layout, typeIds, description, categoryId, buttonLabel, supportRoleId } = req.body;
  const row = await prisma.ticketPanel.create({
    data: {
      guildId: req.params.guildId,
      name,
      channelId,
      layout: layout ?? "BUTTONS",
      typeIds: typeIds ?? [],
      description,
      categoryId,
      buttonLabel: buttonLabel ?? "Open a Ticket",
      supportRoleId,
    },
  });
  const posted = await postPanelNow(row);
  res.status(201).json({ ...row, messageId: posted.id ?? row.messageId, postError: posted.error });
});

router.patch("/guilds/:guildId/ticket-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, layout, typeIds, description, paused, buttonLabel, supportRoleId } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (layout !== undefined) data.layout = layout;
  if (typeIds !== undefined) data.typeIds = typeIds;
  if (description !== undefined) data.description = description;
  if (paused !== undefined) data.paused = paused;
  if (buttonLabel !== undefined) data.buttonLabel = buttonLabel;
  if (supportRoleId !== undefined) data.supportRoleId = supportRoleId;
  // Editing content invalidates the posted message so it gets redrawn.
  if (Object.keys(data).length > 0) data.messageId = null;
  const row = await prisma.ticketPanel.update({ where: { id: req.params.id }, data });
  if (row.messageId === null && !row.paused) {
    const posted = await postPanelNow(row);
    return res.json({ ...row, messageId: posted.id ?? row.messageId, postError: posted.error });
  }
  res.json(row);
});

router.delete("/guilds/:guildId/ticket-panels/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.ticketPanel.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// Resets every panel's counter back to 0 so the next ticket opened on each
// starts renumbering from #1 — doesn't touch existing ticket rows/history.
router.post("/guilds/:guildId/ticket-panels/reset-numbers", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.ticketPanel.updateMany({ where: { guildId: req.params.guildId }, data: { ticketCounter: 0 } });
  res.status(204).send();
});

// ---- Ticket Types ----

router.get("/guilds/:guildId/ticket-types", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.ticketType.findMany({ where: { guildId: req.params.guildId }, orderBy: { createdAt: "asc" } });
  res.json(rows);
});

router.post("/guilds/:guildId/ticket-types", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, emoji, description, categoryId, staffRoleIds, openMessage, modalFields, autoCloseHours, slaMinutes, transcriptChannelId, closeBehavior } = req.body;
  const row = await prisma.ticketType.create({
    data: {
      guildId: req.params.guildId,
      name,
      emoji,
      description,
      categoryId,
      staffRoleIds: staffRoleIds ?? [],
      openMessage,
      modalFields: modalFields ?? [],
      autoCloseHours,
      slaMinutes,
      transcriptChannelId,
      closeBehavior,
    },
  });
  res.status(201).json(row);
});

router.patch("/guilds/:guildId/ticket-types/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const fields = [
    "name",
    "emoji",
    "description",
    "categoryId",
    "staffRoleIds",
    "openMessage",
    "modalFields",
    "autoCloseHours",
    "slaMinutes",
    "enabled",
    "transcriptChannelId",
    "closeBehavior",
  ];
  const data: Record<string, unknown> = {};
  for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
  const row = await prisma.ticketType.update({ where: { id: req.params.id }, data });
  res.json(row);
});

router.delete("/guilds/:guildId/ticket-types/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.ticketType.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Tickets ----

router.get("/guilds/:guildId/tickets", requireAuth, requireGuildPermission, async (req, res) => {
  const { view, search, typeId, priority } = req.query as Record<string, string | undefined>;
  const where: Record<string, unknown> = { guildId: req.params.guildId };

  if (view === "open") where.status = { in: ["OPEN", "CLAIMED"] };
  else if (view === "closed") where.status = "CLOSED";
  // "archived" has no distinct storage yet — closed tickets past their
  // retention window would land here once a cleanup job exists; for now
  // "archived" and "all" both just show every ticket.

  if (typeId) where.typeId = typeId;
  if (priority) where.priority = priority;
  if (search) {
    where.OR = [
      { channelId: { contains: search } },
      { userId: { contains: search } },
      { closeReason: { contains: search, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.ticket.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  res.json(rows);
});

router.get("/guilds/:guildId/tickets/counts", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const [open, claimed, closed] = await Promise.all([
    prisma.ticket.count({ where: { guildId, status: "OPEN" } }),
    prisma.ticket.count({ where: { guildId, status: "CLAIMED" } }),
    prisma.ticket.count({ where: { guildId, status: "CLOSED" } }),
  ]);
  res.json({ open, claimed, closed, archived: 0 });
});

router.patch("/guilds/:guildId/tickets/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { status, claimedById, priority, tags, closeReason } = req.body;
  const data: Record<string, unknown> = {};
  if (status !== undefined) data.status = status;
  if (claimedById !== undefined) data.claimedById = claimedById;
  if (priority !== undefined) data.priority = priority;
  if (tags !== undefined) data.tags = tags;
  if (closeReason !== undefined) data.closeReason = closeReason;
  if (status === "CLOSED") data.closedAt = new Date();
  if (status === "OPEN") data.closedAt = null;
  const row = await prisma.ticket.update({ where: { id: req.params.id }, data });
  res.json(row);
});

// Generates a transcript on demand — works for an open ticket (no need to
// close it first) and lets the destination channel be overridden per call,
// rather than only ever posting where TicketType/TicketSettings say to.
router.post("/guilds/:guildId/tickets/:id/transcript", requireAuth, requireGuildPermission, async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket || ticket.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Ticket not found" });
  }

  const type = ticket.typeId ? await prisma.ticketType.findUnique({ where: { id: ticket.typeId } }) : null;
  const settings = await prisma.ticketSettings.findUnique({ where: { guildId: req.params.guildId } });
  const destChannelId: string = req.body.channelId || type?.transcriptChannelId || settings?.transcriptChannelId || ticket.channelId;

  const { text, error } = await fetchChannelTranscriptText(ticket.channelId);
  if (error || !text) return res.status(422).json({ error: error || "Couldn't read that channel's messages." });

  const posted = await postTranscriptMessage(destChannelId, `📄 Transcript for ticket #${ticket.ticketNumber}`, text);
  if (posted.error) return res.status(422).json({ error: posted.error });

  res.status(201).json({ channelId: destChannelId });
});

// ---- Tags ----

router.get("/guilds/:guildId/ticket-tags", requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await prisma.ticketTag.findMany({ where: { guildId: req.params.guildId } }));
});
router.post("/guilds/:guildId/ticket-tags", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, color } = req.body;
  res.status(201).json(await prisma.ticketTag.create({ data: { guildId: req.params.guildId, name, color: color ?? "#5865F2" } }));
});
router.delete("/guilds/:guildId/ticket-tags/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.ticketTag.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Canned Responses ----

router.get("/guilds/:guildId/ticket-canned-responses", requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await prisma.ticketCannedResponse.findMany({ where: { guildId: req.params.guildId } }));
});
router.post("/guilds/:guildId/ticket-canned-responses", requireAuth, requireGuildPermission, async (req, res) => {
  const { title, content } = req.body;
  res.status(201).json(await prisma.ticketCannedResponse.create({ data: { guildId: req.params.guildId, title, content } }));
});
router.patch("/guilds/:guildId/ticket-canned-responses/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { title, content } = req.body;
  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (content !== undefined) data.content = content;
  res.json(await prisma.ticketCannedResponse.update({ where: { id: req.params.id }, data }));
});
router.delete("/guilds/:guildId/ticket-canned-responses/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.ticketCannedResponse.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Knowledge Bases (Automated Assist) ----

router.get("/guilds/:guildId/ticket-knowledge", requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await prisma.ticketKnowledgeBase.findMany({ where: { guildId: req.params.guildId } }));
});
router.post("/guilds/:guildId/ticket-knowledge", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, content } = req.body;
  res.status(201).json(await prisma.ticketKnowledgeBase.create({ data: { guildId: req.params.guildId, name, content } }));
});
router.patch("/guilds/:guildId/ticket-knowledge/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const { name, content } = req.body;
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (content !== undefined) data.content = content;
  res.json(await prisma.ticketKnowledgeBase.update({ where: { id: req.params.id }, data }));
});
router.delete("/guilds/:guildId/ticket-knowledge/:id", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.ticketKnowledgeBase.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// ---- Settings ----

const DEFAULT_SETTINGS = {
  logChannelId: null as string | null,
  transcriptChannelId: null as string | null,
  closeBehavior: "DELETE_AND_DM" as "DELETE_AND_DM" | "POST_ONLY",
  channelNameFormat: "ticket-{user}",
  ticketCap: 0,
  requireCloseReason: false,
  supportRoleIds: [] as string[],
  blacklistUserIds: [] as string[],
  blacklistRoleIds: [] as string[],
};
const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[];

router.get("/guilds/:guildId/ticket-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.ticketSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json(row ?? { guildId: req.params.guildId, ...DEFAULT_SETTINGS });
});

router.put("/guilds/:guildId/ticket-settings", requireAuth, requireGuildPermission, async (req, res) => {
  const data: Record<string, unknown> = {};
  for (const key of SETTINGS_KEYS) if (req.body[key] !== undefined) data[key] = req.body[key];
  const row = await prisma.ticketSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...DEFAULT_SETTINGS, ...data },
    update: data,
  });
  res.json(row);
});

router.post("/guilds/:guildId/ticket-settings/reset", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.ticketSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...DEFAULT_SETTINGS },
    update: DEFAULT_SETTINGS,
  });
  res.json(row);
});

// ---- Analytics ----

router.get("/guilds/:guildId/ticket-analytics", requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const windowDays = Number(req.query.days) || 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [opened, closed, currentlyOpen, allTypes, closedInWindow] = await Promise.all([
    prisma.ticket.count({ where: { guildId, createdAt: { gte: since } } }),
    prisma.ticket.count({ where: { guildId, closedAt: { gte: since } } }),
    prisma.ticket.count({ where: { guildId, status: { in: ["OPEN", "CLAIMED"] } } }),
    prisma.ticketType.findMany({ where: { guildId } }),
    prisma.ticket.findMany({ where: { guildId, closedAt: { gte: since } }, select: { closedAt: true, createdAt: true, typeId: true, claimedById: true, feedbackRating: true } }),
  ]);

  const byType = allTypes.map((t) => ({
    typeId: t.id,
    name: t.name,
    count: closedInWindow.filter((c) => c.typeId === t.id).length,
  }));

  const resolutionMs = closedInWindow
    .filter((c) => c.closedAt)
    .map((c) => new Date(c.closedAt as Date).getTime() - new Date(c.createdAt).getTime());
  const avgResolutionMs = resolutionMs.length ? resolutionMs.reduce((a, b) => a + b, 0) / resolutionMs.length : null;

  const claimCounts = new Map<string, number>();
  for (const c of closedInWindow) {
    if (!c.claimedById) continue;
    claimCounts.set(c.claimedById, (claimCounts.get(c.claimedById) ?? 0) + 1);
  }
  const staffLeaderboard = [...claimCounts.entries()]
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const ratings = closedInWindow.filter((c) => c.feedbackRating != null).map((c) => c.feedbackRating as number);
  const avgFeedback = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  res.json({
    opened,
    closed,
    currentlyOpen,
    avgFirstResponseMs: null,
    avgResolutionMs,
    byType,
    staffLeaderboard,
    avgFeedback,
    feedbackCount: ratings.length,
  });
});

export default router;
