import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Guild,
  GuildBasedChannel,
  Message,
  PermissionFlagsBits,
  Role,
  type CategoryChannel,
  type OverwriteResolvable,
} from "discord.js";
import {
  EXTRA_GUIDES,
  EXTRAS_CATEGORY,
  MODULE_LABELS,
  NAV_SECTIONS,
  PAGE_GUIDES,
  STARTER_SHOP,
  TEST_AUTOMOD_WORD,
  TEST_GUIDES,
  TEST_ROLES,
  TEST_TICKETS_CATEGORY,
  TESTER_START_CATEGORY,
  TESTER_START_CHANNEL,
  UNLISTED_MODULES,
  cleanShopItem,
  slugifyModuleLabel,
  zonedClock,
  type ModuleKey,
  type NavItem,
  type TestGuide,
} from "@spartacus/shared";
import { logError } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isOwner } from "../../lib/owner";
import { isSendableChannel } from "../../lib/channels";
import { invalidateModuleCache } from "../../lib/moduleGate";
import { customCommandCache } from "../../lib/cache";
import { buildSavedEmbedPayload, type SavedEmbedData } from "../../lib/savedEmbedRender";
import { EXTRA_PAGE_CHANNELS, EXTRA_VOICE_CATEGORY, buildLayout, normalizeCategoryName } from "./setupTestServer";

// Second half of the test-server scaffold. !setup-test-server makes a
// category per dashboard section and a channel per page; this turns every
// module on, points it at its own channel, posts whatever it posts (panels,
// a sample poll, today's quote and so on), and leaves a card in each channel
// saying what was set up and how to try it.
//
// Owner-only and never registered with Discord, for the same reasons as
// !setup-test-server. Safe to run again: it fills in what's missing and
// doesn't post a second copy of anything that's already there.

const CARD_FOOTER = "Spartacus test guide";
type RoleKey = keyof typeof TEST_ROLES;

interface Ctx {
  client: Client;
  guild: Guild;
  ownerId: string;
  channel: GuildBasedChannel;
  roles: Record<RoleKey, Role>;
  ticketsCategoryId: string;
  voiceCategoryId: string | null;
  // Another channel in the same category, by name.
  sibling: (name: string) => GuildBasedChannel | null;
}

const MINUTE = 60_000;

