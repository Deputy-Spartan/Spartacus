import { ChatInputCommandInteraction, EmbedBuilder, Message, ColorResolvable } from "discord.js";
import type { LfgCommand } from "@spartacus/db";
import { prisma } from "../../lib/prisma";
import { isSendableChannel } from "../../lib/channels";
import { applyEmbedExtra } from "../../lib/embedExtra";
import { substituteLfgTokens, buildLfgPingLine } from "../../lib/lfg";

// Regular (non-interaction) messages can't be truly ephemeral — this is the
// standard workaround: reply normally, then delete it a few seconds later,
// so it still reads as "only meant for you" without leaving clutter behind.
const AUTO_DELETE_MS = 9000;
async function replyAndAutoDelete(message: Message, content: string) {
  if (!isSendableChannel(message.channel)) return;
  const sent = await message.reply({ content }).catch(() => null);
  if (sent) setTimeout(() => sent.delete().catch(() => null), AUTO_DELETE_MS);
}

function buildAnnouncement(cfg: LfgCommand, senderMention: string, voiceLabel: string, note: string) {
  const ping = buildLfgPingLine(cfg, senderMention);
  const tokens = { user: senderMention, voice: voiceLabel, message: note || "—" };

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
  const voiceChannelId = member?.voice.channelId;
  if (!voiceChannelId) {
    await interaction.reply({ content: cfg.errorMessage, ephemeral: true });
    return;
  }

  const note = interaction.options.getString("message") ?? "";
  const payload = buildAnnouncement(cfg, `${interaction.user}`, `<#${voiceChannelId}>`, note);
  await interaction.reply(payload);
}

// ---- Prefix path (!trigger [note...]) ----
export async function handleLfgMessage(message: Message, cfg: LfgCommand, note: string) {
  if (message.channelId !== cfg.channelId) {
    await replyAndAutoDelete(message, cfg.wrongChannelMessage.replace("{channel}", `<#${cfg.channelId}>`));
    return;
  }

  const voiceChannelId = message.member?.voice.channelId;
  if (!voiceChannelId) {
    await replyAndAutoDelete(message, cfg.errorMessage);
    return;
  }

  if (!isSendableChannel(message.channel)) return;
  const payload = buildAnnouncement(cfg, `${message.author}`, `<#${voiceChannelId}>`, note);
  await message.channel.send(payload);
}

export async function findLfgCommandByTrigger(guildId: string, trigger: string): Promise<LfgCommand | null> {
  return prisma.lfgCommand.findUnique({ where: { guildId_trigger: { guildId, trigger } } });
}
