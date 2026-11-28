import Anthropic from "@anthropic-ai/sdk";

// The default model: Claude Haiku 5.5, fast and low-cost. AI Moderation always
// uses it, and AI Chat uses it when a server picks "Fast & cheap".
const DEFAULT_MODEL = "claude-haiku-5-5";

export type AiTurn = Anthropic.Beta.BetaMessageParam;

// Why a call didn't produce text, so callers can say something useful
// instead of always blaming a missing key.
export type AiFailure = "no_key" | "bad_key" | "no_credit" | "busy" | "refused" | "error";
export type AiResult = { ok: true; text: string; sources: Array<{ url: string; title: string }> } | { ok: false; reason: AiFailure };

export interface AiOptions {
  model?: string; // a Claude model id; defaults to Claude Haiku 5.5
  maxSearches?: number; // > 0 lets it search the web up to this many times
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

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

// The web search tool. Claude Sonnet 5.5 gets the newer version (it filters
// results before reading them); Claude Haiku 5.5 takes the basic one.
function searchTool(model: string, maxUses: number): Anthropic.Beta.BetaToolUnion {
  return model === "claude-sonnet-5-5"
    ? { type: "web_search_20260209", name: "web_search", max_uses: maxUses }
    : { type: "web_search_20250305", name: "web_search", max_uses: maxUses };
}

export async function askClaudeTurns(system: string, messages: AiTurn[], opts: AiOptions = {}): Promise<AiResult> {
  const c = getClient();
  if (!c) {
    console.error("[ai] ANTHROPIC_API_KEY is not set — AI Chat/Moderation are on but can't run.");
    return { ok: false, reason: "no_key" };
  }
  const model = opts.model ?? DEFAULT_MODEL;
  const searching = (opts.maxSearches ?? 0) > 0;
  try {
    // A turn with web searches can pause partway; sending what came back so
    // far lets the server carry on from there. A few rounds at most.
    const blocks: Anthropic.Beta.BetaContentBlock[] = [];
    let res: Anthropic.Beta.BetaMessage | null = null;
    for (let round = 0; round < 4; round++) {
      const turn: AiTurn[] = blocks.length ? [...messages, { role: "assistant", content: blocks as Anthropic.Beta.BetaContentBlockParam[] }] : messages;
      res = await c.beta.messages.create(
        {
          model,
          max_tokens: opts.maxTokens ?? 1024,
          system,
          messages: turn,
          output_config: { effort: opts.effort ?? "low" },
          ...(searching ? { tools: [searchTool(model, opts.maxSearches!)] } : {}),
          // Claude Sonnet 5.5: if it declines, a fallback model answers instead.
          ...(model === "claude-sonnet-5-5" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { timeout: searching ? 90_000 : 30_000 }
      );
      blocks.push(...res.content);
      if (res.stop_reason !== "pause_turn") break;
    }
    if (!res || res.stop_reason === "refusal") return { ok: false, reason: "refused" };

    // Read the answer by block type: thinking and search blocks come back too.
    const texts = blocks.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text");
    const text = texts.map((b) => b.text).join("").trim();
    // The pages it quoted from, in order, without repeats.
    const sources: Array<{ url: string; title: string }> = [];
    for (const t of texts) {
      for (const cit of t.citations ?? []) {
        if (cit.type === "web_search_result_location" && !sources.some((s) => s.url === cit.url)) sources.push({ url: cit.url, title: cit.title ?? cit.url });
      }
    }
    return text ? { ok: true, text, sources } : { ok: false, reason: "error" };
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
  const r = await askClaudeTurns(system, [{ role: "user", content: userMessage }], { maxTokens });
  return r.ok ? r.text : null;
}
