import { Events, Message } from "discord.js";
import { isModuleEnabled } from "../lib/moduleGate";
import { checkAutomod, handleViolation } from "../modules/moderation/automod";
import { awardMessageXp } from "../modules/leveling/xp";
import { grantLevelRoles } from "../modules/leveling/levelRoles";
import { prisma } from "../lib/prisma";
import { customCommandCache } from "../lib/cache";
import { isSendableChannel } from "../lib/channels";
import { addBalance, getConfig as getEconomyConfig } from "../lib/economy";
import { checkCountingMessage } from "../modules/games/countingGame";

export const name = Events.MessageCreate;

export async function execute(message: Message) {
  if (message.author.bot || !message.guildId) return;

  // --- Moderation / automod ---
  if (await isModuleEnabled(message.guildId, "MODERATION")) {
    const toggle = await prisma.moduleToggle.findUnique({
      where: { guildId_key: { guildId: message.guildId, key: "MODERATION" } },
    });
    const config = (toggle?.config as { bannedWords?: string[]; antiLink?: boolean; spamCap?: boolean }) ?? {};

    const violation = checkAutomod(message, config);
    if (violation) {
      await handleViolation(message, violation);
      return; // don't also award XP / process commands for a removed message
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
      }
    }
  }

  // --- Economy: passive message earning ---
  if (await isModuleEnabled(message.guildId, "ECONOMY")) {
    const config = await getEconomyConfig(message.guildId);
    const amount = Math.floor(Math.random() * (config.messageEarnMax - config.messageEarnMin + 1)) + config.messageEarnMin;
    await addBalance(message.guildId, message.author.id, amount);
  }

  // --- Counting game ---
  if (await isModuleEnabled(message.guildId, "COUNTING_GAME")) {
    await checkCountingMessage(message);
  }

  // --- Dynamic custom commands (e.g. !socials) ---
  if (message.content.startsWith("!") && (await isModuleEnabled(message.guildId, "CUSTOM_COMMANDS"))) {
    const trigger = message.content.slice(1).trim().toLowerCase();
    if (!trigger) return;

    let guildCommands = customCommandCache.get(message.guildId);
    if (!guildCommands) {
      const rows = await prisma.customCommand.findMany({ where: { guildId: message.guildId } });
      guildCommands = new Map(rows.map((r) => [r.trigger.toLowerCase(), r.response]));
      customCommandCache.set(message.guildId, guildCommands);
    }

    const response = guildCommands.get(trigger);
    if (response && isSendableChannel(message.channel)) await message.channel.send(response);
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
