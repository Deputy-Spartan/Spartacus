import type { BaseMessageOptions } from "discord.js";
import { resolveSavedEmbed, buildSavedEmbedPayload } from "./savedEmbedRender";

// Short replies and DMs (Verify and Rules button replies, Reports, Applications
// and Support DMs) can each be a plain text or an embed made in the dashboard.
// A module keeps a `replyEmbeds` map of reply name → saved embed id; a reply
// with no embed (or one that was deleted) sends its plain text, as before.

export function replyEmbedId(map: unknown, key: string): string | null {
  if (!map || typeof map !== "object") return null;
  const id = (map as Record<string, unknown>)[key];
  return typeof id === "string" && id ? id : null;
}

// `tokens` are the reply's placeholders, e.g. { server: "My Server" }.
export async function replyBody(guildId: string, map: unknown, key: string, text: string, tokens: Record<string, string> = {}): Promise<BaseMessageOptions> {
  const id = replyEmbedId(map, key);
  const design = id ? await resolveSavedEmbed(id).catch(() => null) : null;
  if (design) {
    const braced = Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k.startsWith("{") ? k : `{${k}}`, v]));
    const built = await buildSavedEmbedPayload(guildId, design, braced).catch(() => null);
    if (built && (built.content || built.embeds?.length)) return { content: built.content || "", embeds: built.embeds ?? [], components: built.components ?? [] };
  }
  return { content: text, embeds: [] };
}
