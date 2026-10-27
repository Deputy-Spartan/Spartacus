import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { ActivityType, Client, Events, GatewayIntentBits, Options, Partials, type PresenceStatusData } from "discord.js";
import { logError, prisma } from "@spartacus/db";
import { commands } from "./commands";
import { registerCommands } from "./lib/registerCommands";
import * as interactionCreate from "./events/interactionCreate";
import * as messageCreate from "./events/messageCreate";
import * as guildMemberAdd from "./events/guildMemberAdd";
import * as guildMemberRemove from "./events/guildMemberRemove";
import { startEventReminderJob } from "./jobs/eventReminder";
import { startEventSyncJob } from "./jobs/eventSync";
import { startStreamPollerJob } from "./jobs/streamPoller";
import { startGiveawayEnderJob } from "./jobs/giveawayEnder";
import { startGiveawayPosterJob } from "./jobs/giveawayPoster";
import { startTicketPanelPosterJob } from "./jobs/ticketPanelPoster";
import { startRolePanelPosterJob } from "./jobs/rolePanelPoster";
import { startReactionRolePosterJob } from "./jobs/reactionRolePoster";
import { startPollPosterJob } from "./jobs/pollPoster";
import { startPollCloserJob } from "./jobs/pollCloser";
import { startScheduledMessagesJob } from "./jobs/scheduledMessages";
import { startStatChannelsJob } from "./jobs/statChannels";
import { startStatusChannelPosterJob } from "./jobs/statusChannelPoster";
import { startAnnouncementPosterJob } from "./jobs/announcementPoster";
import { startAutoPurgeJob } from "./jobs/autoPurge";
import { startBirthdayAnnouncerJob } from "./jobs/birthdayAnnouncer";
import { startBirthdayPanelPosterJob } from "./jobs/birthdayPanelPoster";
import { startApplicationPanelPosterJob } from "./jobs/applicationPanelPoster";
import { startModDigestJob } from "./jobs/modDigest";
import { startWeeklyRecapJob } from "./jobs/weeklyRecap";
import { startGrowthSnapshotJob } from "./jobs/growthSnapshot";
import { startBumpReminderJob } from "./jobs/bumpReminder";
import { startSuggestionAnalyticsJob } from "./jobs/suggestionAnalytics";
import { startRemindersJob } from "./jobs/reminders";
import { startMemberMilestonesJob } from "./jobs/memberMilestones";
import { startRulesGatePosterJob } from "./jobs/rulesGatePoster";
import { startVerificationPosterJob } from "./jobs/verificationPoster";

import * as logger from "./modules/logging/logger";
import * as antiRaid from "./modules/security/antiRaid";
import * as antiNuke from "./modules/security/antiNuke";
import * as permWatch from "./modules/security/permWatch";
import * as honeypot from "./modules/security/honeypot";
import * as reactionRoles from "./modules/community/reactionRoles";
import * as pollVotes from "./modules/engagement/pollVotes";
import * as joinRoles from "./modules/community/joinRoles";
import * as stickyMessages from "./modules/community/stickyMessages";
import * as starboard from "./modules/community/starboard";
import * as tempChannels from "./modules/community/tempChannels";
import * as voiceActivity from "./modules/community/voiceActivity";
import * as bumpReminder from "./modules/community/bumpReminder";
import * as rolePersistence from "./modules/community/rolePersistence";
import * as inviteTracking from "./modules/community/inviteTracking";
import * as modmail from "./modules/modmail/modmail";
import * as supportIntake from "./modules/support/supportIntake";
import * as applications from "./modules/community/applications";
import * as channelLocks from "./modules/utility/channelLocks";
import * as aiChat from "./modules/community/aiChat";
import * as aiModeration from "./modules/moderation/aiModeration";

