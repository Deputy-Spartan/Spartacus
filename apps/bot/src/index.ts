import { Client, Events, GatewayIntentBits, Options, Partials } from "discord.js";
import { commands } from "./commands";
import * as interactionCreate from "./events/interactionCreate";
import * as messageCreate from "./events/messageCreate";
import * as guildMemberAdd from "./events/guildMemberAdd";
import * as guildMemberRemove from "./events/guildMemberRemove";
import { startEventReminderJob } from "./jobs/eventReminder";
import { startStreamPollerJob } from "./jobs/streamPoller";
import { startGiveawayEnderJob } from "./jobs/giveawayEnder";
import { startGiveawayPosterJob } from "./jobs/giveawayPoster";
import { startTicketPanelPosterJob } from "./jobs/ticketPanelPoster";
import { startScheduledMessagesJob } from "./jobs/scheduledMessages";

import * as logger from "./modules/logging/logger";
import * as antiRaid from "./modules/security/antiRaid";
import * as antiNuke from "./modules/security/antiNuke";
import * as permWatch from "./modules/security/permWatch";
import * as honeypot from "./modules/security/honeypot";
import * as reactionRoles from "./modules/community/reactionRoles";
import * as joinRoles from "./modules/community/joinRoles";
import * as stickyMessages from "./modules/community/stickyMessages";
import * as starboard from "./modules/community/starboard";
import * as tempChannels from "./modules/community/tempChannels";
import * as rolePersistence from "./modules/community/rolePersistence";
import * as inviteTracking from "./modules/community/inviteTracking";
import * as modmail from "./modules/modmail/modmail";

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
    startEventReminderJob(c);
    startStreamPollerJob(c);
    startGiveawayEnderJob(c);
    startGiveawayPosterJob(c);
    startTicketPanelPosterJob(c);
    startScheduledMessagesJob(c);

    const { primeAllGuildInvites } = await import("./modules/community/inviteTracking");
    await primeAllGuildInvites(c);
  });

  client.on(interactionCreate.name, interactionCreate.execute);
  client.on(messageCreate.name, messageCreate.execute);
  client.on(Events.MessageCreate, modmail.execute); // DM-only, filters guild messages internally
  client.on(Events.MessageCreate, modmail.handleStaffReply); // guild-only, filters DMs internally

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
  client.on(Events.VoiceStateUpdate, logger.onVoiceStateUpdate);
  client.on(Events.VoiceStateUpdate, tempChannels.execute);

  client.on(Events.MessageReactionAdd, reactionRoles.onReactionAdd);
  client.on(Events.MessageReactionRemove, reactionRoles.onReactionRemove);
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
