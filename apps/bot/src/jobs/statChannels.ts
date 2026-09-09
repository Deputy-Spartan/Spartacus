import cron from "node-cron";
import { Client, ChannelType } from "discord.js";
import { prisma } from "../lib/prisma";
import { isModuleEnabled } from "../lib/moduleGate";

// Discord rate-limits channel renames to ~2 per 10 minutes per channel, so
// this only ticks every 10 minutes — a live-updating counter isn't
// possible on Discord's own platform limits, this is as fast as it gets.
export function startStatChannelsJob(client: Client) {
  cron.schedule("*/10 * * * *", async () => {
    const statChannels = await prisma.statChannel.findMany({ take: 200 });

    for (const sc of statChannels) {
      const enabled = await isModuleEnabled(sc.guildId, "STAT_CHANNELS");
      if (!enabled) continue;

      const guild = await client.guilds.fetch(sc.guildId).catch(() => null);
      if (!guild) continue;

      const channel = await guild.channels.fetch(sc.channelId).catch(() => null);
      if (!channel) continue;

      let count = 0;
      if (sc.statType === "MEMBER_COUNT") count = guild.memberCount;
      else if (sc.statType === "BOOST_COUNT") count = guild.premiumSubscriptionCount ?? 0;
      else if (sc.statType === "CHANNEL_COUNT") count = guild.channels.cache.filter((c) => c.type !== ChannelType.GuildCategory).size;

      const label = { MEMBER_COUNT: "Members", BOOST_COUNT: "Boosts", CHANNEL_COUNT: "Channels" }[sc.statType] ?? "Stat";
      const name = sc.format.replace("{stat}", label).replace("{count}", String(count));

      if (channel.name !== name) {
        await channel.setName(name).catch(() => null);
      }
    }
  });
}
