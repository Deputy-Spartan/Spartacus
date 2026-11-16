import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder, type ButtonInteraction } from "discord.js";
import { CHECKLIST_MAX, DEFAULT_CHECKLIST, SG_PREFIX, isValidTimezone, nextSlotStart, platformInfo } from "@spartacus/shared";
import { prisma } from "../../lib/prisma";
import type { CommandModule } from "../types";

// /prestream: a private checklist to run through before going live, plus a
// quick look at what the bot already knows (linked channels, connected
// accounts, the next scheduled stream, how many people get pings). Ticks live
// in the buttons themselves, so nothing is stored.

async function items(guildId: string) {
  const config = await prisma.streamGrowthConfig.findUnique({ where: { guildId } });
  return (config?.checklist?.length ? config.checklist : DEFAULT_CHECKLIST).slice(0, CHECKLIST_MAX);
}

async function statusLines(guildId: string, userId: string) {
  const [subs, accounts, extras, slots, growth] = await Promise.all([
    prisma.streamSubscription.findMany({ where: { guildId, discordUserId: userId } }),
    prisma.streamerAccount.findMany({ where: { guildId, discordUserId: userId } }),
    prisma.streamExtrasConfig.findUnique({ where: { guildId } }),
    prisma.streamSlot.findMany({ where: { guildId } }),
    prisma.streamGrowthConfig.findUnique({ where: { guildId } }),
  ]);
  const lines: string[] = [];
  lines.push(subs.length ? `🔴 Going Live alerts: ${subs.map((s) => `${platformInfo(s.platform).emoji} ${s.channelName}`).join(", ")}` : "⚠️ No channel linked for alerts. Run `/mystream link`.");
  lines.push(accounts.length ? `🔑 Title updates: ${accounts.map((a) => `${platformInfo(a.platform).emoji} ${a.login}`).join(", ")} (use \`/title\`)` : "🔑 No Twitch or Kick connected, so `/title` can't change your title. Connect on the dashboard (Streaming → Stream Growth → Accounts).");
  const tz = extras && isValidTimezone(extras.scheduleTimezone) ? extras.scheduleTimezone : "UTC";
  const mine = slots.filter((s) => s.userId === userId);
  const pool = mine.length ? mine : slots;
  const next = pool.map((s) => ({ s, at: nextSlotStart(tz, s.dayOfWeek, s.startMinutes) })).sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  if (next) lines.push(`📅 Next on the schedule: **${next.s.streamer}** <t:${Math.floor(next.at.getTime() / 1000)}:R>`);
  if (growth?.pingRoleId) lines.push(`🔔 Stream Ping role: <@&${growth.pingRoleId}>`);
  return lines;
}

function view(list: string[], mask: number, status: string[]) {
  const done = list.filter((_, i) => mask & (1 << i)).length;
  const all = done === list.length;
  const embed = new EmbedBuilder()
    .setColor(all ? 0x3ba55d : 0xffd700)
    .setTitle(all ? "✅ All set. Go live!" : `📋 Pre-stream checklist (${done}/${list.length})`)
    .setDescription(list.map((t, i) => `${mask & (1 << i) ? "✅" : "⬜"} ${t}`).join("\n"))
    .addFields({ name: "What the bot sees", value: status.join("\n").slice(0, 1024) || "—" });
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < list.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let j = i; j < Math.min(i + 5, list.length); j++)
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${SG_PREFIX}pre:${mask.toString(36)}:${j}`)
          .setLabel(`${j + 1}. ${list[j]}`.slice(0, 80))
          .setStyle(mask & (1 << j) ? ButtonStyle.Success : ButtonStyle.Secondary),
      );
    rows.push(row);
  }
  return { embeds: [embed], components: rows };
}

const command: CommandModule = {
  moduleKey: "PRE_STREAM",
  data: new SlashCommandBuilder().setName("prestream").setDescription("Your checklist before going live").setDMPermission(false) as SlashCommandBuilder,

  async execute(interaction) {
    if (!interaction.guildId) return;
    const [list, status] = await Promise.all([items(interaction.guildId), statusLines(interaction.guildId, interaction.user.id)]);
    await interaction.reply({ ...view(list, 0, status), ephemeral: true });
  },
};

export async function handlePrestreamButton(interaction: ButtonInteraction) {
  if (!interaction.guildId) return;
  const [, , m, i] = interaction.customId.split(":");
  const mask = parseInt(m, 36) ^ (1 << Number(i));
  const [list, status] = await Promise.all([items(interaction.guildId), statusLines(interaction.guildId, interaction.user.id)]);
  await interaction.update(view(list, mask, status));
}

export default command;
