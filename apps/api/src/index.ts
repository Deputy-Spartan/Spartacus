import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Patches Express to forward rejected promises from async route handlers
// to error-handling middleware instead of leaving them unhandled — must
// be imported before any router that defines an async handler.
import "express-async-errors";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { logError } from "@spartacus/db";

import healthRouter from "./routes/health";
import activityRouter from "./routes/activity";
import authRouter from "./routes/auth";
import guildsRouter from "./routes/guilds";
import modulesRouter from "./routes/modules";
import eventsRouter from "./routes/events";
import customCommandsRouter from "./routes/customCommands";
import levelingRouter from "./routes/leveling";
import welcomeRouter from "./routes/welcome";
import moderationRouter from "./routes/moderation";
import streamSubscriptionsRouter from "./routes/streamSubscriptions";
import discordMetaRouter from "./routes/discordMeta";
import loggingRouter from "./routes/logging";
import antiRaidRouter from "./routes/antiRaid";
import reactionRolesRouter from "./routes/reactionRoles";
import joinRolesRouter from "./routes/joinRoles";
import stickyMessagesRouter from "./routes/stickyMessages";
import starboardRouter from "./routes/starboard";
import tempChannelsRouter from "./routes/tempChannels";
import ticketsRouter from "./routes/tickets";
import rolePanelsRouter from "./routes/rolePanels";
import announcementsRouter from "./routes/announcements";
import autoPurgeRouter from "./routes/autoPurge";
import slowModeRouter from "./routes/slowMode";
import birthdaysRouter from "./routes/birthdays";
import applicationsRouter from "./routes/applications";
import giveawaysRouter from "./routes/giveaways";
import economyRouter from "./routes/economy";
import levelRolesRouter from "./routes/levelRoles";
import xpBlacklistRouter from "./routes/xpBlacklist";
import securityRouter from "./routes/security";
import scheduledMessagesRouter from "./routes/scheduledMessages";
import communityRouter from "./routes/community";
import reportsAndWatchRouter from "./routes/reportsAndWatch";
import errorsRouter from "./routes/errors";
import channelLocksRouter from "./routes/channelLocks";
import botConfigRouter from "./routes/botConfig";
import botAvatarRouter from "./routes/botAvatar";
import meRouter from "./routes/me";
import accessRouter from "./routes/access";
import sendMessageRouter from "./routes/sendMessage";
import eventTemplatesRouter from "./routes/eventTemplates";
import eventSettingsRouter from "./routes/eventSettings";
import buttonPresetsRouter from "./routes/buttonPresets";
import savedEmbedsRouter from "./routes/savedEmbeds";
import statChannelsRouter from "./routes/statChannels";
import statusChannelsRouter from "./routes/statusChannels";
import botStatusRouter from "./routes/botStatus";
import { startStatusChannelWatchdog } from "./jobs/statusChannelWatchdog";
import { announceDeployIfNew } from "./jobs/deployAnnouncer";
import { startErrorAlertPoller } from "./jobs/errorAlertPoller";
import alertSettingsRouter from "./routes/alertSettings";
import aiConfigRouter from "./routes/aiConfig";
import serverBackupsRouter from "./routes/serverBackups";
import commandTogglesRouter from "./routes/commandToggles";
import customSlashCommandsRouter from "./routes/customSlashCommands";
import modDigestSettingsRouter from "./routes/modDigestSettings";
import weeklyRecapSettingsRouter from "./routes/weeklyRecapSettings";
import voiceActivityRouter from "./routes/voiceActivity";
import achievementsRouter from "./routes/achievements";
import warnEscalationRouter from "./routes/warnEscalation";
import prestigeSettingsRouter from "./routes/prestigeSettings";
import appealsRouter from "./routes/appeals";
import growthAnalyticsRouter from "./routes/growthAnalytics";
import serverTemplatesRouter from "./routes/serverTemplates";
import bumpReminderRouter from "./routes/bumpReminder";
import suggestionAnalyticsRouter from "./routes/suggestionAnalytics";
import confessionSettingsRouter from "./routes/confessionSettings";
import milestoneSettingsRouter from "./routes/milestoneSettings";
import rulesGateSettingsRouter from "./routes/rulesGateSettings";
import lfgCommandsRouter from "./routes/lfgCommands";
import embedCreatorRouter from "./routes/embedCreator";

