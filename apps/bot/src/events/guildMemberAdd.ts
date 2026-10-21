import { Events, GuildMember } from "discord.js";
import { prisma } from "../lib/prisma";
import { isModuleEnabled } from "../lib/moduleGate";
import { buildStickyPayload } from "../lib/stickyRender";
import { resolveSavedEmbed } from "../lib/savedEmbedRender";

export const name = Events.GuildMemberAdd;

// A gateway reconnect/resume around the moment someone joins (or, during a
// deploy, a brief overlap between the outgoing and incoming bot instance)
// can deliver the same join event twice. This makes the welcome send
// idempotent per join — keyed by member+guild+their actual join timestamp,
// so a genuine rejoin later (a new joinedTimestamp) still welcomes them
// again, only a true duplicate delivery of the same join is skipped.
const recentlyWelcomed = new Set<string>();
const DEDUPE_MS = 15_000;

export async function execute(member: GuildMember) {
  const dedupeKey = `${member.guild.id}:${member.id}:${member.joinedTimestamp ?? 0}`;
  if (recentlyWelcomed.has(dedupeKey)) return;
  recentlyWelcomed.add(dedupeKey);
  setTimeout(() => recentlyWelcomed.delete(dedupeKey), DEDUPE_MS);

  const enabled = await isModuleEnabled(member.guild.id, "WELCOME");
  if (!enabled) return;

  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: member.guild.id } });
  if (!config?.channelId) return;

  const channel = await member.guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const tokens = { "{user}": `<@${member.id}>`, "{server}": member.guild.name };
  const text = (config.welcomeText ?? "Welcome to {server}, {user}!")
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
    { thumbnailUrl: member.user.displayAvatarURL(), savedEmbed: saved, guildId: member.guild.id, tokens }
  );

  await channel.send(payload);
}