// What each page's module needs in order to be testable. A page with no
// entry only gets switched on and given its card.
const SEEDERS: Record<string, (ctx: Ctx) => Promise<void>> = {
  "/moderation": async ({ guild, channel }) => {
    await prisma.loggingConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, logChannelId: channel.id }, update: { logChannelId: channel.id } });
    const toggle = await prisma.moduleToggle.findUnique({ where: { guildId_key: { guildId: guild.id, key: "MODERATION" } } });
    const config = ((toggle?.config as Record<string, unknown> | null) ?? {}) as { bannedWords?: string[] };
    const words = Array.isArray(config.bannedWords) ? config.bannedWords : [];
    if (!words.includes(TEST_AUTOMOD_WORD)) {
      await prisma.moduleToggle.update({
        where: { guildId_key: { guildId: guild.id, key: "MODERATION" } },
        data: { config: { ...config, bannedWordsEnabled: true, bannedWords: [...words, TEST_AUTOMOD_WORD] } },
      });
    }
  },

  "/reports": async ({ client, guild, channel, roles, ticketsCategoryId }) => {
    const existing = await prisma.playerReportSettings.findUnique({ where: { guildId: guild.id } });
    const alreadyPosted = existing?.panelChannelId === channel.id && !!existing.panelMessageId;
    const settings = await prisma.playerReportSettings.upsert({
      where: { guildId: guild.id },
      create: { guildId: guild.id, categoryId: ticketsCategoryId, staffRoleId: roles.staff.id, panelChannelId: channel.id },
      update: { categoryId: existing?.categoryId ?? ticketsCategoryId, staffRoleId: existing?.staffRoleId ?? roles.staff.id, panelChannelId: channel.id, ...(alreadyPosted ? {} : { panelMessageId: null }) },
    });
    if (!alreadyPosted) {
      const { postPlayerReportPanel } = await import("../moderation/playerReports");
      await postPlayerReportPanel(client, settings);
    }
  },

  "/mod-digest": async ({ guild, channel }) => {
    const data = { channelId: channel.id, manualSendRequestedAt: new Date() };
    await prisma.modDigestSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, ...data }, update: data });
  },

  "/warn-escalation": async ({ guild }) => {
    await prisma.warnEscalationSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id }, update: {} });
  },

  "/appeals": async ({ guild, channel }) => {
    await prisma.appealSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, appealChannelId: channel.id }, update: { appealChannelId: channel.id } });
  },

  "/anti-raid": async ({ guild, channel }) => {
    await prisma.antiRaidConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, alertChannelId: channel.id }, update: { alertChannelId: channel.id } });
  },

  "/anti-nuke": async ({ guild, channel }) => {
    await prisma.antiNukeConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, alertChannelId: channel.id }, update: { alertChannelId: channel.id } });
  },

  "/verification": async ({ client, guild, channel, roles }) => {
    const existing = await prisma.verificationConfig.findUnique({ where: { guildId: guild.id } });
    const alreadyPosted = existing?.panelChannelId === channel.id && !!existing.panelMessageId;
    const config = await prisma.verificationConfig.upsert({
      where: { guildId: guild.id },
      create: { guildId: guild.id, verifiedRoleId: roles.verified.id, panelChannelId: channel.id },
      update: { verifiedRoleId: existing?.verifiedRoleId ?? roles.verified.id, panelChannelId: channel.id, ...(alreadyPosted ? {} : { panelMessageId: null }) },
    });
    if (!alreadyPosted) {
      const { postVerificationPanel } = await import("../security/verification");
      await postVerificationPanel(client, config);
    }
  },

  "/rules-gate": async ({ client, guild, channel, roles }) => {
    const existing = await prisma.rulesGateSettings.findUnique({ where: { guildId: guild.id } });
    const alreadyPosted = existing?.channelId === channel.id && !!existing.messageId;
    const settings = await prisma.rulesGateSettings.upsert({
      where: { guildId: guild.id },
      create: {
        guildId: guild.id,
        channelId: channel.id,
        roleId: roles.rules.id,
        defaultEmbedTitle: "📜 Test Server Rules",
        defaultEmbedDescription: "1. Be kind.\n2. No spam.\n3. Have fun testing.\n\nTap **I Agree** below to confirm you've read them.",
      },
      update: { channelId: channel.id, roleId: existing?.roleId ?? roles.rules.id, ...(alreadyPosted ? {} : { messageId: null }) },
    });
    if (!alreadyPosted) {
      const { postRulesGatePanel } = await import("../../jobs/rulesGatePoster");
      await postRulesGatePanel(client, settings);
    }
  },

  "/honeypot": async ({ client, guild, channel }) => {
    const existing = await prisma.honeypotConfig.findUnique({ where: { guildId: guild.id } });
    const moved = !!existing && existing.channelId !== channel.id;
    await prisma.honeypotConfig.upsert({
      where: { guildId: guild.id },
      // A one-minute timeout, so testing it never removes anyone for good.
      create: { guildId: guild.id, channelId: channel.id, messageEnabled: true, action: "TIMEOUT", timeoutMinutes: 1 },
      update: { channelId: channel.id, messageEnabled: true, ...(moved ? { messageId: null } : {}) },
    });
    const { syncHoneypotMessage } = await import("../security/honeypot");
    const result = await syncHoneypotMessage(client, guild.id);
    if (!result.ok) throw new Error(result.error ?? "The honeypot message didn't post.");
  },

  "/perm-watch": async ({ guild, channel }) => {
    await prisma.permWatchConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, alertChannelId: channel.id }, update: { alertChannelId: channel.id } });
  },

  "/welcome": async ({ client, guild, channel, ownerId }) => {
    const existing = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } });
    await prisma.welcomeConfig.upsert({
      where: { guildId: guild.id },
      create: { guildId: guild.id, channelId: channel.id, welcomeText: "👋 Welcome to **{server}**, {user}!", goodbyeText: "{user} has left **{server}**." },
      update: {
        channelId: channel.id,
        welcomeText: existing?.welcomeText || "👋 Welcome to **{server}**, {user}!",
        goodbyeText: existing?.goodbyeText || "{user} has left **{server}**.",
      },
    });
    const { sendWelcomeTest } = await import("../community/welcomeRender");
    const result = await sendWelcomeTest(client, guild.id, ownerId, "welcome");
    if (!result.ok) throw new Error(result.error ?? "The test welcome didn't post.");
  },

  "/reaction-roles": async ({ guild, channel, roles }) => {
    // Both are posted by their own poster jobs within a few seconds.
    if (!(await prisma.reactionRolePanel.findFirst({ where: { guildId: guild.id, channelId: channel.id } }))) {
      const panel = await prisma.reactionRolePanel.create({
        data: { guildId: guild.id, channelId: channel.id, title: "Pick a test role (reactions)", description: "React to get a role. Remove the reaction to give it back.", embedEnabled: true, embedColor: "#5865F2" },
      });
      await prisma.reactionRole.createMany({
        data: [
          { guildId: guild.id, panelId: panel.id, channelId: channel.id, emoji: "🔴", roleId: roles.red.id },
          { guildId: guild.id, panelId: panel.id, channelId: channel.id, emoji: "🔵", roleId: roles.blue.id },
        ],
      });
    }
    if (!(await prisma.rolePanel.findFirst({ where: { guildId: guild.id, channelId: channel.id } }))) {
      await prisma.rolePanel.create({
        data: {
          guildId: guild.id,
          name: "Pick a test role (buttons)",
          channelId: channel.id,
          description: "Tap a button to get a role. Tap it again to give it back.",
          layout: "BUTTONS",
          options: [
            { roleIds: [roles.red.id], channelIds: [], label: "Red", emoji: "🔴" },
            { roleIds: [roles.blue.id], channelIds: [], label: "Blue", emoji: "🔵" },
          ],
        },
      });
    }
    await prisma.joinRole.upsert({ where: { guildId_roleId: { guildId: guild.id, roleId: roles.member.id } }, create: { guildId: guild.id, roleId: roles.member.id }, update: {} });
  },

  "/sticky-messages": async ({ client, guild, channel }) => {
    const sticky = await prisma.stickyMessage.upsert({
      where: { channelId: channel.id },
      create: { guildId: guild.id, channelId: channel.id, content: "📌 This is a test sticky message. Send something here and watch it move back to the bottom." },
      update: {},
    });
    const { forceRepost } = await import("../community/stickyMessages");
    await forceRepost(client, sticky.id);
  },

  "/starboard": async ({ guild, channel }) => {
    const data = { channelId: channel.id, threshold: 1 };
    await prisma.starboardConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, ...data }, update: data });
  },

  "/temp-channels": async ({ guild, channel, voiceCategoryId }) => {
    if (channel.type !== ChannelType.GuildVoice) throw new Error("The temp-channels channel isn't a voice channel. Run !setup-test-server to fix it.");
    if (await prisma.tempChannelLobby.findFirst({ where: { guildId: guild.id, lobbyChannelId: channel.id } })) return;
    await prisma.tempChannelLobby.create({
      data: { guildId: guild.id, name: "Test Lobby", lobbyChannelId: channel.id, categoryId: voiceCategoryId ?? channel.parentId, nameFormat: "{user}'s Room" },
    });
  },

  "/ai-chat": async ({ guild, channel }) => {
    await prisma.aiConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, chatChannelId: channel.id }, update: { chatChannelId: channel.id } });
  },

  "/birthdays": async ({ guild, channel }) => {
    const existing = await prisma.birthdayConfig.findUnique({ where: { guildId: guild.id } });
    const panelInPlace = existing?.useButton && existing.buttonChannelId === channel.id && !!existing.buttonMessageId;
    const data = { channelId: channel.id, useButton: true, buttonChannelId: channel.id, ...(panelInPlace ? {} : { buttonMessageId: null }) };
    await prisma.birthdayConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, ...data }, update: data });
  },

  "/member-milestones": async ({ guild, channel }) => {
    await prisma.milestoneSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, channelId: channel.id }, update: { channelId: channel.id } });
  },

  "/confessions": async ({ guild, channel }) => {
    await prisma.confessionSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, channelId: channel.id }, update: { channelId: channel.id } });
  },

  "/events": async ({ guild, channel, ownerId }) => {
    await prisma.eventSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, defaultChannelId: channel.id }, update: { defaultChannelId: channel.id } });
    const upcoming = await prisma.event.findFirst({ where: { guildId: guild.id, channelId: channel.id, startTime: { gt: new Date() }, status: "SCHEDULED" } });
    if (upcoming) return;
    await prisma.event.create({
      data: {
        guildId: guild.id,
        title: "Test Event",
        description: "A sample event from !setup-test-modules. Tap a button to sign up.",
        channelId: channel.id,
        createdById: ownerId,
        startTime: new Date(Date.now() + 120 * MINUTE),
      },
    });
  },

  "/lfg": async ({ guild, channel, roles }) => {
    let command = await prisma.lfgCommand.findFirst({ where: { guildId: guild.id, OR: [{ channelId: channel.id }, { trigger: "lfg" }] }, include: { categories: true } });
    if (!command) {
      command = await prisma.lfgCommand.create({
        data: { guildId: guild.id, trigger: "lfg", channelId: channel.id, roleId: roles.ping.id, message: "{user} is looking for a group in {voice}! {message}" },
        include: { categories: true },
      });
    } else if (command.channelId !== channel.id) {
      command = await prisma.lfgCommand.update({ where: { id: command.id }, data: { channelId: channel.id }, include: { categories: true } });
    }
    // The dashboard registers the slash command when one is made there. A row
    // made here needs the same, or only the !trigger form would work.
    if (!command.discordCommandId && command.categories.length === 0) {
      const created = await guild.commands.create({
        name: command.trigger,
        description: command.description,
        options: [{ type: 3, name: "message", description: "Optional note shown in the announcement", required: false }],
      });
      await prisma.lfgCommand.update({ where: { id: command.id }, data: { discordCommandId: created.id } });
    }
  },

  "/giveaways": async ({ guild, channel }) => {
    if (await prisma.giveaway.findFirst({ where: { guildId: guild.id, channelId: channel.id, ended: false } })) return;
    await prisma.giveaway.create({
      data: { guildId: guild.id, channelId: channel.id, prize: "Test Prize", description: "A sample giveaway from !setup-test-modules.", winnerCount: 1, endsAt: new Date(Date.now() + 10 * MINUTE) },
    });
  },

  "/polls": async ({ guild, channel }) => {
    if (await prisma.poll.findFirst({ where: { guildId: guild.id, channelId: channel.id, closed: false } })) return;
    await prisma.poll.create({
      data: { guildId: guild.id, channelId: channel.id, question: "Which module should we test next?", options: ["Tickets", "Giveaways", "Matchmaking"], emojis: ["1️⃣", "2️⃣", "3️⃣"] },
    });
  },

  "/counting-game": async ({ guild, channel }) => {
    await prisma.countingGameConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, channelId: channel.id }, update: { channelId: channel.id } });
  },

  "/embed-creator": async ({ guild, channel }) => {
    if (await prisma.embedCreatorPreset.findUnique({ where: { guildId_name: { guildId: guild.id, name: "Test Embed" } } })) return;
    const data = {
      content: "",
      embeds: [{ id: "test-embed", title: "🧩 Test Embed", description: "Made by !setup-test-modules. Open **Embed Creator** on the dashboard to edit it, or pick it as the saved embed on another module's page.", color: "#00E5FF", fields: [] }],
      components: [],
    };
    const preset = await prisma.embedCreatorPreset.create({ data: { guildId: guild.id, name: "Test Embed", data } });
    if (!isSendableChannel(channel)) return;
    const sent = await channel.send(await buildSavedEmbedPayload(guild.id, data as SavedEmbedData));
    await prisma.embedCreatorPreset.update({ where: { id: preset.id }, data: { lastSentMode: "bot", lastSentChannelId: channel.id, lastSentMessageId: sent.id } });
  },

  "/announcements": async ({ client, guild, channel }) => {
    if (await prisma.announcement.findFirst({ where: { guildId: guild.id, channelId: channel.id } })) return;
    const make = (title: string, description: string) => {
      const creatorData = { content: "", embeds: [{ id: "a1", title, description, color: "#00E5FF", fields: [] }], components: [] };
      return prisma.announcement.create({ data: { guildId: guild.id, channelId: channel.id, content: "", embedTitle: title, embedDescription: description, creatorData } });
    };
    const first = await make("📢 Test Announcement", "Published by !setup-test-modules.");
    await make("📢 Queued Test Announcement", "This one is waiting in the queue. Publish it from the dashboard.");
    const { publishAnnouncement } = await import("../../jobs/announcementPoster");
    const result = await publishAnnouncement(client, first.id);
    if (!result.ok) throw new Error(result.error ?? "The test announcement didn't publish.");
  },

  "/quote-of-the-day": async ({ client, guild, channel, sibling }) => {
    const questionChannel = sibling("question-of-the-day") ?? channel;
    const feeds = [
      { kind: "QUOTE" as const, channelId: channel.id, createThread: false },
      { kind: "QUESTION" as const, channelId: questionChannel.id, createThread: true },
    ];
    const { sendDailyPost } = await import("../../jobs/dailyPosts");
    for (const feed of feeds) {
      const config = await prisma.dailyPostConfig.upsert({
        where: { guildId_kind: { guildId: guild.id, kind: feed.kind } },
        create: { guildId: guild.id, kind: feed.kind, enabled: true, channelId: feed.channelId, createThread: feed.createThread },
        update: { enabled: true, channelId: feed.channelId },
      });
      // Counts as today's post, so the schedule doesn't send a second one.
      if (config.lastPostedOn === zonedClock(config.timeZone).date) continue;
      const result = await sendDailyPost(client, guild.id, feed.kind);
      if (!result.ok) throw new Error(result.error ?? "The daily post didn't send.");
    }
  },

  "/commands": async ({ guild }) => {
    await prisma.customCommand.upsert({
      where: { guildId_trigger: { guildId: guild.id, trigger: "hello" } },
      create: { guildId: guild.id, trigger: "hello", response: "👋 Hello from Spartacus! Custom commands are working." },
      update: {},
    });
    customCommandCache.delete(guild.id);
  },

  "/bump-reminder": async ({ guild, channel }) => {
    await prisma.bumpReminderSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, channelId: channel.id }, update: { channelId: channel.id } });
  },

  "/leveling": async ({ guild, channel }) => {
    await prisma.levelingSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, channelId: channel.id }, update: { channelId: channel.id } });
  },

  "/level-roles": async ({ guild, roles }) => {
    await prisma.levelRole.upsert({ where: { guildId_level: { guildId: guild.id, level: 1 } }, create: { guildId: guild.id, level: 1, roleId: roles.level.id }, update: {} });
  },

  "/prestige": async ({ guild }) => {
    await prisma.prestigeSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, maxLevel: 2 }, update: {} });
  },

  "/achievements": async ({ guild, channel }) => {
    await prisma.achievementSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, channelId: channel.id }, update: { channelId: channel.id } });
  },

  "/economy/settings": async ({ guild }) => {
    await prisma.economyConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id }, update: {} });
  },

  "/weekly-recap": async ({ client, guild, channel }) => {
    const settings = await prisma.weeklyRecapSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, channelId: channel.id }, update: { channelId: channel.id } });
    const { postWeeklyRecap } = await import("../../jobs/weeklyRecap");
    const result = await postWeeklyRecap(client, settings, { isTest: true });
    if (!result.ok) throw new Error(result.error ?? "The test recap didn't post.");
  },

  "/suggestion-analytics": async ({ guild, channel }) => {
    await prisma.suggestionAnalyticsSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, channelId: channel.id }, update: { channelId: channel.id } });
  },

  "/tickets": async ({ guild, channel, roles, ticketsCategoryId }) => {
    const type =
      (await prisma.ticketType.findFirst({ where: { guildId: guild.id, name: "Test Support" } })) ??
      (await prisma.ticketType.create({
        data: { guildId: guild.id, name: "Test Support", emoji: "🎟️", description: "A sample ticket type", categoryId: ticketsCategoryId, staffRoleIds: [roles.staff.id], openMessage: "Thanks for opening a test ticket. Staff will be with you shortly." },
      }));
    if (await prisma.ticketPanel.findFirst({ where: { guildId: guild.id, channelId: channel.id } })) return;
    // Posted by the ticket panel job within a minute.
    await prisma.ticketPanel.create({
      data: { guildId: guild.id, name: "Test Support Panel", channelId: channel.id, layout: "BUTTONS", typeIds: [type.id], description: "Tap the button below to open a private test ticket." },
    });
  },

  "/applications": async ({ guild, channel, roles }) => {
    const type =
      (await prisma.applicationType.findFirst({ where: { guildId: guild.id, name: "Test Application" } })) ??
      (await prisma.applicationType.create({
        data: {
          guildId: guild.id,
          name: "Test Application",
          emoji: "📝",
          description: "A sample application",
          reviewChannelId: channel.id,
          staffRoleIds: [roles.staff.id],
          questions: [
            { label: "Why do you want to join the team?", style: "PARAGRAPH", required: true },
            { label: "What time zone are you in?", style: "SHORT", required: true },
          ],
        },
      }));
    if (await prisma.applicationPanel.findFirst({ where: { guildId: guild.id, channelId: channel.id } })) return;
    await prisma.applicationPanel.create({
      data: { guildId: guild.id, name: "Test Applications", channelId: channel.id, layout: "BUTTONS", typeIds: [type.id], description: "Tap the button below to apply. The questions arrive in your DMs." },
    });
  },

  "/support-intake": async ({ guild, roles, ticketsCategoryId }) => {
    if (await prisma.supportFlow.findFirst({ where: { guildId: guild.id, label: "Test Support" } })) return;
    await prisma.supportFlow.create({
      data: {
        guildId: guild.id,
        label: "Test Support",
        categoryId: ticketsCategoryId,
        roleId: roles.staff.id,
        questions: {
          create: [
            { prompt: "What do you need help with?", mode: "TEXT", sortOrder: 0 },
            { prompt: "How urgent is it?", mode: "CHOICE", choices: ["Not urgent", "Soon", "Right now"], sortOrder: 1 },
          ],
        },
      },
    });
  },

  "/channel-locks": async ({ guild, channel }) => {
    await prisma.channelLock.upsert({
      where: { channelId: channel.id },
      create: { guildId: guild.id, channelId: channel.id, bannedWords: ["blocked"], notifyEnabled: true },
      update: {},
    });
  },

  "/slow-mode": async ({ channel }) => {
    if ("setRateLimitPerUser" in channel) await channel.setRateLimitPerUser(10, "Spartacus test setup");
  },

  // The stat channel is renamed to show the count, so it can't be the
  // channel !setup-test-server manages by name. It gets its own, outside
  // every managed category.
  "/stat-channels": async ({ guild }) => {
    const rows = await prisma.statChannel.findMany({ where: { guildId: guild.id } });
    for (const row of rows) {
      if (guild.channels.cache.has(row.channelId)) return;
    }
    const created = await guild.channels.create({
      name: `Members: ${guild.memberCount}`,
      type: ChannelType.GuildVoice,
      position: 0,
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: ["Connect"] }],
    });
    await prisma.statChannel.create({ data: { guildId: guild.id, channelId: created.id, statType: "MEMBER_COUNT", format: "{stat}: {count}" } });
  },

  "/status-channel": async ({ guild, channel }) => {
    await prisma.statusChannel.upsert({ where: { channelId: channel.id }, create: { guildId: guild.id, channelId: channel.id }, update: {} });
  },
};

