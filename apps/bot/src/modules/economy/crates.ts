import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type ButtonInteraction, type ChatInputCommandInteraction, type Guild } from "discord.js";
import { CRATE_INFO, CRATE_RARITIES, CRATE_TABLE, type CrateRarity, type CrateReward } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import { addBalance, getConfig } from "../../lib/economy";
import { economyPlus, giveBoost, giveCrates, giveFreezes } from "../../lib/economyPlus";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function roll(rarity: CrateRarity): CrateReward {
  let r = Math.random() * 100;
  for (const [chance, reward] of CRATE_TABLE[rarity]) {
    if (r < chance) return reward;
    r -= chance;
  }
  return CRATE_TABLE[rarity][0][1];
}

async function applyReward(guild: Guild, userId: string, reward: CrateReward): Promise<string> {
  const cfg = await getConfig(guild.id);
  if (reward.kind === "coins") {
    const amount = reward.min + Math.floor(Math.random() * (reward.max - reward.min + 1));
    await addBalance(guild.id, userId, amount, "crate", cfg.maxBalance);
    return `${cfg.currencyIcon} **${amount.toLocaleString("en-US")} ${cfg.currencyName}**`;
  }
  if (reward.kind === "boost") {
    const until = await giveBoost(guild.id, userId, reward.mult, reward.minutes);
    const len = reward.minutes >= 60 ? `${reward.minutes / 60} hour${reward.minutes === 60 ? "" : "s"}` : `${reward.minutes} minutes`;
    return `🧪 **${reward.mult}x XP Potion** for ${len} (running until <t:${Math.floor(until.getTime() / 1000)}:t>)`;
  }
  if (reward.kind === "freeze") {
    await giveFreezes(guild.id, userId, reward.count);
    return `🛡️ **${reward.count} Streak Freeze${reward.count === 1 ? "" : "s"}**`;
  }
  await giveCrates(guild.id, userId, reward.rarity);
  return `${CRATE_INFO[reward.rarity].emoji} a **${CRATE_INFO[reward.rarity].name} Crate**!`;
}

async function inventoryView(guildId: string, userId: string, note?: string) {
  const inv = await prisma.economyInventory.findUnique({ where: { guildId_userId: { guildId, userId } } });
  const counts: Record<CrateRarity, number> = { common: inv?.common ?? 0, rare: inv?.rare ?? 0, epic: inv?.epic ?? 0, legendary: inv?.legendary ?? 0 };
  const boostOn = inv?.boostUntil && inv.boostUntil.getTime() > Date.now();
  const embed = new EmbedBuilder()
    .setColor(0xb07cff)
    .setTitle("🎁 Your crates")
    .setDescription(
      [
        ...CRATE_RARITIES.map((r) => `${CRATE_INFO[r].emoji} **${CRATE_INFO[r].name}:** ${counts[r]}`),
        "",
        `🛡️ Streak freezes: **${inv?.streakFreezes ?? 0}**`,
        boostOn ? `🧪 XP potion: **${inv?.boostMult}x** until <t:${Math.floor((inv?.boostUntil as Date).getTime() / 1000)}:t>` : null,
        "",
        "-# Crates come from levelling up, 7-day /daily streaks, Weekly Champions and the /shop.",
        note ? `\n${note}` : null,
      ]
        .filter((l) => l !== null)
        .join("\n")
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    CRATE_RARITIES.map((r) =>
      new ButtonBuilder()
        .setCustomId(`ecrate:open:${r}`)
        .setLabel(`Open ${CRATE_INFO[r].name}`)
        .setEmoji(CRATE_INFO[r].emoji)
        .setStyle(r === "legendary" ? ButtonStyle.Success : r === "common" ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(counts[r] === 0)
    )
  );
  return { embeds: [embed], components: [row] };
}

export async function runCratesCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  const plus = await economyPlus(interaction.guildId);
  if (!plus.cratesEnabled) {
    await interaction.reply({ content: "Loot crates are turned off in this server.", ephemeral: true });
    return;
  }
  await interaction.reply({ ...(await inventoryView(interaction.guildId, interaction.user.id)), ephemeral: true });
}

export async function handleCrateButton(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;
  if (!(await isModuleEnabled(guild.id, "ECONOMY")) || !(await economyPlus(guild.id)).cratesEnabled) {
    await interaction.reply({ content: "Loot crates are turned off in this server.", ephemeral: true });
    return;
  }
  const rarity = interaction.customId.split(":")[2] as CrateRarity;
  if (!CRATE_RARITIES.includes(rarity)) return;
  const userId = interaction.user.id;
  // Take the crate first (one statement), so a double click can't open it twice.
  const taken = await prisma.economyInventory.updateMany({ where: { guildId: guild.id, userId, [rarity]: { gt: 0 } }, data: { [rarity]: { decrement: 1 } } });
  if (!taken.count) {
    await interaction.update(await inventoryView(guild.id, userId, "You don't have one of those."));
    return;
  }
  await interaction.update(await inventoryView(guild.id, userId, `Opening a ${CRATE_INFO[rarity].name} Crate below…`));

  const info = CRATE_INFO[rarity];
  const channel = interaction.channel;
  const name = interaction.member && "displayName" in interaction.member ? interaction.member.displayName : interaction.user.username;
  const spin = ["🪙", "🧪", "🛡️", "💎", "🪙", "🎁", "🧪", "👑"];
  const frame = (i: number) =>
    new EmbedBuilder().setColor(info.color as `#${string}`).setTitle(`${info.emoji} ${name} is opening a ${info.name} Crate…`).setDescription(`# ${spin[i % spin.length]} ${spin[(i + 3) % spin.length]} ${spin[(i + 5) % spin.length]}`);
  const msg = await interaction.followUp({ embeds: [frame(0)] }).catch(() => null);
  for (let i = 1; i <= 3 && msg; i++) {
    await wait(650);
    await msg.edit({ embeds: [frame(i)] }).catch(() => null);
  }
  const reward = roll(rarity);
  const text = await applyReward(guild, userId, reward);
  const done = new EmbedBuilder()
    .setColor(info.color as `#${string}`)
    .setTitle(`${info.emoji} ${info.name} Crate opened!`)
    .setDescription(`<@${userId}> got ${text}`);
  if (msg) await msg.edit({ embeds: [done] }).catch(() => null);
  else await interaction.followUp({ embeds: [done] }).catch(() => null);

  // Big pulls are announced where the server wants them.
  const big = rarity === "epic" || rarity === "legendary" || reward.kind === "crate";
  const plus = await economyPlus(guild.id);
  if (big && plus.crateChannelId && plus.crateChannelId !== channel?.id) {
    const ch = await guild.channels.fetch(plus.crateChannelId).catch(() => null);
    if (ch && isSendableChannel(ch)) await ch.send({ embeds: [done.setTitle(`🎉 ${name} pulled from a ${info.name} Crate!`)], allowedMentions: { parse: [] } }).catch(() => null);
  }
}

// For the shop panel's My Crates button.
export async function cratesReply(guildId: string, userId: string) {
  if (!(await economyPlus(guildId)).cratesEnabled) return { content: "Loot crates are turned off in this server.", embeds: [], components: [] };
  return inventoryView(guildId, userId);
}
