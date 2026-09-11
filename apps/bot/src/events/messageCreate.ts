import { Events, Message } from "discord.js";
import { isModuleEnabled } from "../lib/moduleGate";
import { checkAutomod, handleViolation, type AutomodConfig } from "../modules/moderation/automod";
import { awardMessageXp } from "../modules/leveling/xp";
import { grantLevelRoles } from "../modules/leveling/levelRoles";
import { prisma } from "../lib/prisma";
import { customCommandCache } from "../lib/cache";
import { buildStickyPayload } from "../lib/stickyRender";
import { isSendableChannel } from "../lib/channels";
import { awardMessageEarnings } from "../lib/economy";
import { checkCountingMessage } from "../modules/games/countingGame";
import { awardAchievement } from "../lib/achievements";

export const name = Events.MessageCreate;

export async function execute(message: Message) {
  if (message.author.bot || !message.guildId) return;

  // --- Moderation / automod ---
  if (await isModuleEnabled(message.guildId, "MODERATION")) {
    const toggle = await prisma.moduleToggle.findUnique({
      where: { guildId_key: { guildId: message.guildId, key: "MODERATION" } },
    });
    const config = (toggle?.config as AutomodConfig) ?? {};

    const immuneRoleIds = Array.isArray(config.immuneRoleIds) ? config.immuneRoleIds : [];
    const isImmune = message.member && immuneRoleIds.some((roleId) => message.member!.roles.cache.has(roleId));

    const violation = !isImmune && checkAutomod(message, config);
    if (violation) {
      await handleViolation(message, violation);
      return; // don't also award XP / process commands for a removed message
    }
  }

  // --- Achievements: first-ever tracked message ---
  // Checked independently of leveling (via a findUnique on the Achievement
  // row itself, relying on awardAchievement's create+P2002 idempotency) so
  // this achievement works even in servers that never turn LEVELING on.
  if (await isModuleEnabled(message.guildId, "ACHIEVEMENTS")) {
    const already = await prisma.achievement.findUnique({
      where: { guildId_userId_type: { guildId: message.guildId, userId: message.author.id, type: "FIRST_MESSAGE" } },
    });
    if (!already) {
      await awardAchievement(message.client, message.guildId, message.author.id, "FIRST_MESSAGE", "First Message", message.channelId);
    }
  }

  // --- Leveling ---
  if (await isModuleEnabled(message.guildId, "LEVELING")) {
    const blacklisted = await isXpBlacklisted(message);
    if (!blacklisted) {
      const result = await awardMessageXp(message.guildId, message.author.id);
      if (result?.leveledUp) {
        if (isSendableChannel(message.channel)) {
          await message.channel.send(`🎉 ${message.author} just reached **Level ${result.level}**!`).catch(() => null);
        }
        await grantLevelRoles(message.guild, message.author.id, result.level);

        if (result.level >= 10) {
          await awardAchievement(message.client, message.guildId, message.author.id, "LEVEL_10", "Level 10", message.channelId);
        }
        if (result.level >= 25) {
          await awardAchievement(message.client, message.guildId, message.author.id, "LEVEL_25", "Level 25", message.channelId);
        }
        if (result.level >= 50) {
          await awardAchievement(message.client, message.guildId, message.author.id, "LEVEL_50", "Level 50", message.channelId);
        }
      }
    }
  }

  // --- Economy: passive message earning ---
  if (message.member && (await isModuleEnabled(message.guildId, "ECONOMY"))) {
    await awardMessageEarnings(message.guildId, message.member, message.channelId, message.content);
  }

  // --- Growth analytics: running daily message counter ---
  if (await isModuleEnabled(message.guildId, "GROWTH_ANALYTICS")) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.dailyMessageCount.upsert({
      where: { guildId_date: { guildId: message.guildId, date: today } },
      create: { guildId: message.guildId, date: today, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  // --- Counting game ---
  if (await isModuleEnabled(message.guildId, "COUNTING_GAME")) {
    await checkCountingMessage(message);
  }

  // --- LFG (looking for group) prefix trigger, e.g. !lfg need 2 more ---
  if (message.content.startsWith("!") && (await isModuleEnabled(message.guildId, "LFG"))) {
    const words = message.content.slice(1).trim().split(/\s+/);
    const word = (words.shift() || "").toLowerCase();
    if (word) {
      const lfg = await prisma.lfgCommand.findUnique({ where: { guildId_trigger: { guildId: message.guildId, trigger: word } } });
      if (lfg && lfg.enabled) {
        const { handleLfgMessage } = await import("../modules/community/lfg");
        await handleLfgMessage(message, lfg, words.join(" "));
        return;
      }
    }
  }

  // --- Dynamic custom commands (e.g. !socials) ---
  if (message.content.startsWith("!") && (await isModuleEnabled(message.guildId, "CUSTOM_COMMANDS"))) {
    const trigger = message.content.slice(1).trim().toLowerCase();
    if (!trigger) return;

    let guildCommands = customCommandCache.get(message.guildId);
    if (!guildCommands) {
      const rows = await prisma.customCommand.findMany({ where: { guildId: message.guildId } });
      guildCommands = new Map(
        rows.map((r) => [
          r.trigger.toLowerCase(),
          {
            response: r.response,
            embedEnabled: r.embedEnabled,
            embedTitle: r.embedTitle,
            embedColor: r.embedColor,
            buttons: r.buttons,
            embedExtra: r.embedExtra,
          },
        ])
      );
      customCommandCache.set(message.guildId, guildCommands);
    }

    const command = guildCommands.get(trigger);
    if (command && isSendableChannel(message.channel)) {
      await message.channel.send(
        buildStickyPayload({
          content: command.response,
          embedEnabled: command.embedEnabled,
          embedTitle: command.embedTitle,
          embedDescription: command.response,
          embedColor: command.embedColor,
          buttons: command.buttons,
          embedExtra: command.embedExtra,
        })
      );
    }
  }
}

async function isXpBlacklisted(message: Message): Promise<boolean> {
  if (!message.guildId) return false;
  const entries = await prisma.xpBlacklistEntry.findMany({ where: { guildId: message.guildId } });
  if (entries.length === 0) return false;

  const blacklistedChannels = new Set(entries.filter((e) => e.type === "CHANNEL").map((e) => e.targetId));
  if (blacklistedChannels.has(message.channelId)) return true;

  const blacklistedRoles = new Set(entries.filter((e) => e.type === "ROLE").map((e) => e.targetId));
  const member = message.member;
  if (member && [...blacklistedRoles].some((roleId) => member.roles.cache.has(roleId))) return true;

  return false;
}