// ---- seeders that need more than a channel ----

const voiceChannel = (guild: Guild, categoryId: string | null, name: string) =>
  guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice && c.name === name && (!categoryId || c.parentId === categoryId)) ?? null;

// Two games, the board posted here, and General VC as the lobby. Anyone can
// play, so a Tester doesn't need a separate Matchmaking role.
SEEDERS["/matches"] = async ({ client, guild, channel, roles, voiceCategoryId }) => {
  const games = [
    { game: "Valorant", teamSize: 5 },
    { game: "Rocket League", teamSize: 2 },
  ];
  await prisma.matchPreset.createMany({ data: games.map((g) => ({ guildId: guild.id, ...g })), skipDuplicates: true });
  const existing = await prisma.matchmakingConfig.findUnique({ where: { guildId: guild.id } });
  const listed = existing && Array.isArray(existing.games) ? existing.games : [];
  const lobby = voiceChannel(guild, voiceCategoryId, "General VC");
  const moved = !!existing && existing.channelId !== channel.id;
  const data = {
    enabled: true,
    channelId: channel.id,
    activityChannelId: channel.id,
    lobbyVoiceId: existing?.lobbyVoiceId ?? lobby?.id ?? null,
    staffRoleId: existing?.staffRoleId ?? roles.staff.id,
    ...(moved ? { messageId: null, panelMessages: [] } : {}),
  };
  await prisma.matchmakingConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, ...data, games: games.map((g) => g.game) },
    update: { ...data, ...(listed.length ? {} : { games: games.map((g) => g.game) }) },
  });
  const { syncMatchmakingPanel } = await import("../matches/matchmaking");
  await syncMatchmakingPanel(client, guild.id);
};

