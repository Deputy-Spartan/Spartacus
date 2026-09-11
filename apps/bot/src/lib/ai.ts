import fetch from "node-fetch";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001"; // cheapest current model — fine for chat replies and moderation classification

// Both AI_CHAT and AI_MODERATION are opt-in module toggles, but they also
// require an API key the free-hosting setup doesn't come with — this
// fails soft (returns null, caller no-ops) rather than crashing the bot
// or spamming errors for servers that never turned the feature on wrong.
export async function askClaude(system: string, userMessage: string, maxTokens = 300): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[ai] ANTHROPIC_API_KEY is not set — AI Chat/Moderation features are enabled but can't run.");
    return null;
  }

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  }).catch(() => null);

  if (!res) {
    console.error("[ai] Request to Anthropic failed (network error) — AI Chat/Moderation reply will be skipped.");
    return null;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[ai] Anthropic API returned ${res.status} ${res.statusText} — check ANTHROPIC_API_KEY is valid. Body: ${body.slice(0, 500)}`);
    return null;
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return data.content?.find((c) => c.type === "text")?.text ?? null;
}
