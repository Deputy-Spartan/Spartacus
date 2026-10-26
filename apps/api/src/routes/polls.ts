import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";

const router = Router();

router.get("/guilds/:guildId/polls", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.poll.findMany({
    where: { guildId: req.params.guildId },
    include: { votes: true, writeIns: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(rows);
});

// The bot's pollPoster job picks up any row with messageId still null and
// posts it within a few seconds — this just schedules it, same pattern as
// giveaways/reaction role panels.
router.post("/guilds/:guildId/polls", requireAuth, requireGuildPermission, async (req, res) => {
  const {
    channelId,
    question,
    options,
    emojis,
    pollType,
    allowMultiselect,
    color,
    barColor,
    barColorSecondary,
    resultsStyle,
    barStyle,
    isPrivate,
    durationMode,
    hours,
    minutes,
    allowWriteIn,
  } = req.body as {
    channelId: string;
    question: string;
    options: string[];
    emojis: string[];
    pollType?: "CUSTOM" | "NATIVE";
    allowMultiselect?: boolean;
    color?: string;
    barColor?: string;
    barColorSecondary?: string;
    resultsStyle?: "BARS" | "SIMPLE";
    barStyle?: "SQUARE" | "BLOCK" | "CIRCLE" | "CLASSIC" | "SOLID";
    isPrivate?: boolean;
    durationMode: "TIMER" | "MANUAL";
    hours?: number;
    minutes?: number;
    allowWriteIn?: boolean;
  };

  if (!channelId || !question?.trim() || !Array.isArray(options) || options.length < 2 || options.length !== emojis?.length) {
    return res.status(400).json({ error: "A channel, a question, and at least 2 options each with their own emoji are required." });
  }
  if (new Set(emojis).size !== emojis.length) {
    return res.status(400).json({ error: "Each option needs a different emoji." });
  }

  const isNative = pollType === "NATIVE";
  // Discord's native polls always require a duration — up to 32 days
  // (768 hours) — there's no "manual stop only" option for them.
  const effectiveDurationMode = isNative ? "TIMER" : durationMode;

  let endsAt: Date | null = null;
  if (effectiveDurationMode === "TIMER") {
    const ms = ((hours ?? 0) * 60 + (minutes ?? 0)) * 60_000;
    if (ms <= 0) return res.status(400).json({ error: "Set a timer duration greater than zero, or switch to manual stop." });
    if (isNative && ms > 768 * 3_600_000) {
      return res.status(400).json({ error: "Native Discord polls can run at most 768 hours (32 days)." });
    }
    endsAt = new Date(Date.now() + ms);
  }

  const row = await prisma.poll.create({
    data: {
      guildId: req.params.guildId,
      channelId,
      question: question.trim(),
      options,
      emojis,
      pollType: isNative ? "NATIVE" : "CUSTOM",
      allowMultiselect: isNative ? !!allowMultiselect : false,
      color: color || "#00E5FF",
      barColor: barColor || "#00E5FF",
      barColorSecondary: barColorSecondary || "#99AAB5",
      resultsStyle: resultsStyle || "BARS",
      barStyle: barStyle || "SQUARE",
      isPrivate: !!isPrivate,
      durationMode: effectiveDurationMode,
      endsAt,
      allowWriteIn: isNative ? false : !!allowWriteIn,
    },
  });
  res.status(201).json(row);
});

// Manual stop — the dashboard's own "Stop Now" button. TIMER polls close
// themselves via jobs/pollCloser.ts; this is the only way a MANUAL poll
// ever closes. (NATIVE polls always require a duration, so this is really
// only reachable for CUSTOM polls — kept generic in case that changes.)
router.post("/guilds/:guildId/polls/:id/stop", requireAuth, requireGuildPermission, async (req, res) => {
  const poll = await prisma.poll.findUnique({ where: { id: req.params.id } });
  if (!poll || poll.guildId !== req.params.guildId) return res.status(404).json({ error: "Poll not found" });
  if (poll.closed) return res.json(poll);

  const row = await prisma.poll.update({ where: { id: poll.id }, data: { closed: true, closedAt: new Date() } });

  // Reveal the final embed right away instead of waiting on pollCloser's
  // minute tick, which only ever picks up TIMER polls anyway.
  const client = getBotClient();
  if (client && row.messageId) {
    const channel = await client.channels.fetch(row.channelId).catch(() => null);
    const message = channel && "messages" in channel ? await channel.messages.fetch(row.messageId).catch(() => null) : null;
    if (message) {
      const { renderPollEmbed, announcePollClosed } = await import("@spartacus/bot");
      if (row.pollType === "NATIVE") {
        if (message.poll) await message.poll.end().catch(() => null);
      } else {
        const embed = await renderPollEmbed(row);
        await message.edit({ embeds: [embed] }).catch(() => null);
      }
      await announcePollClosed(message);
    }
  }

  res.json(row);
});

router.delete("/guilds/:guildId/polls/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const poll = await prisma.poll.findUnique({ where: { id: req.params.id } });
  if (!poll || poll.guildId !== req.params.guildId) return res.status(404).json({ error: "Poll not found" });
  await prisma.poll.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
