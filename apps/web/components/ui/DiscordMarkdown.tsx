"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../lib/api";
import { discordMarkdownToHtml, type DiscordNames } from "../../lib/discordMarkdown";

// One fetch of a server's channel and role names, shared by every preview on the page.
const cache = new Map<string, Promise<DiscordNames>>();
function loadNames(guildId: string): Promise<DiscordNames> {
  let p = cache.get(guildId);
  if (!p) {
    p = Promise.all([api.getDiscordChannels(guildId).catch(() => null), api.getDiscordRoles(guildId).catch(() => [])]).then(([ch, roles]) => ({
      roles: Object.fromEntries(roles.map((r) => [r.id, { name: r.name, color: r.color }])),
      channels: Object.fromEntries([
        ...(ch?.textChannels ?? []).map((c) => [c.id, { name: c.name, voice: false }]),
        ...(ch?.voiceChannels ?? []).map((c) => [c.id, { name: c.name, voice: true }]),
      ]),
    }));
    cache.set(guildId, p);
  }
  return p;
}

export function useDiscordNames(guildId?: string): DiscordNames | undefined {
  const params = useParams<{ guildId?: string }>();
  const id = guildId ?? params?.guildId;
  const [names, setNames] = useState<DiscordNames>();
  useEffect(() => {
    if (id) loadNames(id).then(setNames).catch(() => null);
  }, [id]);
  return names;
}

export interface SampleNames {
  users?: Record<string, string>;
  channels?: Record<string, { name: string; voice: boolean }>;
}

function withSamples(names: DiscordNames | undefined, extra?: SampleNames): DiscordNames | undefined {
  if (!extra) return names;
  return {
    roles: names?.roles ?? {},
    channels: { ...(names?.channels ?? {}), ...(extra.channels ?? {}) },
    users: { ...(names?.users ?? {}), ...(extra.users ?? {}) },
  };
}

// Text the way Discord shows it. `inline` is for titles, field names and labels.
export function DiscordMarkdown({
  text,
  inline,
  className,
  guildId,
  as: Tag = inline ? "span" : "div",
  names: extra,
}: {
  text: string | null | undefined;
  inline?: boolean;
  className?: string;
  guildId?: string;
  as?: "div" | "span" | "p";
  // Sample members or channels a preview stands in, by id.
  names?: SampleNames;
}) {
  const loaded = useDiscordNames(guildId);
  const names = withSamples(loaded, extra);
  if (!text) return null;
  return (
    <Tag
      className={[inline ? "" : "whitespace-pre-wrap", "break-words", className ?? ""].join(" ")}
      dangerouslySetInnerHTML={{ __html: discordMarkdownToHtml(text, names, { inline }) }}
    />
  );
}
