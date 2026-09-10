import cron from "node-cron";
import { Client } from "discord.js";
import { prisma } from "../lib/prisma";
import { isModuleEnabled } from "../lib/moduleGate";
import { isSendableChannel } from "../lib/channels";

interface RankedSuggestion {
  content: string;
  score: number;
  up: number;
  down: number;
}

// Suggestion votes live only as 👍/👎 reactions on the original Discord
// message — there's no vote-count column anywhere in the schema — so this
// has to read them live off each message rather than querying a table.
export function startSuggestionAnalyticsJob(client: Client) {
  cron.schedule("0 14 * * MON", async () => {
    const settings = await prisma.suggestionAnalyticsSettings.findMany({ where: { channelId: { not: null } } });

    for (const s of settings) {
      const enabled = await isModuleEnabled(s.guildId, "SUGGESTION_ANALYTICS");
      if (!enabled) continue;

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const suggestions = await prisma.suggestion.findMany({
        where: { guildId: s.guildId, createdAt: { gte: weekAgo }, messageId: { not: null } },
        take: 100,
      });
      if (suggestions.length === 0) continue;

      const ranked: RankedSuggestion[] = [];
      for (const suggestion of suggestions) {
        const channel = await client.channels.fetch(suggestion.channelId).catch(() => null);
        if (!channel?.isTextBased()) continue;
        const message = await channel.messages.fetch(suggestion.messageId as string).catch(() => null);
        if (!message) continue;

        const up = message.reactions.cache.get("👍")?.count ?? 0;
        const down = message.reactions.cache.get("👎")?.count ?? 0;
        ranked.push({ content: suggestion.content, score: up - down, up, down });
      }
      if (ranked.length === 0) continue;

      ranked.sort((a, b) => b.score - a.score);
      const top = ranked.slice(0, 5);

      const channel = await client.channels.fetch(s.channelId as string).catch(() => null);
      if (!isSendableChannel(channel)) continue;

      const lines = top.map((r, i) => `${i + 1}. ${r.content.slice(0, 80)} — 👍${r.up} 👎${r.down}`).join("\n");
      await channel
        .send({
          embeds: [
            {
              color: 0x4c8dff,
              title: "💡 Top Suggestions This Week",
              description: lines,
              timestamp: new Date().toISOString(),
            },
          ],
        })
        .catch(() => null);
    }
  });
}
