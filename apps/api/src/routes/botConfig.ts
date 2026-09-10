import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { getBotUser, updateBotApplication, updateBotUser } from "../lib/discordRest";

const router = Router();

const SINGLETON_ID = "singleton";

// Account-wide bot identity (username/avatar/status/description) — not
// guild-scoped, so this only requires being logged in, not managing any
// particular server.
router.get("/bot-config", requireAuth, async (_req, res) => {
  const row = await prisma.botConfig.findUnique({ where: { id: SINGLETON_ID } });
  const discordUser = await getBotUser();

  res.json({
    id: SINGLETON_ID,
    clientId: discordUser?.id ?? null, // a bot's Discord user id doubles as its OAuth2 application/client id
    username: discordUser?.username ?? row?.username ?? null,
    avatarUrl: discordUser?.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
    description: row?.description ?? null,
    statusType: row?.statusType ?? "online",
    activityType: row?.activityType ?? "PLAYING",
    activityText: row?.activityText ?? null,
    manualStatusOverride: row?.manualStatusOverride ?? null,
    manualStatusMessage: row?.manualStatusMessage ?? null,
  });
});

router.put("/bot-config", requireAuth, async (req, res) => {
  const { username, avatarDataUri, description, statusType, activityType, activityText, manualStatusOverride, manualStatusMessage } = req.body as {
    username?: string;
    avatarDataUri?: string;
    description?: string;
    statusType?: string;
    activityType?: string;
    activityText?: string;
    manualStatusOverride?: string | null;
    manualStatusMessage?: string | null;
  };

  const VALID_OVERRIDES = new Set(["ONLINE", "OFFLINE", "MAINTENANCE"]);
  if (manualStatusOverride !== undefined && manualStatusOverride !== null && !VALID_OVERRIDES.has(manualStatusOverride)) {
    return res.status(400).json({ error: "Invalid manualStatusOverride" });
  }

  const errors: string[] = [];

  if (username || avatarDataUri) {
    const result = await updateBotUser({
      ...(username ? { username } : {}),
      ...(avatarDataUri ? { avatar: avatarDataUri } : {}),
    });
    if (result.error) errors.push(`Discord rejected the username/avatar update: ${result.error}`);
  }

  if (description !== undefined) {
    const result = await updateBotApplication({ description });
    if (result.error) errors.push(`Discord rejected the description update: ${result.error}`);
  }

  const row = await prisma.botConfig.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      username: username ?? null,
      description: description ?? null,
      statusType: statusType ?? "online",
      activityType: activityType ?? "PLAYING",
      activityText: activityText ?? null,
      manualStatusOverride: manualStatusOverride ?? null,
      manualStatusMessage: manualStatusMessage ?? null,
    },
    update: {
      ...(username !== undefined ? { username } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(statusType !== undefined ? { statusType } : {}),
      ...(activityType !== undefined ? { activityType } : {}),
      ...(activityText !== undefined ? { activityText } : {}),
      ...(manualStatusOverride !== undefined ? { manualStatusOverride } : {}),
      ...(manualStatusMessage !== undefined ? { manualStatusMessage } : {}),
    },
  });

  res.json({ config: row, errors });
});

export default router;
