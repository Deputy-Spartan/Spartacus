import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import healthRouter from "./routes/health";
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
import giveawaysRouter from "./routes/giveaways";
import economyRouter from "./routes/economy";
import levelRolesRouter from "./routes/levelRoles";
import xpBlacklistRouter from "./routes/xpBlacklist";
import securityRouter from "./routes/security";
import scheduledMessagesRouter from "./routes/scheduledMessages";
import communityRouter from "./routes/community";
import reportsAndWatchRouter from "./routes/reportsAndWatch";

const app = express();

app.use(
  cors({
    origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Mounted before any auth middleware — must stay public so external
// monitors (UptimeRobot etc.) can hit it without credentials.
app.use(healthRouter);

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
app.use(giveawaysRouter);
app.use(economyRouter);
app.use(levelRolesRouter);
app.use(xpBlacklistRouter);
app.use(securityRouter);
app.use(scheduledMessagesRouter);
app.use(communityRouter);
app.use(reportsAndWatchRouter);

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
