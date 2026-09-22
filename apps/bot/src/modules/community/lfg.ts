import { ChatInputCommandInteraction, EmbedBuilder, Message, ColorResolvable } from "discord.js";
import type { LfgCommand } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { applyEmbedExtra } from "../../lib/embedExtra";
import { substituteLfgTokens, buildLfgPingLine } from "../../lib/lfg";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "../../lib/savedEmbedRender";

// Regular (non-interaction) messages can't be truly ephemeral — this is the
// standard workaround: reply normally, then delete it a few seconds later,
// so it still reads as "only meant for you" without leaving clutter behind.
const AUTO_DELETE_MS = 9000;
async function replyAndAutoDelete(message: Message, content: string) {
  if (!isSendableChannel(message.channel)) return;
  const sent = await message.reply({ content }).catch(() => null);
  if (sent) setTimeout(() => sent.delete().catch(() => null), AUTO_DELETE_MS);
}

// A temp voice channel is usually gone within minutes of the announcement —
// once deleted, a plain <#id> mention permanently reads "#unknown" to anyone
// who opens the message later. Naming it in the text itself survives that;
// the mention stays too, so it is still clickable while the channel is live.
function voiceLabel(channel: { id: string; name: string }): string {
  return `**${channel.name}** (<#${channel.id}>)`;
}

async function buildAnnouncement(cfg: LfgCommand, senderMention: string, voiceText: string, note: string) {
  const ping = buildLfgPingLine(cfg, senderMention);
  const tokens = { user: senderMention, voice: voiceText, message: note || "—" };

  if (cfg.savedEmbedId) {
    const saved = await resolveSavedEmbed(cfg.savedEmbedId);
    if (saved) {
      const payload = await buildSavedEmbedPayload(cfg.guildId, saved);
      return { content: [ping, payload.content].filter(Boolean).join(" "), embeds: payload.embeds };
    }
  }

  if (cfg.mode === "embed") {
    const embed = new EmbedBuilder().setColor((cfg.embedColor as ColorResolvable) || "#7B99BC");
    if (cfg.embedTitle) embed.setTitle(substituteLfgTokens(cfg.embedTitle, tokens).slice(0, 256));
    if (cfg.embedDescription) embed.setDescription(substituteLfgTokens(cfg.embedDescription, tokens).slice(0, 4096));
    applyEmbedExtra(embed, cfg.embedExtra);
    return { content: ping || undefined, embeds: [embed] };
  }

  const text = substituteLfgTokens(cfg.message || "{user} is looking for a group in {voice}! {message}", tokens);
  return { content: [ping, text].filter(Boolean).join(" ") };
}

// ---- Slash command path (/​trigger) ----
export async function handleLfgInteraction(interaction: ChatInputCommandInteraction, cfg: LfgCommand) {
  if (!cfg.enabled) {
    await interaction.reply({ content: "⚠️ This command is currently disabled for this server.", ephemeral: true });
    return;
  }
  if (interaction.channelId !== cfg.channelId) {
    await interaction.reply({
      content: cfg.wrongChannelMessage.replace("{channel}", `<#${cfg.channelId}>`),
      ephemeral: true,
    });
    return;
  }

  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  const voiceChannel = member?.voice.channel;
  if (!voiceChannel) {
    await interaction.reply({ content: cfg.errorMessage, ephemeral: true });
    return;
  }

  const note = interaction.options.getString("message") ?? "";
  const payload = await buildAnnouncement(cfg, `${interaction.user}`, voiceLabel(voiceChannel), note);
  await interaction.reply(payload);
}

// ---- Prefix path (!trigger [note...]) ----
export async function handleLfgMessage(message: Message, cfg: LfgCommand, note: string) {
  if (message.channelId !== cfg.channelId) {
    await replyAndAutoDelete(message, cfg.wrongChannelMessage.replace("{channel}", `<#${cfg.channelId}>`));
    return;
  }

  const voiceChannel = message.member?.voice.channel;
  if (!voiceChannel) {
    await replyAndAutoDelete(message, cfg.errorMessage);
    return;
  }

  if (!isSendableChannel(message.channel)) return;
  const payload = await buildAnnouncement(cfg, `${message.author}`, voiceLabel(voiceChannel), note);
  await message.channel.send(payload);
}

export async function findLfgCommandByTrigger(guildId: string, trigger: string): Promise<LfgCommand | null> {
  return prisma.lfgCommand.findUnique({ where: { guildId_trigger: { guildId, trigger } } });
}
