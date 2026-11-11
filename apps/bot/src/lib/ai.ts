import Anthropic from "@anthropic-ai/sdk";

// Claude Haiku 5.5: the fast, low-cost model, fine for chat replies and for
// classifying messages. It thinks before answering by default; effort "low"
// keeps that short (and skips it on easy messages), and max_tokens leaves
// room for the thinking plus the answer so a reply is never cut off empty.
const MODEL = "claude-haiku-5-5";

export type AiTurn = Anthropic.MessageParam;

// Why a call didn't produce text, so callers can say something useful
// instead of always blaming a missing key.
export type AiFailure = "no_key" | "bad_key" | "no_credit" | "busy" | "refused" | "error";
export type AiResult = { ok: true; text: string } | { ok: false; reason: AiFailure };

let client: Anthropic | null = null;
let clientKey = "";
function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 30_000 });
    clientKey = key;
  }
  return client;
}

export async function askClaudeTurns(system: string, messages: AiTurn[], maxTokens = 1024): Promise<AiResult> {
  const c = getClient();
  if (!c) {
    console.error("[ai] ANTHROPIC_API_KEY is not set — AI Chat/Moderation are on but can't run.");
    return { ok: false, reason: "no_key" };
  }
  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
      output_config: { effort: "low" },
    });
    if (res.stop_reason === "refusal") return { ok: false, reason: "refused" };
    // Read the answer by block type: the response can start with a thinking block.
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text ? { ok: true, text } : { ok: false, reason: "error" };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("[ai] Anthropic rejected the API key — check ANTHROPIC_API_KEY in Render.");
      return { ok: false, reason: "bad_key" };
    }
    if (err instanceof Anthropic.BadRequestError && /credit|billing|balance/i.test(err.message)) {
      console.error("[ai] The Anthropic account is out of credit:", err.message);
      return { ok: false, reason: "no_credit" };
    }
    if (err instanceof Anthropic.RateLimitError || (err instanceof Anthropic.APIError && (err.status === 529 || (err.status ?? 0) >= 500))) {
      return { ok: false, reason: "busy" };
    }
    console.error("[ai] Anthropic request failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "error" };
  }
}

// One question, one answer (used by AI Moderation). Null when it couldn't answer.
export async function askClaude(system: string, userMessage: string, maxTokens = 1024): Promise<string | null> {
  const r = await askClaudeTurns(system, [{ role: "user", content: userMessage }], maxTokens);
  return r.ok ? r.text : null;
}
