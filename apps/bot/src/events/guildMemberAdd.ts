import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, Events, GuildMember } from "discord.js";
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

  // A pool of alternate greetings (with their own wave button) takes over
  // from the single welcomeText the moment at least one is enabled —
  // picked at random per join. Empty pool keeps today's behavior exactly.
  const greetings = await prisma.welcomeGreeting.findMany({ where: { guildId: member.guild.id, enabled: true } });
  const greeting = greetings.length > 0 ? greetings[Math.floor(Math.random() * greetings.length)] : null;

  const text = (greeting?.text ?? config.welcomeText ?? "Welcome to {server}, {user}!")
    .replace("{user}", tokens["{user}"])
    .replace("{server}", tokens["{server}"]);

  const saved = await resolveSavedEmbed(config.savedEmbedId);
  const payload = await buildStickyPayload(
    {
      // Embed mode carries the full text in the embed body below — content
      // starts empty so it isn't shown a second time as a plain line above
      // it. Plain mode has no embed, so content is the only copy.
      content: config.embedEnabled ? "" : text,
      embedEnabled: config.embedEnabled,
      embedTitle: config.embedTitle,
      embedDescription: text,
      embedColor: config.embedColor,
      buttons: config.buttons,
      embedExtra: config.embedExtra,
    },
    { thumbnailUrl: member.user.displayAvatarURL(), savedEmbed: saved, guildId: member.guild.id, tokens }
  );

  // Discord never delivers a ping notification for a mention that only
  // appears inside an embed — embed titles/descriptions/fields render
  // mentions as inert text, visually and for notifications alike. Only a
  // mention in the plain message `content` actually pings. Embed mode (or
  // a saved embed) leaves `content` empty, so this adds back just the bare
  // mention — not the whole message a second time — so the new member
  // still gets notified either way.
  if (!payload.content?.includes(tokens["{user}"])) {
    payload.content = [tokens["{user}"], payload.content].filter(Boolean).join(" ");
  }

  if (greeting) {
    const waveRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`welcomewave:${greeting.id}:${member.id}`)
        .setLabel(greeting.buttonLabel.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
    );
    payload.components = [...(payload.components ?? []), waveRow];
  }

  await channel.send(payload);
}

// A member clicks a greeting's wave button to publicly welcome whoever just
// joined — purely social, doesn't touch roles or settings, so any member
// can use it (not just staff). Ephemeral reply only to avoid flooding the
// welcome channel with one message per wave.
export async function handleWave(interaction: ButtonInteraction, targetUserId: string) {
  if (interaction.user.id === targetUserId) {
    await interaction.reply({ content: "You can't wave at yourself! 😄", ephemeral: true });
    return;
  }
  await interaction.reply({ content: `👋 You waved to welcome <@${targetUserId}>!`, ephemeral: true });
}
