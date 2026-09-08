import { ChannelType, Client, EmbedBuilder, Events, Message } from "discord.js";
import { prisma } from "../../lib/prisma";
import { isModuleEnabled } from "../../lib/moduleGate";
import { isSendableChannel } from "../../lib/channels";

export const name = Events.MessageCreate;

// DMs to the bot open (or continue) a modmail thread. The staff-side
// channel lives under the category stored in the MODMAIL module's config
// JSON — reusing the same config-on-toggle pattern as Moderation/Automod
// rather than a dedicated settings table.
export async function execute(message: Message) {
  if (message.author.bot || message.guild) return; // only DMs

  for (const guild of message.client.guilds.cache.values()) {
    const isMember = await guild.members.fetch(message.author.id).catch(() => null);
    if (!isMember) continue;

    const enabled = await isModuleEnabled(guild.id, "MODMAIL");
    if (!enabled) continue;

    const toggle = await prisma.moduleToggle.findUnique({ where: { guildId_key: { guildId: guild.id, key: "MODMAIL" } } });
    const categoryId = (toggle?.config as { categoryId?: string } | null)?.categoryId;
    if (!categoryId) continue;

    let thread = await prisma.modmailThread.findFirst({ where: { guildId: guild.id, userId: message.author.id, open: true } });

    if (!thread) {
      const channel = await guild.channels.create({
        name: `modmail-${message.author.username}`.toLowerCase().slice(0, 90),
        type: ChannelType.GuildText,
        parent: categoryId,
      });
      thread = await prisma.modmailThread.create({
        data: { guildId: guild.id, userId: message.author.id, channelId: channel.id },
      });
      await channel.send(`📬 New modmail thread from **${message.author.tag}** (${message.author.id}).`);
    }

    const channel = await guild.channels.fetch(thread.channelId).catch(() => null);
    if (isSendableChannel(channel)) {
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00e5ff)
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setDescription(message.content || "*(no text content)*"),
        ],
      });
    }

    await message.react("📨").catch(() => null);
    return; // only open a thread in the first matching guild
  }
}

// Staff reply: !reply in the modmail thread channel forwards to the user's DM.
export async function handleStaffReply(message: Message) {
  if (!message.guildId || message.author.bot) return;
  if (!message.content.startsWith("!reply ")) return;

  const thread = await prisma.modmailThread.findFirst({ where: { channelId: message.channelId, open: true } });
  if (!thread) return;

  const user = await message.client.users.fetch(thread.userId).catch(() => null);
  const reply = message.content.slice("!reply ".length);
  await user
    ?.send(`**Staff reply:** ${reply}`)
    .then(() => message.react("✅"))
    .catch(() => message.react("❌"));
}
