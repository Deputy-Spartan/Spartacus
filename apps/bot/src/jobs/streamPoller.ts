import cron from "node-cron";
import fetch from "node-fetch";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { isSendableChannel } from "../lib/channels";

let twitchAppToken: { token: string; expiresAt: number } | null = null;

async function getTwitchAppToken(): Promise<string> {
  if (twitchAppToken && twitchAppToken.expiresAt > Date.now()) return twitchAppToken.token;

  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID as string,
      client_secret: process.env.TWITCH_CLIENT_SECRET as string,
      grant_type: "client_credentials",
    }),
  });
  const json = (await res.json()) as { access_token: string; expires_in: number };
  twitchAppToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 - 60_000 };
  return twitchAppToken.token;
}

async function checkTwitchLive(channelNames: string[]): Promise<Set<string>> {
  if (channelNames.length === 0) return new Set();

  const token = await getTwitchAppToken();
  const params = channelNames.map((name) => `user_login=${encodeURIComponent(name)}`).join("&");

  const res = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
    headers: {
      "Client-Id": process.env.TWITCH_CLIENT_ID as string,
      Authorization: `Bearer ${token}`,
    },
  });
  const json = (await res.json()) as { data: Array<{ user_login: string }> };
  return new Set(json.data.map((s) => s.user_login.toLowerCase()));
}

// Every 3 minutes, one batched Twitch API call covers every subscribed
// channel across every guild rather than one timer/request per guild.
export function startStreamPollerJob(client: Client) {
  cron.schedule("*/3 * * * *", async () => {
    const subs = await prisma.streamSubscription.findMany({ where: { platform: "twitch" }, take: 100 });
    if (subs.length === 0) return;

    const uniqueChannels = [...new Set(subs.map((s) => s.channelName.toLowerCase()))];
    const liveNow = await checkTwitchLive(uniqueChannels).catch(() => new Set<string>());

    for (const sub of subs) {
      const isLive = liveNow.has(sub.channelName.toLowerCase());

      if (isLive && !sub.isLive) {
        const channel = await client.channels.fetch(sub.announceChannelId).catch(() => null);
        if (isSendableChannel(channel)) {
          await channel
            .send(`🔴 **${sub.channelName}** just went live on Twitch! https://twitch.tv/${sub.channelName}`)
            .catch(() => null);
        }
      }

      if (isLive !== sub.isLive) {
        await prisma.streamSubscription.update({
          where: { id: sub.id },
          data: { isLive, lastNotifiedAt: isLive ? new Date() : sub.lastNotifiedAt },
        });
      }
    }
  });
}
