import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type StringSelectMenuInteraction,
} from "discord.js";
import { CRATE_INFO, type CrateRarity } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";
import { getConfig } from "../../lib/economy";
import { economyPlus, giveBoost, giveCrates, giveFreezes } from "../../lib/economyPlus";

type Item = Awaited<ReturnType<typeof prisma.shopItem.findMany>>[number];

function itemLine(i: Item, icon: string) {
  const stock = i.stock === null ? "" : i.stock > 0 ? ` · ${i.stock} left` : " · **sold out**";
  return `${i.emoji} **${i.name}** — ${icon} ${i.price.toLocaleString("en-US")}${stock}${i.description ? `\n-# ${i.description}` : ""}`;
}

async function shopView(guildId: string, userId: string, note?: string) {
  const [items, cfg, bal] = await Promise.all([
    prisma.shopItem.findMany({ where: { guildId, enabled: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    getConfig(guildId),
    prisma.economyBalance.findUnique({ where: { guildId_userId: { guildId, userId } } }),
  ]);
  const embed = new EmbedBuilder()
    .setColor((cfg.embedColor as `#${string}`) || 0xe8c547)
    .setTitle("🛒 Reward Shop")
    .setDescription(
      [items.length ? items.map((i) => itemLine(i, cfg.currencyIcon)).join("\n\n") : "Nothing for sale yet.", "", `Your balance: ${cfg.currencyIcon} **${(bal?.balance ?? 0).toLocaleString("en-US")} ${cfg.currencyName}**`, note ? `\n${note}` : ""].join("\n")
    );
  const components = items.length
    ? [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("eshop:pick")
            .setPlaceholder("Pick something to buy")
            .addOptions(
              items.slice(0, 25).map((i) => ({
                label: i.name.slice(0, 100),
                value: i.id,
                description: `${i.price.toLocaleString("en-US")} ${cfg.currencyName}${i.stock === 0 ? " · sold out" : ""}`.slice(0, 100),
                emoji: /^<a?:\w+:\d+>$/.test(i.emoji) || /\p{Extended_Pictographic}/u.test(i.emoji) ? i.emoji : undefined,
              }))
            )
        ),
      ]
    : [];
  return { embeds: [embed], components };
}

export async function runShopCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  if (!(await economyPlus(interaction.guildId)).shopEnabled) {
    await interaction.reply({ content: "The shop is closed in this server.", ephemeral: true });
    return;
  }
  await interaction.reply({ ...(await shopView(interaction.guildId, interaction.user.id)), ephemeral: true });
}

async function deliver(guild: Guild, userId: string, item: Item): Promise<string> {
  if (item.type === "ROLE" && item.roleId) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const ok = member ? await member.roles.add(item.roleId, `Bought ${item.name}`).then(() => true, () => false) : false;
    if (!ok) throw new Error("role");
    if (item.durationDays) {
      const expiresAt = new Date(Date.now() + item.durationDays * 86_400_000);
      // Buying again extends it.
      const existing = await prisma.economyTimedRole.findUnique({ where: { guildId_userId_roleId: { guildId: guild.id, userId, roleId: item.roleId } } });
      const until = existing && existing.expiresAt > new Date() ? new Date(existing.expiresAt.getTime() + item.durationDays * 86_400_000) : expiresAt;
      await prisma.economyTimedRole.upsert({
        where: { guildId_userId_roleId: { guildId: guild.id, userId, roleId: item.roleId } },
        create: { guildId: guild.id, userId, roleId: item.roleId, expiresAt: until },
        update: { expiresAt: until },
      });
      return `You now have <@&${item.roleId}> until <t:${Math.floor(until.getTime() / 1000)}:f>.`;
    }
    return `You now have <@&${item.roleId}>.`;
  }
  if (item.type === "XP_BOOST") {
    const until = await giveBoost(guild.id, userId, item.boostMult ?? 2, item.boostMinutes ?? 60);
    return `🧪 ${item.boostMult ?? 2}x XP is on until <t:${Math.floor(until.getTime() / 1000)}:t>.`;
  }
  if (item.type === "CRATE") {
    const r = (item.crateRarity ?? "common") as CrateRarity;
    await giveCrates(guild.id, userId, r);
    return `${CRATE_INFO[r].emoji} A ${CRATE_INFO[r].name} Crate is waiting in **/crates**.`;
  }
  if (item.type === "STREAK_FREEZE") {
    await giveFreezes(guild.id, userId, 1);
    return "🛡️ A streak freeze is saved. It's used by itself if you miss a /daily.";
  }
  return "Staff have been told and will sort it out for you.";
}

