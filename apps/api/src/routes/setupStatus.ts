import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

// What each module still needs before it can do its job, as short "do this"
// lines. A module with an empty list is ready. Only the settings a module
// can't work without are checked; everything else is optional.
router.get("/guilds/:guildId/setup-status", requireAuth, requireGuildPermission, async (req: AuthedRequest, res) => {
  const guildId = req.params.guildId;
  const where = { where: { guildId } };
  const [verify, star, streams, streamCount, lobbies, counting, welcome, mm, playing, ticketPanels, bump, birthdays, rules, rolePanels] = await Promise.all([
    prisma.verificationConfig.findUnique(where),
    prisma.starboardConfig.findUnique(where),
    prisma.streamAlertSettings.findUnique(where),
    prisma.streamSubscription.count(where),
    prisma.tempChannelLobby.count(where),
    prisma.countingGameConfig.findUnique(where),
    prisma.welcomeConfig.findUnique(where),
    prisma.matchmakingConfig.findUnique(where),
    prisma.playingNowConfig.findUnique(where),
    prisma.ticketPanel.count(where),
    prisma.bumpReminderSettings.findUnique(where),
    prisma.birthdayConfig.findUnique(where),
    prisma.rulesGateSettings.findUnique(where),
    // Panels come in two kinds: the older reaction panels and the button/dropdown ones.
    Promise.all([prisma.reactionRolePanel.count(where), prisma.rolePanel.count(where)]).then(([a, b]) => a + b),
  ]);
  const need = (...items: Array<[boolean, string]>) => items.filter(([missing]) => missing).map(([, text]) => text);
  const games = Array.isArray(mm?.games) ? mm.games : [];

  res.json({
    VERIFICATION: need([!verify?.panelChannelId, "Pick the channel for the Verify button"], [!verify?.verifiedRoleId, "Pick the role people get when they verify"]),
    STARBOARD: need([!star?.channelId, "Pick the hall-of-fame channel"]),
    STREAM_ALERTS: need([!streams?.defaultChannelId, "Pick the channel for go-live alerts"], [streamCount === 0, "Add a streamer to watch"]),
    TEMP_CHANNELS: need([lobbies === 0, "Add a join-to-create voice channel"]),
    COUNTING_GAME: need([!counting?.channelId, "Pick the counting channel"]),
    WELCOME: need([!welcome?.channelId, "Pick the welcome channel"]),
    MATCHES: need([!mm?.channelId, "Pick the Matchmaking board channel"], [games.length === 0, "Add the game people play"]),
    PLAYING_NOW: need([!playing?.channelId, "Pick the Playing Now channel"]),
    TICKETS: need([ticketPanels === 0, "Post a ticket panel"]),
    BUMP_REMINDER: need([!bump?.channelId, "Pick the channel where you bump"]),
    BIRTHDAYS: need([!birthdays?.channelId, "Pick the birthday announcements channel"]),
    RULES_GATE: need([!rules?.channelId, "Pick the rules channel"], [!rules?.roleId, "Pick the role people get when they agree"]),
    REACTION_ROLES: need([rolePanels === 0, "Create a role panel"]),
  });
});

export default router;