// Discord.js event listeners aren't wrapped by Express's error handling —
// an exception thrown inside one (or a rejected promise nobody awaited)
// used to crash the whole process. This is the bot-side equivalent of
// apps/api's global Express error handler.
process.on("unhandledRejection", (reason) => {
  console.error("[bot] Unhandled rejection:", reason);
  logError("bot", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[bot] Uncaught exception:", err);
  logError("bot", err);
});

const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
  PLAYING: ActivityType.Playing,
  WATCHING: ActivityType.Watching,
  LISTENING: ActivityType.Listening,
  COMPETING: ActivityType.Competing,
  CUSTOM: ActivityType.Custom,
};

// Username/avatar/description changes take effect immediately via the API
// (direct Discord REST calls), but status/activity live on the gateway
// connection itself — only the running bot process can apply those. Polled
// rather than pushed so this works the same whether the API and bot run in
// one process (the default free-tier setup) or as separate services.
async function applyBotPresence(client: Client) {
  const config = await prisma.botConfig.findUnique({ where: { id: "singleton" } });
  if (!config || !client.user) return;

  const activities = config.activityText
    ? [
        {
          name: config.activityType === "CUSTOM" ? "Custom Status" : config.activityText,
          type: ACTIVITY_TYPE_MAP[config.activityType] ?? ActivityType.Playing,
          state: config.activityType === "CUSTOM" ? config.activityText : undefined,
        },
      ]
    : [];

  client.user.setPresence({ status: (config.statusType as PresenceStatusData) ?? "online", activities });
}

// Dashboard "online/offline" indicator and the status-channel embed both
// read this instead of pinging the gateway directly — same polled-not-pushed
// reasoning as applyBotPresence above, works whether the bot and API share
// a process or not. The API treats anything older than 60s as offline.
//
// Also clears deployingSince (see scripts/mark-deploying.js) on every tick,
// not just the first one after a restart — during a real deploy the OLD
// instance is usually still running and heartbeating right up until Render
// swaps traffic to the new one, so its very next heartbeat (within ~20s)
// clears the "Updating" flag almost immediately, which is correct: nothing
// was actually down. If there's no old instance still alive (first-ever
// deploy, or it already crashed), the flag simply stays set until this new
// instance's own first heartbeat clears it — which is exactly when
// "Updating" should turn back into "Online".
async function sendHeartbeat(client: Client) {
  if (!client.user) return;
  await prisma.botConfig
    .upsert({
      where: { id: "singleton" },
      create: { id: "singleton", lastHeartbeatAt: new Date(), deployingSince: null },
      update: { lastHeartbeatAt: new Date(), deployingSince: null },
    })
    .catch((err) => logError("bot", err));
}

export { commands } from "./commands";
// Re-exported so apps/api's "Resend Now" button can repost a sticky through
// the exact same guarded delete+send logic the bot itself uses, instead of
// a separate raw REST call that the bot's in-memory duplicate-post guards
// (justPosted/inFlight) have no way to see.
export { forceRepost as forceStickyRepost } from "./modules/community/stickyMessages";
// Re-exported so apps/api's "Publish Now" button can send a queued
// announcement through the bot's own live gateway client instead of a
// separate raw REST call.
export { publishAnnouncement } from "./jobs/announcementPoster";
// Re-exported so apps/api's "Stop Now" button can render the exact same
// final-results embed the bot's own pollCloser job builds, instead of
// duplicating that logic or waiting for the next minute's cron tick.
export { renderPollEmbed, announcePollClosed } from "./modules/engagement/pollVotes";
// Re-exported so apps/api's Rules Gate settings save can post/repost the
// panel immediately instead of waiting up to a minute for the catch-up cron.
export { postRulesGatePanel } from "./jobs/rulesGatePoster";
// Re-exported so apps/api's Verification settings save can post/repost the
// panel immediately, same reasoning as postRulesGatePanel above.
export { postVerificationPanel } from "./modules/security/verification";
// Re-exported so apps/api's Welcome "Send Test" button can post the real
// welcome/goodbye message (exact same render as a live join/leave) to the
// configured channel on demand.
export { sendWelcomeTest } from "./modules/community/welcomeRender";
// Re-exported so apps/api's Weekly Recap "Send Test" button can post the
// exact same embed the Monday cron builds, on demand.
export { postWeeklyRecap } from "./jobs/weeklyRecap";
// Re-exported so apps/api's Birthdays "Send Test" button can announce a
// test birthday for the clicking admin on demand.
export { sendBirthdayTest } from "./jobs/birthdayAnnouncer";