SEEDERS["/playing-now"] = async ({ client, guild, channel }) => {
  const { createPlayingNowRoles, syncPlayingNowPanel } = await import("../engagement/playingNow");
  const made = await createPlayingNowRoles(client, guild.id);
  if (made.error) throw new Error(made.error);
  const existing = await prisma.playingNowConfig.findUnique({ where: { guildId: guild.id } });
  const data = {
    channelId: channel.id,
    roleId: existing?.roleId ?? made.roleId,
    notifyRoleId: existing?.notifyRoleId ?? made.notifyRoleId,
    ...(existing && existing.channelId !== channel.id ? { panelMessageId: null } : {}),
  };
  await prisma.playingNowConfig.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, ...data }, update: data });
  const problem = await syncPlayingNowPanel(client, guild.id);
  if (problem) throw new Error(problem);
};

// A made-up streamer with a test alert, so the post can be seen without a
// live stream. Testers can use /golive for themselves.
SEEDERS["/stream-alerts"] = async ({ client, guild, channel, roles }) => {
  const settings = { defaultChannelId: channel.id, selfServeRoleId: roles.tester.id };
  await prisma.streamAlertSettings.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, ...settings, pingRoleId: roles.ping.id },
    update: settings,
  });
  if (await prisma.streamSubscription.findFirst({ where: { guildId: guild.id, displayName: "Test Streamer" } })) return;
  const sub = await prisma.streamSubscription.create({
    data: {
      guildId: guild.id,
      platform: "other",
      platformName: "Test Platform",
      channelName: "https://example.com/test-streamer",
      announceChannelId: channel.id,
      displayName: "Test Streamer",
      lastTitle: "Test stream: ranked grind",
      lastGame: "Rainbow Six Siege",
    },
  });
  const { sendTestAlert } = await import("../community/goLive");
  const result = await sendTestAlert(client, sub.id);
  if (!result.ok) throw new Error(result.error ?? "The test alert didn't post.");
};

