import { Events, GuildMember, PartialGuildMember } from "discord.js";
import { prisma } from "../lib/prisma";
import { isModuleEnabled } from "../lib/moduleGate";
import { buildStickyPayload } from "../lib/stickyRender";
import { resolveSavedEmbed } from "../lib/savedEmbedRender";

export const name = Events.GuildMemberRemove;

// Same reasoning as the join side (see guildMemberAdd.ts) — dedupes a
// double-delivered leave event rather than posting the goodbye twice.
const recentlyFarewelled = new Set<string>();
const DEDUPE_MS = 15_000;

export async function execute(member: GuildMember | PartialGuildMember) {
  const dedupeKey = `${member.guild.id}:${member.id}`;
  if (recentlyFarewelled.has(dedupeKey)) return;
  recentlyFarewelled.add(dedupeKey);
  setTimeout(() => recentlyFarewelled.delete(dedupeKey), DEDUPE_MS);

  const enabled = await isModuleEnabled(member.guild.id, "WELCOME");
  if (!enabled) return;

  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: member.guild.id } });
  if (!config?.channelId) return;

  const channel = await member.guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const tokens = { "{user}": member.user.username, "{server}": member.guild.name };
  const text = (config.goodbyeText ?? "{user} has left {server}.")
    .replace("{user}", tokens["{user}"])
    .replace("{server}", tokens["{server}"]);

  const saved = await resolveSavedEmbed(config.savedEmbedId);
  const payload = await buildStickyPayload(
    {
      content: text,
      embedEnabled: config.embedEnabled,
      embedTitle: config.embedTitle,
      embedDescription: text,
      embedColor: config.embedColor,
      buttons: config.buttons,
      embedExtra: config.embedExtra,
    },
    { savedEmbed: saved, guildId: member.guild.id, tokens }
  );

  await channel.send(payload);
}
