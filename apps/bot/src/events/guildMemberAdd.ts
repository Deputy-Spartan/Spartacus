import { Events, GuildMember } from "discord.js";
import { prisma } from "../lib/prisma";
import { isModuleEnabled } from "../lib/moduleGate";
import { buildStickyPayload } from "../lib/stickyRender";

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember) {
  const enabled = await isModuleEnabled(member.guild.id, "WELCOME");
  if (!enabled) return;

  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: member.guild.id } });
  if (!config?.channelId) return;

  const channel = await member.guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const text = (config.welcomeText ?? "Welcome to {server}, {user}!")
    .replace("{user}", `<@${member.id}>`)
    .replace("{server}", member.guild.name);

  const payload = buildStickyPayload(
    {
      content: text,
      embedEnabled: config.embedEnabled,
      embedTitle: config.embedTitle,
      embedDescription: text,
      embedColor: config.embedColor,
      buttons: config.buttons,
    },
    { thumbnailUrl: member.user.displayAvatarURL() }
  );

  await channel.send(payload);
}