SEEDERS["/role-manager"] = async ({ guild, channel, roles }) => {
  await prisma.roleManagerConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, staffRoleIds: [roles.staff.id], logChannelId: channel.id },
    update: { logChannelId: channel.id },
  });
};

SEEDERS["/partnerships"] = async ({ guild }) => {
  if (await prisma.serverPartnership.findFirst({ where: { guildId: guild.id, partnerName: "Test Partner Server" } })) return;
  await prisma.serverPartnership.create({ data: { guildId: guild.id, partnerName: "Test Partner Server", type: "Ad Exchange" } });
};

// The shop, crates and profile panel all post in the hub's channel. Panels
// are put up by their own jobs within a minute.
async function seedEconomyHubExtras({ guild, channel, roles }: Ctx) {
  const existing = await prisma.economyPlus.findUnique({ where: { guildId: guild.id } });
  const data = {
    shopEnabled: true,
    shopPanelChannelId: channel.id,
    cratesEnabled: true,
    crateChannelId: channel.id,
    voiceXpEnabled: true,
    ...(!existing || existing.shopPanelChannelId !== channel.id ? { shopPanelMessageId: null } : {}),
  };
  await prisma.economyPlus.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, ...data }, update: data });

  if ((await prisma.shopItem.count({ where: { guildId: guild.id } })) === 0) {
    const items: Array<Record<string, unknown>> = [
      ...STARTER_SHOP,
      { emoji: "🔴", name: "Test Red Role", description: "A cosmetic role for one day", price: 100, type: "ROLE", roleId: roles.red.id, durationDays: 1 },
    ];
    let sort = 0;
    for (const raw of items) {
      const item = cleanShopItem({ ...raw, stock: null, enabled: true, roleId: raw.roleId ?? null });
      if (typeof item !== "string") await prisma.shopItem.create({ data: { guildId: guild.id, sort: sort++, ...item } });
    }
  }

  const profile = await prisma.profileCardSettings.findUnique({ where: { guildId: guild.id } });
  const profileData = { panelChannelId: channel.id, ...(!profile || profile.panelChannelId !== channel.id ? { panelMessageId: null } : {}) };
  await prisma.profileCardSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, ...profileData }, update: profileData });
}

// ---- Tester role: who can see the test channels ----

const TESTER_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.UseApplicationCommands,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.UseVAD,
];
const BOT_PERMS = [
  ...TESTER_PERMS,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.MoveMembers,
];

interface Rule {
  id: string;
  allow?: bigint[];
  deny?: bigint[];
}

