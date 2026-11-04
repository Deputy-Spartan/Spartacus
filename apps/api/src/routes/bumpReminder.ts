import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { cleanBumpMessages } from "@spartacus/shared";
import { getBotClient } from "../lib/botClient";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

export const MISSED_AFTER_OPTIONS = [5, 10, 15, 30, 60, 90];

// Redraw the live bump message a moment after the last change, so typing
// on the dashboard doesn't edit the Discord message on every keystroke.
const redrawTimers = new Map<string, ReturnType<typeof setTimeout>>();
function redrawSoon(guildId: string) {
  clearTimeout(redrawTimers.get(guildId));
  redrawTimers.set(
    guildId,
    setTimeout(async () => {
      redrawTimers.delete(guildId);
      const client = getBotClient();
      if (!client) return;
      const { refreshBumpStatus } = await import("@spartacus/bot");
      await refreshBumpStatus(client, guildId).catch(() => null);
    }, 1500),
  );
}

router.get("/guilds/:guildId/bump-reminder", requireAuth, requireGuildPermission, async (req, res) => {
  const row = await prisma.bumpReminderSettings.findUnique({ where: { guildId: req.params.guildId } });
  res.json({
    channelId: row?.channelId ?? null,
    mentionRoleId: row?.mentionRoleId ?? null,
    nextReminderAt: row?.nextReminderAt?.toISOString() ?? null,
    lastBumpAt: row?.lastBumpAt?.toISOString() ?? null,
    lastBumpedById: row?.lastBumpedById ?? null,
    missedAlertEnabled: row?.missedAlertEnabled ?? true,
    missedAfterMin: row?.missedAfterMin ?? 30,
    missedAlerts: row?.missedAlerts ?? 0,
    bumpCount: row?.bumpCount ?? 0,
    bumpMessages: cleanBumpMessages(row?.bumpMessages),
  });
});

router.put("/guilds/:guildId/bump-reminder", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, mentionRoleId, missedAlertEnabled, missedAfterMin, bumpMessages } = req.body as {
    bumpMessages?: unknown;
    channelId?: string | null;
    mentionRoleId?: string | null;
    missedAlertEnabled?: boolean;
    missedAfterMin?: number;
  };
  const patch = {
    ...(channelId !== undefined ? { channelId } : {}),
    ...(mentionRoleId !== undefined ? { mentionRoleId } : {}),
    ...(typeof missedAlertEnabled === "boolean" ? { missedAlertEnabled } : {}),
    ...(MISSED_AFTER_OPTIONS.includes(Number(missedAfterMin)) ? { missedAfterMin: Number(missedAfterMin) } : {}),
    ...(bumpMessages !== undefined ? { bumpMessages: cleanBumpMessages(bumpMessages) as unknown as Prisma.InputJsonValue } : {}),
  };

  const row = await prisma.bumpReminderSettings.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, channelId: channelId ?? null, mentionRoleId: mentionRoleId ?? null, ...patch },
    update: patch,
  });

  if (bumpMessages !== undefined || mentionRoleId !== undefined) redrawSoon(req.params.guildId);
  res.json(row);
});

// Send Now on the dashboard. lastBumpAt (optional) lines the timer up with a
// bump Spartacus didn't see; it must be within the last day and not in the future.
router.post("/guilds/:guildId/bump-reminder/send", requireAuth, requireGuildPermission, async (req, res) => {
  const raw = (req.body as { lastBumpAt?: string | null }).lastBumpAt;
  let lastBumpAt: Date | null = null;
  if (raw) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 60_000 || d.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "The last bump time has to be within the last 24 hours." });
    }
    lastBumpAt = d;
  }
  const client = getBotClient();
  if (!client) return res.status(503).json({ error: "The bot isn't connected right now — try again in a moment." });
  const { sendBumpStatusNow } = await import("@spartacus/bot");
  const result = await sendBumpStatusNow(client, req.params.guildId, lastBumpAt);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

export default router;