const app = express();

app.use(
  cors({
    origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
    credentials: true,
  })
);
// Default 100kb limit is too small for a base64-encoded avatar upload
// (bot-config route) — Discord itself caps avatar files at 10MB, so match that.
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// Mounted before any auth middleware — must stay public so external
// monitors (UptimeRobot etc.) can hit it without credentials.
app.use(healthRouter);
app.use(activityRouter);

app.use(authRouter);
app.use(guildsRouter);
app.use(modulesRouter);
app.use(eventsRouter);
app.use(customCommandsRouter);
app.use(levelingRouter);
app.use(welcomeRouter);
app.use(moderationRouter);
app.use(streamSubscriptionsRouter);
app.use(discordMetaRouter);
app.use(loggingRouter);
app.use(antiRaidRouter);
app.use(reactionRolesRouter);
app.use(joinRolesRouter);
app.use(stickyMessagesRouter);
app.use(starboardRouter);
app.use(tempChannelsRouter);
app.use(ticketsRouter);
app.use(rolePanelsRouter);
app.use(announcementsRouter);
app.use(autoPurgeRouter);
app.use(slowModeRouter);
app.use(birthdaysRouter);
app.use(applicationsRouter);
app.use(giveawaysRouter);
app.use(economyRouter);
app.use(levelRolesRouter);
app.use(xpBlacklistRouter);
app.use(securityRouter);
app.use(scheduledMessagesRouter);
app.use(communityRouter);
app.use(reportsAndWatchRouter);
app.use(errorsRouter);
app.use(channelLocksRouter);
app.use(botConfigRouter);
app.use(botAvatarRouter);
app.use(meRouter);
app.use(accessRouter);
app.use(sendMessageRouter);
app.use(eventTemplatesRouter);
app.use(eventSettingsRouter);
app.use(buttonPresetsRouter);
app.use(savedEmbedsRouter);
app.use(statChannelsRouter);
app.use(statusChannelsRouter);
app.use(botStatusRouter);
app.use(alertSettingsRouter);
app.use(aiConfigRouter);
app.use(serverBackupsRouter);
app.use(commandTogglesRouter);
app.use(customSlashCommandsRouter);
app.use(modDigestSettingsRouter);
app.use(warnEscalationRouter);
app.use(prestigeSettingsRouter);
app.use(appealsRouter);
app.use(weeklyRecapSettingsRouter);
app.use(voiceActivityRouter);
app.use(achievementsRouter);
app.use(growthAnalyticsRouter);
app.use(serverTemplatesRouter);
app.use(bumpReminderRouter);
app.use(suggestionAnalyticsRouter);
app.use(confessionSettingsRouter);
app.use(milestoneSettingsRouter);
app.use(rulesGateSettingsRouter);
app.use(lfgCommandsRouter);
app.use(embedCreatorRouter);

// Last-resort safety net: an unhandled error in any route (a bad DB
// constraint, an unexpected Discord API response, whatever) used to crash
// this whole process — which takes the bot down with it in production,
// since it runs inline in the same process. Respond with 500 instead.
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api] Unhandled route error:", err);
  logError("api", err, (req.params as Record<string, string>).guildId);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`[api] Spartacus API listening on :${port}`);
});

// Single free-tier service (default): the Discord client runs inline in
// this same process, sharing the one RAM budget with the API. Set
// RUN_BOT_INLINE=false when running apps/bot as its own separate service
// instead (keeps the bot's discord.js cache memory isolated from API
// request-handling memory, if your host gives you two free services).
if (process.env.RUN_BOT_INLINE !== "false") {
  import("@spartacus/bot").then(({ startBot }) => startBot());
}

// Deliberately started here, not inside the bot process — this needs to
// keep working (and be the one to say so) precisely when the bot itself is
// down. Survives both deploy shapes: in the merged single-service default
// above, the bot's own unhandledRejection/uncaughtException guards keep
// this process (and this watchdog) alive even if the gateway connection
// dies; when split into its own service (RUN_BOT_INLINE=false), this
// process was never coupled to the bot's lifecycle in the first place.
startStatusChannelWatchdog();
startErrorAlertPoller();
announceDeployIfNew();