// Keeps whatever else is already set on the category, and replaces only the
// entries for the people and roles named in `rules`.
function withRules(category: CategoryChannel, rules: Rule[]): OverwriteResolvable[] {
  const ids = new Set(rules.map((r) => r.id));
  const kept = category.permissionOverwrites.cache.filter((o) => !ids.has(o.id)).map((o) => ({ id: o.id, type: o.type, allow: o.allow, deny: o.deny }));
  return [...kept, ...rules] as OverwriteResolvable[];
}

// Everyone can see #become-a-tester and nothing else here. Tapping its button
// gives the Tester role, which opens every test channel.
async function ensureStartHere(client: Client, guild: Guild, roles: Record<RoleKey, Role>): Promise<GuildBasedChannel> {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  let category = findCategory(guild, TESTER_START_CATEGORY);
  if (!category || category.type !== ChannelType.GuildCategory) {
    category = await guild.channels.create({
      name: TESTER_START_CATEGORY,
      type: ChannelType.GuildCategory,
      position: 0,
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.SendMessagesInThreads],
        },
        { id: me.id, allow: BOT_PERMS },
      ],
    });
  }
  let channel = guild.channels.cache.find((c) => c.parentId === category.id && c.name === TESTER_START_CHANNEL);
  if (!channel) {
    channel = await guild.channels.create({ name: TESTER_START_CHANNEL, type: ChannelType.GuildText, parent: category.id, topic: "Tap the button to become a Tester and open every test channel." });
  }

  if (!(await prisma.rolePanel.findFirst({ where: { guildId: guild.id, channelId: channel.id, name: "Become a Tester" } }))) {
    await prisma.rolePanel.create({
      data: {
        guildId: guild.id,
        name: "Become a Tester",
        channelId: channel.id,
        description: `Tap the button to get the **${TEST_ROLES.tester}** role and open every test channel. Tap it again to leave.`,
        layout: "BUTTONS",
        embedEnabled: true,
        embedColor: "#1ABC9C",
        options: [{ roleIds: [roles.tester.id], channelIds: [], label: "Become a Tester", emoji: "🧪" }],
      },
    });
  }

  const info = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle("🧪 How testing works here")
    .setDescription(`Tap **Become a Tester** below to get the **${TEST_ROLES.tester}** role. It opens every test channel, each with a card explaining what's set up and how to try it.`)
    .addFields(
      { name: "What you can do", value: "See and use every test channel, press the buttons and panels, run the bot's member commands (/rank, /daily, /trivia and so on) and join the voice channels." },
      { name: "What you can't do", value: "Nothing staff-level. The role has no permissions of its own, only access to the test channels, so you can't ban, kick, mute, manage roles or channels, or change server settings." },
      { name: "Heads up", value: "Posting in #honeypot times you out for a minute. Only post there to test it." }
    )
    .setFooter({ text: `${CARD_FOOTER} · tester access` });
  await postCard(client, channel, info);
  return channel;
}

// Hides every test category from @everyone and opens them to Testers, the
// bot and the owner. Returns how many categories were locked.
async function lockTestChannels(guild: Guild, roles: Record<RoleKey, Role>, ownerId: string, ticketsCategoryId: string) {
  const problems: string[] = [];
  let locked = 0;
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const owner = await guild.members.fetch(ownerId).catch(() => null);
  const base: Rule[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: me.id, allow: BOT_PERMS },
    ...(owner ? [{ id: owner.id, allow: [...TESTER_PERMS, PermissionFlagsBits.ManageMessages] }] : []),
  ];

  for (const { name } of buildLayout()) {
    const category = findCategory(guild, name);
    if (!category || category.type !== ChannelType.GuildCategory) continue;
    try {
      await category.permissionOverwrites.set(withRules(category, [...base, { id: roles.tester.id, allow: TESTER_PERMS }]), "Spartacus test setup: testers only");
      for (const child of guild.channels.cache.filter((c) => c.parentId === category.id && !c.isThread()).values()) {
        if ("lockPermissions" in child && "permissionsLocked" in child && child.permissionsLocked === false) await child.lockPermissions();
      }
      locked++;
    } catch (err) {
      problems.push(`Couldn't lock **${name}** to Testers: ${err instanceof Error ? err.message : err}. Check that I have Manage Roles and Manage Channels.`);
    }
  }

  // Private tickets and reports stay private: Testers don't get in here.
  const tickets = guild.channels.cache.get(ticketsCategoryId);
  if (tickets?.type === ChannelType.GuildCategory) {
    const staff: Rule = { id: roles.staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] };
    await tickets.permissionOverwrites.set(withRules(tickets, [...base, staff]), "Spartacus test setup: private tickets").catch((err) => {
      problems.push(`Couldn't lock **${TEST_TICKETS_CATEGORY}**: ${err instanceof Error ? err.message : err}.`);
    });
  }
  return { locked, problems };
}

// ---- roles, categories and channel lookup ----

// The Economy Hub page holds what used to be separate pages, so its channel
// gets all of their set-up.
SEEDERS["/economy-hub"] = async (ctx) => {
  for (const key of ["/leveling", "/level-roles", "/prestige", "/achievements", "/economy/settings"]) await SEEDERS[key](ctx);
  await seedEconomyHubExtras(ctx);
};

// Switched on with everything else: these are tabs of the Economy Hub, so no
// page of their own lists them.
const HUB_MODULE_KEYS: ModuleKey[] = ["LEVELING", "PRESTIGE", "VOICE_ACTIVITY", "ACHIEVEMENTS", "PROFILE_CARDS"];

async function ensureRoles(guild: Guild): Promise<Record<RoleKey, Role>> {
  await guild.roles.fetch();
  const roles = {} as Record<RoleKey, Role>;
  for (const [key, name] of Object.entries(TEST_ROLES) as Array<[RoleKey, string]>) {
    const colors: Partial<Record<RoleKey, number>> = { red: 0xed4245, blue: 0x5865f2, tester: 0x1abc9c };
    roles[key] =
      guild.roles.cache.find((r) => !r.managed && r.name === name) ??
      (await guild.roles.create({ name, permissions: [], mentionable: key === "ping", hoist: key === "tester", color: colors[key], reason: "Spartacus test setup" }));
  }
  return roles;
}

