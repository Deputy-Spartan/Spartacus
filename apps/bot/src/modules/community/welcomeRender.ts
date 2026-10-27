import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, Guild, GuildMember, PartialGuildMember } from "discord.js";
import { prisma } from "../../lib/prisma";
import { buildStickyPayload } from "../../lib/stickyRender";
import { resolveSavedEmbed } from "../../lib/savedEmbedRender";
import { isSendableChannel } from "../../lib/channels";
import type { WelcomeConfig, WelcomeGreeting } from "@prisma/client";

// Shared by guildMemberAdd.ts (a real join) and sendWelcomeTest below (the
// dashboard's "Send Test" button) so both produce byte-identical output.
export async function buildWelcomePayload(guild: Guild, config: WelcomeConfig, member: GuildMember) {
  const tokens = { "{user}": `<@${member.id}>`, "{server}": guild.name };

  const greetings = await prisma.welcomeGreeting.findMany({ where: { guildId: guild.id, enabled: true } });
  const greeting: WelcomeGreeting | null = greetings.length > 0 ? greetings[Math.floor(Math.random() * greetings.length)] : null;

  const text = (greeting?.text ?? config.welcomeText ?? "Welcome to {server}, {user}!")
    .replace("{user}", tokens["{user}"])
    .replace("{server}", tokens["{server}"]);

  const saved = await resolveSavedEmbed(config.savedEmbedId);
  const payload = await buildStickyPayload(
    {
      content: config.embedEnabled ? "" : text,
      embedEnabled: config.embedEnabled,
      embedTitle: config.embedTitle,
      embedDescription: text,
      embedColor: config.embedColor,
      buttons: config.buttons,
      embedExtra: config.embedExtra,
    },
    { thumbnailUrl: member.user.displayAvatarURL(), savedEmbed: saved, guildId: guild.id, tokens }
  );

  // Discord never delivers a ping notification for a mention that only
  // appears inside an embed, so add the bare mention back to `content` if
  // embed mode left it empty — see guildMemberAdd.ts for the full reasoning.
  if (!payload.content?.includes(tokens["{user}"])) {
    payload.content = [tokens["{user}"], payload.content].filter(Boolean).join(" ");
  }

  if (greeting) {
    const waveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`welcomewave:${greeting.id}:${member.id}`).setLabel(greeting.buttonLabel.slice(0, 80)).setStyle(ButtonStyle.Secondary)
    );
    payload.components = [...(payload.components ?? []), waveRow];
  }

  return payload;
}

// Shared by guildMemberRemove.ts (a real leave) and sendWelcomeTest below.
// `asMention` is only ever true for the test send: a real goodbye uses the
// plain username since a member who already left can't be usefully pinged,
// but the test's "member" is the admin themselves, still in the server, so
// mentioning them (and getting the same real ping Welcome's test gets) is
// what actually proves the message works.
export async function buildGoodbyePayload(guild: Guild, config: WelcomeConfig, member: GuildMember | PartialGuildMember, asMention = false) {
  const tokens = { "{user}": asMention ? `<@${member.id}>` : member.user.username, "{server}": guild.name };
  const text = (config.goodbyeText ?? "{user} has left {server}.").replace("{user}", tokens["{user}"]).replace("{server}", tokens["{server}"]);

  const saved = await resolveSavedEmbed(config.savedEmbedId);
  const payload = await buildStickyPayload(
    {
      content: config.embedEnabled ? "" : text,
      embedEnabled: config.embedEnabled,
      embedTitle: config.embedTitle,
      embedDescription: text,
      embedColor: config.embedColor,
      buttons: config.buttons,
      embedExtra: config.embedExtra,
    },
    { savedEmbed: saved, guildId: guild.id, tokens }
  );

  if (asMention && !payload.content?.includes(tokens["{user}"])) {
    payload.content = [tokens["{user}"], payload.content].filter(Boolean).join(" ");
  }

  return payload;
}

// Dashboard's "Send Test" button — posts the real welcome or goodbye
// message to the configured channel using the clicking admin's own account
// standing in for the member, prefixed so it's clearly a test. Reuses the
// exact same render functions a real join/leave uses, so what's previewed
// is exactly what members will see (pings included).
export async function sendWelcomeTest(client: Client, guildId: string, callerId: string, kind: "welcome" | "goodbye"): Promise<{ ok: boolean; error?: string }> {
  const config = await prisma.welcomeConfig.findUnique({ where: { guildId } });
  if (!config?.channelId) return { ok: false, error: "Set a welcome channel first." };

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { ok: false, error: "Couldn't load this server." };

  const channel = await guild.channels.fetch(config.channelId).catch(() => null);
  if (!isSendableChannel(channel)) return { ok: false, error: "The configured channel isn't postable." };

  const member = await guild.members.fetch(callerId).catch(() => null);
  if (!member) return { ok: false, error: "Couldn't find your membership in this server." };

  const payload = kind === "welcome" ? await buildWelcomePayload(guild, config, member) : await buildGoodbyePayload(guild, config, member, true);
  const prefix = `🧪 **Test ${kind === "welcome" ? "welcome" : "goodbye"} message** — only you triggered this, no one actually joined/left.`;
  await channel.send({ ...payload, content: [prefix, payload.content].filter(Boolean).join("\n") });

  return { ok: true };
}