export async function handleShopComponent(interaction: ButtonInteraction | StringSelectMenuInteraction) {
  const guild = interaction.guild;
  if (!guild) return;
  if (!(await isModuleEnabled(guild.id, "ECONOMY")) || !(await economyPlus(guild.id)).shopEnabled) {
    await interaction.reply({ content: "The shop is closed in this server.", ephemeral: true });
    return;
  }
  const userId = interaction.user.id;
  const cfg = await getConfig(guild.id);

  if (interaction.isStringSelectMenu() && interaction.customId === "eshop:pick") {
    const item = await prisma.shopItem.findFirst({ where: { id: interaction.values[0], guildId: guild.id, enabled: true } });
    if (!item) {
      await interaction.update(await shopView(guild.id, userId, "That item isn't for sale anymore."));
      return;
    }
    const view = await shopView(guild.id, userId, `**Buy ${item.emoji} ${item.name} for ${cfg.currencyIcon} ${item.price.toLocaleString("en-US")}?**`);
    view.components = [
      ...view.components,
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`eshop:buy:${item.id}`).setLabel(`Buy for ${item.price.toLocaleString("en-US")}`).setEmoji("🛒").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("eshop:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
      ) as never,
    ];
    await interaction.update(view);
    return;
  }
  if (interaction.isButton() && interaction.customId === "eshop:cancel") {
    await interaction.update(await shopView(guild.id, userId));
    return;
  }
  if (interaction.isButton() && interaction.customId.startsWith("eshop:buy:")) {
    const item = await prisma.shopItem.findFirst({ where: { id: interaction.customId.slice(10), guildId: guild.id, enabled: true } });
    if (!item) {
      await interaction.update(await shopView(guild.id, userId, "That item isn't for sale anymore."));
      return;
    }
    // Stock first, then coins, each in one statement so two quick clicks can't both win.
    if (item.stock !== null) {
      const got = await prisma.shopItem.updateMany({ where: { id: item.id, stock: { gt: 0 } }, data: { stock: { decrement: 1 } } });
      if (!got.count) {
        await interaction.update(await shopView(guild.id, userId, `⚠️ ${item.name} is sold out.`));
        return;
      }
    }
    const paid = await prisma.economyBalance.updateMany({
      where: { guildId: guild.id, userId, balance: { gte: item.price } },
      data: { balance: { decrement: item.price }, totalSpent: { increment: item.price } },
    });
    if (!paid.count) {
      if (item.stock !== null) await prisma.shopItem.update({ where: { id: item.id }, data: { stock: { increment: 1 } } }).catch(() => null);
      await interaction.update(await shopView(guild.id, userId, `⚠️ You need ${cfg.currencyIcon} ${item.price.toLocaleString("en-US")} for that.`));
      return;
    }
    let result: string;
    try {
      result = await deliver(guild, userId, item);
    } catch {
      // Couldn't hand it over (usually a role above Spartacus's): give the coins back.
      await prisma.economyBalance.update({ where: { guildId_userId: { guildId: guild.id, userId } }, data: { balance: { increment: item.price }, totalSpent: { decrement: item.price } } }).catch(() => null);
      if (item.stock !== null) await prisma.shopItem.update({ where: { id: item.id }, data: { stock: { increment: 1 } } }).catch(() => null);
      await interaction.update(await shopView(guild.id, userId, "⚠️ Spartacus couldn't give you that role, so you weren't charged. Let staff know (its role needs to be above that one)."));
      return;
    }
    await prisma.economyTransaction.create({ data: { guildId: guild.id, userId, amount: -item.price, reason: "shop" } }).catch(() => null);
    await prisma.shopPurchase.create({ data: { guildId: guild.id, userId, itemName: item.name, price: item.price } }).catch(() => null);
    await interaction.update(await shopView(guild.id, userId, `✅ Bought **${item.emoji} ${item.name}**. ${result}`));

    const plus = await economyPlus(guild.id);
    if (plus.shopLogChannelId) {
      const ch = await guild.channels.fetch(plus.shopLogChannelId).catch(() => null);
      if (ch && isSendableChannel(ch)) {
        await ch
          .send({
            content: `🛒 <@${userId}> bought **${item.emoji} ${item.name}** for ${cfg.currencyIcon} ${item.price.toLocaleString("en-US")}.${item.type === "CUSTOM" ? " **Staff: please hand this out.**" : ""}`,
            allowedMentions: { parse: [] },
          })
          .catch(() => null);
      }
    }
  }
}

// The shop panel's buttons. Everything opens just for the person who pressed it.
export async function handleShopPanel(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;
  const which = interaction.customId.split(":")[2];
  if (!(await isModuleEnabled(guild.id, "ECONOMY"))) {
    await interaction.reply({ content: "The economy is turned off in this server.", ephemeral: true });
    return;
  }
  const plus = await economyPlus(guild.id);
  if (which === "shop") {
    if (!plus.shopEnabled) await interaction.reply({ content: "The shop is closed right now.", ephemeral: true });
    else await interaction.reply({ ...(await shopView(guild.id, interaction.user.id)), ephemeral: true });
  } else if (which === "crates") {
    const { cratesReply } = await import("./crates");
    await interaction.reply({ ...(await cratesReply(guild.id, interaction.user.id)), ephemeral: true });
  } else if (which === "daily") {
    const { runDaily } = await import("./dailyRewards");
    const r = await runDaily(interaction.client, guild.id, interaction.user.id, interaction.channelId);
    await interaction.reply({ content: r.content, ephemeral: true });
  } else if (which === "balance") {
    const { balanceEmbed } = await import("./dailyRewards");
    await interaction.reply({ embeds: [await balanceEmbed(guild.id, interaction.user.id)], ephemeral: true });
  }
}