async function ensureTicketsCategory(guild: Guild): Promise<string> {
  const existing = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === TEST_TICKETS_CATEGORY);
  if (existing) return existing.id;
  return (await guild.channels.create({ name: TEST_TICKETS_CATEGORY, type: ChannelType.GuildCategory })).id;
}

function findCategory(guild: Guild, name: string) {
  const wanted = normalizeCategoryName(name);
  return guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && normalizeCategoryName(c.name) === wanted) ?? null;
}

function findChannel(guild: Guild, categoryName: string, channelName: string): GuildBasedChannel | null {
  const category = findCategory(guild, categoryName);
  if (!category) return null;
  return guild.channels.cache.find((c) => c.parentId === category.id && c.name.toLowerCase() === channelName.toLowerCase()) ?? null;
}

// ---- the card left in each channel ----

interface Target {
  key: string; // the page path, or the module key for a module with no page
  title: string;
  icon: string;
  purpose: string;
  where: string; // where to find it on the dashboard
  guide: TestGuide | undefined;
  moduleKey?: ModuleKey;
  categoryName: string;
  channelName: string;
  seeder?: (ctx: Ctx) => Promise<void>;
}

function buildTargets(): Target[] {
  const pages = NAV_SECTIONS.filter((s) => s.section).flatMap((section) =>
    section.items.map((item: NavItem): Target => {
      const guide = PAGE_GUIDES[item.href];
      return {
        key: item.href,
        title: guide?.title ?? item.label,
        icon: item.icon,
        purpose: guide?.purpose ?? "",
        where: `Dashboard → ${section.section} → ${item.label}`,
        guide: TEST_GUIDES[item.href],
        moduleKey: item.moduleKey,
        categoryName: section.section as string,
        channelName: slugifyModuleLabel(item.label),
        seeder: SEEDERS[item.href],
      };
    })
  );
  const extras = UNLISTED_MODULES.map(({ key, description }): Target => {
    const guide = EXTRA_GUIDES[key];
    return {
      key,
      title: guide?.title ?? MODULE_LABELS[key],
      icon: "🧪",
      purpose: guide?.purpose ?? description,
      where: `Dashboard → Modules → ${MODULE_LABELS[key]}`,
      guide,
      moduleKey: key,
      categoryName: EXTRAS_CATEGORY,
      channelName: slugifyModuleLabel(MODULE_LABELS[key]),
    };
  });
  return [...pages, ...extras];
}

function buildCard(target: Target, problem?: string) {
  const embed = new EmbedBuilder().setColor(problem ? 0xf5a524 : 0x00e5ff).setTitle(`${target.icon} ${target.title}`.slice(0, 256));
  if (target.purpose) embed.setDescription(target.purpose);
  if (target.guide) {
    embed.addFields({ name: "Set up for you", value: target.guide.prepared.slice(0, 1024) });
    embed.addFields({ name: "Try it", value: target.guide.tryIt.map((step, i) => `${i + 1}. ${step}`).join("\n").slice(0, 1024) });
    if (target.guide.needs) embed.addFields({ name: "You'll need", value: target.guide.needs.slice(0, 1024) });
  }
  if (problem) embed.addFields({ name: "⚠️ Part of the setup didn't finish", value: problem.slice(0, 1024) });
  embed.addFields({ name: "Settings", value: target.where });
  embed.setFooter({ text: `${CARD_FOOTER} · !setup-test-modules` });
  return embed;
}

// Edits the card from an earlier run instead of stacking a new one under it.
async function postCard(client: Client, channel: GuildBasedChannel, embed: EmbedBuilder) {
  if (!isSendableChannel(channel)) return;
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const previous = recent?.find((m) => m.author.id === client.user?.id && m.embeds[0]?.footer?.text?.startsWith(CARD_FOOTER));
  if (previous) await previous.edit({ embeds: [embed] });
  else await channel.send({ embeds: [embed] });
}

// ---- running it ----

interface Report {
  enabled: number;
  cards: number;
  missing: string[];
  problems: string[];
  locked: number;
  signup: string | null;
}

async function run(client: Client, guild: Guild, ownerId: string, progress: (text: string) => Promise<unknown>): Promise<Report> {
  const report: Report = { enabled: 0, cards: 0, missing: [], problems: [], locked: 0, signup: null };
  await guild.channels.fetch();
  await prisma.guild.upsert({ where: { id: guild.id }, create: { id: guild.id, name: guild.name }, update: {} });

  const roles = await ensureRoles(guild);
  const ticketsCategoryId = await ensureTicketsCategory(guild);
  const voiceCategoryId = findCategory(guild, EXTRA_VOICE_CATEGORY.name)?.id ?? null;
  const targets = buildTargets();

  // The one channel everyone can see, where a button gives the Tester role.
  const signup = await ensureStartHere(client, guild, roles).catch((err) => {
    report.problems.push(`**Tester sign-up**: ${err instanceof Error ? err.message : err}`);
    logError("bot", err, guild.id);
    return null;
  });
  report.signup = signup?.id ?? null;

  // Everything is switched on before anything posts, since most posters
  // check their module's switch first.
  const keys = [...new Set([...targets.map((t) => t.moduleKey).filter((k): k is ModuleKey => !!k), ...HUB_MODULE_KEYS])];
  for (const key of keys) {
    await prisma.moduleToggle.upsert({ where: { guildId_key: { guildId: guild.id, key } }, create: { guildId: guild.id, key, enabled: true }, update: { enabled: true } });
    invalidateModuleCache(guild.id, key);
  }
  report.enabled = keys.length;

  let done = 0;
  for (const target of targets) {
    done++;
    if (done % 10 === 0) await progress(`⏳ Setting up modules… ${done}/${targets.length}`).catch(() => null);

    const channel = findChannel(guild, target.categoryName, target.channelName);
    if (!channel) {
      report.missing.push(`#${target.channelName}`);
      continue;
    }

    let problem: string | undefined;
    if (target.seeder) {
      const ctx: Ctx = { client, guild, ownerId, channel, roles, ticketsCategoryId, voiceCategoryId, sibling: (name) => findChannel(guild, target.categoryName, name) };
      await target.seeder(ctx).catch((err) => {
        problem = err instanceof Error ? err.message : String(err);
        report.problems.push(`**${target.title}**: ${problem}`);
        logError("bot", err, guild.id);
      });
    }
    await postCard(client, channel, buildCard(target, problem)).then(
      () => report.cards++,
      (err) => {
        report.problems.push(`**${target.title}**: couldn't post its card (${err instanceof Error ? err.message : err}).`);
      }
    );
  }

  // The question feed's channel has no page of its own, so it borrows the
  // Quote of the Day card.
  for (const [href, names] of Object.entries(EXTRA_PAGE_CHANNELS)) {
    const target = targets.find((t) => t.key === href);
    if (!target) continue;
    for (const name of names) {
      const channel = findChannel(guild, target.categoryName, name);
      if (channel) await postCard(client, channel, buildCard(target)).catch(() => null);
      else report.missing.push(`#${name}`);
    }
  }

  // Last, so the bot is never locked out while it is still posting.
  const lock = await lockTestChannels(guild, roles, ownerId, ticketsCategoryId).catch((err) => ({ locked: 0, problems: [`Couldn't lock the test channels: ${err instanceof Error ? err.message : err}`] }));
  report.locked = lock.locked;
  report.problems.push(...lock.problems);
  return report;
}

