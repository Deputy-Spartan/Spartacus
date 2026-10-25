// Pure token-substitution helpers for the LFG feature — kept separate from
// the Discord-specific reply/send logic in modules/community/lfg.ts so the
// template behavior (what {user}/{voice}/{message} expand to) can be
// reasoned about and tested without spinning up an interaction or message.
export interface LfgTokens {
  user: string;
  voice: string;
  voiceName: string;
  members: string;
  roleTag: string;
  message: string;
}

export function substituteLfgTokens(template: string, tokens: LfgTokens): string {
  return template
    .replace(/\{user\}/g, tokens.user)
    .replace(/\{voiceName\}/g, tokens.voiceName)
    .replace(/\{voice\}/g, tokens.voice)
    .replace(/\{members\}/g, tokens.members)
    .replace(/\{roleTag\}/g, tokens.roleTag)
    .replace(/\{message\}/g, tokens.message);
}

export function buildLfgPingLine(cfg: { roleId: string | null; includeSender: boolean }, senderMention: string): string {
  const parts: string[] = [];
  if (cfg.roleId) parts.push(`<@&${cfg.roleId}>`);
  if (cfg.includeSender) parts.push(senderMention);
  return parts.join(" ");
}
