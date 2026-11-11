import { AttachmentBuilder, EmbedBuilder, type Client, type Guild, type GuildMember } from "discord.js";
import { CRATE_INFO, ladderRung, levelColor, levelCrateRarity, xpForLevel } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { isModuleEnabled } from "../../lib/moduleGate";
import { addBalance, getConfig } from "../../lib/economy";
import { economyPlus, giveCrates } from "../../lib/economyPlus";
import { awardAchievement, checkCustomAchievements } from "../../lib/achievements";
import { drawLevelUpCard } from "../../lib/levelUpCard";

// Level roles: give the role for each level crossed. With "keep only the
// newest level role" on, the lower ones come off, so the member's name color
// is always their current rung's color.
async function syncLevelRoles(guild: Guild, member: GuildMember, level: number, keepTop: boolean): Promise<string | null> {
  const roles = await prisma.levelRole.findMany({ where: { guildId: guild.id }, orderBy: { level: "asc" } });
  const earned = roles.filter((r) => r.level <= level);
  if (!earned.length) return null;
  const top = earned[earned.length - 1];
  const give = keepTop ? [top] : earned;
  const newlyGiven: string[] = [];
  for (const r of give) {
    if (!member.roles.cache.has(r.roleId)) {
      const ok = await member.roles.add(r.roleId, `Level ${r.level} reward`).then(() => true, () => false);
      if (ok) newlyGiven.push(r.roleId);
    }
  }
  if (keepTop) {
    for (const r of roles) {
      if (r.roleId !== top.roleId && member.roles.cache.has(r.roleId)) await member.roles.remove(r.roleId, "Replaced by a higher level role").catch(() => null);
    }
  }
  return newlyGiven.includes(top.roleId) ? top.roleId : null;
}

// Everything that happens when someone levels up (from chatting or voice):
// rewards for every level crossed, then one announcement for the new level.
export async function handleLevelUp(client: Client, guild: Guild, userId: string, from: number, to: number, fallbackChannelId: string | null) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  const [plus, levelSettings, economyOn] = await Promise.all([
    economyPlus(guild.id),
    prisma.levelingSettings.findUnique({ where: { guildId: guild.id } }),
    isModuleEnabled(guild.id, "ECONOMY"),
  ]);

  // Rewards for each level crossed
  const lines: string[] = [];
  if (economyOn && plus.levelUpCoins > 0) {
    const config = await getConfig(guild.id);
    const coins = plus.levelUpCoins * (to - from);
    await addBalance(guild.id, userId, coins, "level_up", config.maxBalance);
    lines.push(`${config.currencyIcon} **${coins.toLocaleString("en-US")} ${config.currencyName}**`);
  }
  if (economyOn && plus.cratesEnabled && plus.crateEveryLevels > 0) {
    for (let l = from + 1; l <= to; l++) {
      if (l % plus.crateEveryLevels !== 0) continue;
      const rarity = levelCrateRarity(l);
      await giveCrates(guild.id, userId, rarity);
      lines.push(`${CRATE_INFO[rarity].emoji} **${CRATE_INFO[rarity].name} Crate** (open it with /crates)`);
    }
  }
  const newRole = await syncLevelRoles(guild, member, to, plus.keepTopLevelRole);
  if (newRole) lines.unshift(`🎖️ <@&${newRole}>`);

  // Achievements
  if (to >= 10 && from < 10) await awardAchievement(client, guild.id, userId, "LEVEL_10", "Level 10", fallbackChannelId ?? undefined);
  if (to >= 25 && from < 25) await awardAchievement(client, guild.id, userId, "LEVEL_25", "Level 25", fallbackChannelId ?? undefined);
  if (to >= 50 && from < 50) await awardAchievement(client, guild.id, userId, "LEVEL_50", "Level 50", fallbackChannelId ?? undefined);
  await checkCustomAchievements(client, guild.id, userId, "LEVEL", to, fallbackChannelId ?? undefined);

  // The announcement
  const channelId = levelSettings?.channelId ?? fallbackChannelId;
  const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
  if (!channel || !isSendableChannel(channel)) return;
  const text = (levelSettings?.levelUpMessage || "🎉 {user} just reached **Level {level}**!").replace(/{user}/g, `${member}`).replace(/{level}/g, String(to));
  if (!plus.levelColors && !plus.levelUpCard) {
    await channel.send({ content: text + (lines.length ? `\n${lines.map((l) => `• ${l}`).join("\n")}` : "") }).catch(() => null);
    return;
  }
  const color = plus.levelColors ? levelColor(to, plus.ladder) : "#5865F2";
  const rung = ladderRung(to, plus.ladder);
  const next = plus.ladder.find((r) => r.level > to);
  const nextLine = next ? `Next: ${next.name} at level ${next.level} (${(xpForLevel(next.level)).toLocaleString("en-US")} XP)` : "Top of the ladder. Time to /prestige?";
  const embed = new EmbedBuilder()
    .setColor(color as `#${string}`)
    .setDescription([text, lines.length ? `\n**Rewards**\n${lines.map((l) => `• ${l}`).join("\n")}` : "", `\n-# ${nextLine}`].join("\n").trim());
  const files: AttachmentBuilder[] = [];
  if (plus.levelUpCard) {
    const png = await drawLevelUpCard({
      name: member.displayName,
      avatarUrl: member.displayAvatarURL({ extension: "png" }),
      level: to,
      color,
      rankName: rung && rung.level <= to ? rung.name : null,
      nextLine,
    }).catch(() => null);
    if (png) {
      files.push(new AttachmentBuilder(png, { name: "levelup.png" }));
      embed.setImage("attachment://levelup.png");
    }
  }
  await channel.send({ content: `${member}`, embeds: [embed], files, allowedMentions: { users: [userId] } }).catch(() => null);
}