export function startBot() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildModeration, // audit-log-driven anti-nuke detection
      GatewayIntentBits.DirectMessages, // modmail DM bridge
      GatewayIntentBits.GuildInvites, // invite-use tracking
      GatewayIntentBits.GuildEmojisAndStickers, // audit log: emoji create/update/delete
    ],
    partials: [Partials.GuildMember, Partials.Message, Partials.Reaction, Partials.Channel],
    // Cap every default cache — without this, discord.js caches every
    // message/user/member it ever sees for the process lifetime, which is
    // the single biggest RAM risk on a 512MB host.
    makeCache: Options.cacheWithLimits({
      MessageManager: 50, // per-channel message cache
      PresenceManager: 0, // don't cache presences at all — not used by any module
      ReactionManager: 50,
      GuildMemberManager: 500, // per-guild member cache
      UserManager: 1000,
    }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: { interval: 3600, lifetime: 1800 }, // sweep hourly, drop messages >30min old
    },
  });

  client.commands = commands;

  client.once("ready", async (c) => {
    console.log(`[bot] Logged in as ${c.user.tag}`);

    registerCommands()
      .then(({ count, scope }) => console.log(`[bot] Registered ${count} slash command(s) ${scope}.`))
      .catch((err) => console.error("[bot] Failed to auto-register slash commands on boot:", err));

    startEventReminderJob(c);
    startEventSyncJob(c);
    startStatChannelsJob(c);
    startStatusChannelPosterJob(c);
    startStreamPollerJob(c);
    startGiveawayEnderJob(c);
    startGiveawayPosterJob(c);
    startTicketPanelPosterJob(c);
    startRolePanelPosterJob(c);
    startReactionRolePosterJob(c);
    startPollPosterJob(c);
    startPollCloserJob(c);
    startAnnouncementPosterJob(c);
    startAutoPurgeJob(c);
    startBirthdayAnnouncerJob(c);
    startBirthdayPanelPosterJob(c);
    startApplicationPanelPosterJob(c);
    startScheduledMessagesJob(c);
    startModDigestJob(c);
    startWeeklyRecapJob(c);
    startGrowthSnapshotJob(c);
    startBumpReminderJob(c);
    startSuggestionAnalyticsJob(c);
    startRemindersJob(c);
    startMemberMilestonesJob(c);
    startRulesGatePosterJob(c);
    startVerificationPosterJob(c);

    const { primeAllGuildInvites } = await import("./modules/community/inviteTracking");
    await primeAllGuildInvites(c);

    await applyBotPresence(c);
    setInterval(() => applyBotPresence(c), 30_000);

    await sendHeartbeat(c);
    setInterval(() => sendHeartbeat(c), 20_000);
  });

  client.on(interactionCreate.name, interactionCreate.execute);
  client.on(channelLocks.name, channelLocks.execute);
  client.on(messageCreate.name, messageCreate.execute);
  client.on(Events.MessageCreate, modmail.execute); // DM-only, filters guild messages internally
  client.on(Events.MessageCreate, modmail.handleStaffReply); // guild-only, filters DMs internally
  client.on(Events.MessageCreate, applications.execute); // DM-only, advances an in-progress application draft
  client.on(Events.MessageCreate, supportIntake.execute); // DM-only, flow picker + question chain + DM->ticket relay
  client.on(Events.MessageCreate, supportIntake.handleStaffMessage); // guild-only, ticket channel -> DM relay
  client.on(aiChat.name, aiChat.execute);
  client.on(aiModeration.name, aiModeration.execute);

  // guildMemberAdd has several independent listeners — welcome message,
  // join-role assignment, anti-raid detection, role-persistence restore,
  // and invite-use tracking — each gated by its own module toggle, so
  // discord.js just fires all of them per join.
  client.on(guildMemberAdd.name, guildMemberAdd.execute);
  client.on(joinRoles.name, joinRoles.execute);
  client.on(antiRaid.name, antiRaid.execute);
  client.on(Events.GuildMemberAdd, rolePersistence.onRejoin);
  client.on(inviteTracking.name, inviteTracking.execute);
  client.on(guildMemberRemove.name, guildMemberRemove.execute);
  client.on(Events.GuildMemberRemove, rolePersistence.onLeave);

  client.on(Events.MessageCreate, stickyMessages.execute);
  client.on(Events.MessageCreate, honeypot.execute);
  client.on(Events.MessageDelete, logger.onMessageDelete);
  client.on(Events.MessageUpdate, logger.onMessageUpdate);
  client.on(Events.GuildMemberAdd, logger.onMemberAdd);
  client.on(Events.GuildMemberRemove, logger.onMemberRemove);
  client.on(Events.GuildMemberUpdate, logger.onMemberUpdate);
  client.on(Events.VoiceStateUpdate, logger.onVoiceStateUpdate);
  client.on(Events.GuildBanAdd, logger.onGuildBanAdd);
  client.on(Events.GuildBanRemove, logger.onGuildBanRemove);
  client.on(Events.UserUpdate, logger.onUserUpdate);
  client.on(Events.GuildRoleCreate, logger.onRoleCreate);
  client.on(Events.GuildRoleUpdate, logger.onRoleUpdate);
  client.on(Events.GuildRoleDelete, logger.onRoleDelete);
  client.on(Events.GuildUpdate, logger.onGuildUpdate);
  client.on(Events.GuildEmojiCreate, logger.onEmojiCreate);
  client.on(Events.GuildEmojiDelete, logger.onEmojiDelete);
  client.on(Events.GuildEmojiUpdate, logger.onEmojiUpdate);
  client.on(Events.ChannelCreate, logger.onChannelCreate);
  client.on(Events.ChannelDelete, logger.onChannelDelete);
  client.on(Events.ChannelUpdate, logger.onChannelUpdate);
  client.on(Events.InviteCreate, logger.onInviteCreate);
  client.on(Events.VoiceStateUpdate, tempChannels.execute);
  client.on(Events.VoiceStateUpdate, voiceActivity.execute);
  client.on(bumpReminder.name, bumpReminder.execute);

  client.on(Events.MessageReactionAdd, reactionRoles.onReactionAdd);
  client.on(Events.MessageReactionRemove, reactionRoles.onReactionRemove);
  client.on(Events.MessageReactionAdd, pollVotes.onReactionAdd);
  client.on(Events.MessageReactionRemove, pollVotes.onReactionRemove);
  client.on(Events.MessageReactionAdd, starboard.execute);

  client.on(Events.GuildAuditLogEntryCreate, antiNuke.execute);
  client.on(Events.GuildAuditLogEntryCreate, permWatch.execute);

  client.login(process.env.DISCORD_TOKEN).catch((err) => {
    // Don't let a bad/missing token bring down the whole process — this
    // matters most in the merged single-service deploy, where the API
    // (and its /health endpoint) must keep serving even if the bot can't
    // log in yet.
    console.error("[bot] Failed to log in — check DISCORD_TOKEN:", err.message);
  });

  return client;
}

declare module "discord.js" {
  interface Client {
    commands: typeof commands;
  }
}

// Standalone entrypoint (npm run dev:bot). When merging into apps/api on a
// single free-tier service instead, import { startBot } there and skip
// running this file directly.
if (require.main === module) {
  startBot();
}
