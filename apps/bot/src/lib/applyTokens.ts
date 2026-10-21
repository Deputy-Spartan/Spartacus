// Shared {token} substitution — split/join rather than a regex so callers
// never have to worry about {user}/{server}/etc. containing regex special
// characters, and so every occurrence is replaced, not just the first.
export function applyTokens(text: string, tokens: Record<string, string>): string {
  let out = text;
  for (const [key, value] of Object.entries(tokens)) out = out.split(key).join(value);
  return out;
}