const pending = new Map<string, { guildId: string; createdAt: number }>();
const CONFIRM_TTL_MS = 5 * MINUTE;
const running = new Set<string>();

// Called from messageCreate.ts once it's verified the message is exactly
// "!setup-test-modules" from the owner's own account in a guild.
export async function runSetupTestModules(message: Message) {
  const guild = message.guild;
  if (!guild) return;
  await guild.channels.fetch();

  const targets = buildTargets();
  const missing = targets.filter((t) => !findChannel(guild, t.categoryName, t.channelName));
  const token = Math.random().toString(36).slice(2, 10);
  for (const [key, entry] of pending) if (entry.createdAt < Date.now() - CONFIRM_TTL_MS) pending.delete(key);
  pending.set(token, { guildId: guild.id, createdAt: Date.now() });

  const lines = [
    `**This sets up ${guild.name} for testing every module.** It will:`,
    `• Turn on ${new Set(targets.map((t) => t.moduleKey).filter(Boolean)).size} modules.`,
    "• Point each module at its own channel, in the category it sits in now. Other settings you've already changed are kept.",
    `• Create ${Object.keys(TEST_ROLES).length} test roles with no permissions (${Object.values(TEST_ROLES).join(", ")}) and a "${TEST_TICKETS_CATEGORY}" category.`,
    "• Post each module's panel or sample (tickets, rules, a poll, a giveaway, today's quote and question, and so on).",
    "• Leave a card in every channel saying what was set up and how to try it.",
    `• Make a "${TESTER_START_CATEGORY}" channel (#${TESTER_START_CHANNEL}) where anyone can tap a button to get the **${TEST_ROLES.tester}** role. Every test category is then hidden from everyone except Testers, you and me. **Members without the role lose sight of the test channels.** Testers get no staff permissions.`,
    "",
    `⚠️ Only run this in a test server. It changes where modules post, makes #honeypot a live trap, sets the starboard to 1 star, and adds the banned word \`${TEST_AUTOMOD_WORD}\`.`,
  ];
  if (missing.length > 0) {
    lines.push("", `${missing.length} channel(s) don't exist yet and will be skipped: ${missing.slice(0, 12).map((t) => `#${t.channelName}`).join(", ")}${missing.length > 12 ? "…" : ""}. Run \`!setup-test-server\` first to create them.`);
  }

  await message.reply({
    content: lines.join("\n"),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`setuptestmodules:confirm:${token}`).setLabel("Set Up Everything").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`setuptestmodules:skip:${token}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
      ),
    ],
  });
}

export async function handleSetupTestModules(interaction: ButtonInteraction, action: string, token: string) {
  if (!isOwner(interaction.user.id)) {
    await interaction.reply({ content: "This command is restricted to the bot owner.", ephemeral: true });
    return;
  }
  const entry = pending.get(token);
  pending.delete(token);
  const guild = interaction.guild;
  if (action === "skip") {
    await interaction.update({ content: "Canceled. Nothing was changed.", components: [] });
    return;
  }
  if (!entry || !guild || entry.guildId !== guild.id || entry.createdAt < Date.now() - CONFIRM_TTL_MS) {
    await interaction.update({ content: "This confirmation has expired. Run `!setup-test-modules` again.", components: [] });
    return;
  }
  if (running.has(guild.id)) {
    await interaction.reply({ content: "A setup is already running here. Give it a minute.", ephemeral: true });
    return;
  }

  running.add(guild.id);
  await interaction.update({ content: "⏳ Setting up modules… this takes a minute or two.", components: [] });
  // Interaction tokens last 15 minutes, which is far longer than this runs,
  // but the message itself is edited so progress survives either way.
  const edit = (content: string) => interaction.message.edit({ content });
  try {
    const report = await run(interaction.client, guild, interaction.user.id, edit);
    const parts = [
      `✅ Turned on ${report.enabled} modules and posted ${report.cards} test cards.`,
      report.signup ? `🧪 People can join by tapping the button in <#${report.signup}>. ${report.locked} categories are now Testers only.` : "",
      "Panels made by background jobs (tickets, applications, reaction roles, giveaway, status, birthday button) show up within a minute.",
      "Open any channel and follow its card.",
    ];
    if (report.missing.length > 0) parts.push(`⚠️ Skipped ${report.missing.length} missing channel(s): ${report.missing.slice(0, 15).join(", ")}. Run \`!setup-test-server\`, then run this again.`);
    if (report.problems.length > 0) parts.push(`⚠️ ${report.problems.length} thing(s) need a look:\n${report.problems.slice(0, 10).join("\n")}`);
    await edit(parts.filter(Boolean).join("\n").slice(0, 2000));
  } catch (err) {
    logError("bot", err, guild.id);
    await edit(`⚠️ Setup stopped early: ${err instanceof Error ? err.message : err}. Check that I have Manage Roles and Manage Channels, then run it again.`).catch(() => null);
  } finally {
    running.delete(guild.id);
  }
}
