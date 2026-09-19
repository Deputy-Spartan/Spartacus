"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type DiscordEmojiOption, type DiscordRoleOption } from "../../lib/api";
import { MarkdownToolbar } from "./MarkdownToolbar";

// The textarea shows friendly ":champ:" and "@Champ" while the stored value
// keeps Discord's real "<:champ:123>" / "<@&456>" codes, converting both ways
// as you type so nobody has to read or edit an ID.
export function useMentionAliases(guildId: string) {
  const [emojis, setEmojis] = useState<DiscordEmojiOption[]>([]);
  const [roles, setRoles] = useState<DiscordRoleOption[]>([]);

  useEffect(() => {
    api.getDiscordEmojis(guildId).then(setEmojis).catch(() => null);
    api.getDiscordRoles(guildId).then(setRoles).catch(() => null);
  }, [guildId]);

  const toDisplay = useCallback(
    (s: string) =>
      s
        .replace(/<a?:(\w+):(\d+)>/g, (m, name, id) => (emojis.some((e) => e.id === id) ? `:${name}:` : m))
        .replace(/<@&(\d+)>/g, (m, id) => {
          const r = roles.find((x) => x.id === id);
          return r ? `@${r.name}` : m;
        }),
    [emojis, roles]
  );

  const fromDisplay = useCallback(
    (s: string) => {
      let out = s.replace(/(?<![<\w]):(\w+):/g, (m, name) => emojis.find((e) => e.name.toLowerCase() === String(name).toLowerCase())?.token ?? m);
      // longest names first so "@Gold Plus" is not swallowed by "@Gold"
      for (const r of [...roles].sort((a, b) => b.name.length - a.name.length)) out = out.split(`@${r.name}`).join(`<@&${r.id}>`);
      return out;
    },
    [emojis, roles]
  );

  return { toDisplay, fromDisplay };
}

interface MentionTextareaProps {
  guildId: string;
  value: string;
  onChange: (raw: string) => void;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}

export function MentionTextarea({ guildId, value, onChange, maxLength, placeholder, className }: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { toDisplay, fromDisplay } = useMentionAliases(guildId);

  return (
    <>
      <MarkdownToolbar guildId={guildId} textareaRef={ref} value={toDisplay(value)} onChange={(d) => onChange(fromDisplay(d))} aliased />
      <textarea
        ref={ref}
        className={className}
        value={toDisplay(value)}
        maxLength={maxLength}
        onChange={(e) => onChange(fromDisplay(e.target.value))}
        placeholder={placeholder}
      />
    </>
  );
}
