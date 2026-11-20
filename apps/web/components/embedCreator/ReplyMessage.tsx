"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ModuleMessage, designFrom } from "./ModuleMessage";
import { api } from "../../lib/api";

// Short replies and DMs (Verify and Rules button replies, Reports,
// Applications and Support DMs). Each one picks:
//   💬 Plain text  – the text box it always had
//   🎨 Build here  – its own embed, made in the full editor
//   🗂️ Use a saved embed – any embed from the library
// It's the same ModuleMessage every module uses, with a Plain text choice added.

export type ReplyModule = "verification" | "rules" | "reports" | "support" | "application";

export interface ReplyEmbeds {
  guildId: string;
  module: ReplyModule;
  typeId?: string;
  map: Record<string, string> | null;
  set: (key: string, id: string | null) => void;
}

// Loads a module's reply embeds once per page.
export function useReplyEmbeds(guildId: string, module: ReplyModule, typeId?: string): ReplyEmbeds {
  const [map, setMap] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    setMap(null);
    if (module === "application" && !typeId) return setMap({});
    let live = true;
    api
      .getReplyEmbeds(guildId, module, typeId)
      .then((m) => live && setMap(m))
      .catch(() => live && setMap({}));
    return () => {
      live = false;
    };
  }, [guildId, module, typeId]);

  const set = useCallback(
    (key: string, id: string | null) => {
      setMap((m) => {
        const next = { ...(m ?? {}) };
        if (id) next[key] = id;
        else delete next[key];
        return next;
      });
      api.setReplyEmbed(guildId, module, key, id, typeId).then(setMap).catch(() => null);
    },
    [guildId, module, typeId]
  );
  return { guildId, module, typeId, map, set };
}

// For pages whose cards don't pass things down: wrap the page once, and every
// ReplyMessage inside uses it.
const Ctx = createContext<ReplyEmbeds | null>(null);
export function ReplyEmbedsProvider({ guildId, module, typeId, children }: { guildId: string; module: ReplyModule; typeId?: string; children: React.ReactNode }) {
  return <Ctx.Provider value={useReplyEmbeds(guildId, module, typeId)}>{children}</Ctx.Provider>;
}

export function ReplyMessage(props: {
  replies?: ReplyEmbeds;
  replyKey: string;
  title: string;
  description?: string;
  // What the reply says now, and what it says when left empty.
  text: string | null | undefined;
  fallback: string;
  color?: string;
  tokens?: Array<{ token: string; description: string }>;
  tokenValues?: Record<string, string>;
  // The plain text box.
  children: React.ReactNode;
}) {
  const { replyKey, title, description, text, fallback, color, tokens, tokenValues, children } = props;
  const fromPage = useContext(Ctx);
  const replies = props.replies ?? fromPage;
  if (!replies) return <>{children}</>;

  // An application type that isn't saved yet has nowhere to keep an embed.
  if (replies.module === "application" && !replies.typeId) {
    return (
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">{title}</p>
        {children}
        <p className="text-xs text-slate-600 mt-1">Save this application type first to make this message an embed.</p>
      </div>
    );
  }
  if (!replies.map) return <p className="text-xs text-slate-500">Loading…</p>;

  const owner = `reply:${replies.module}:${replies.typeId ? `${replies.typeId}:` : ""}${replyKey}`;
  return (
    <div className="rounded-lg border border-white/5 bg-base-950/30 p-3">
      <ModuleMessage
        compact
        guildId={replies.guildId}
        title={title}
        description={description}
        ownerKey={owner}
        savedEmbedId={replies.map[replyKey] ?? null}
        onSavedEmbedChange={(id) => replies.set(replyKey, id)}
        seed={() => designFrom({ description: text?.trim() ? text : fallback, color: color ?? "#7B99BC" })}
        tokens={tokens}
        tokenValues={tokenValues}
        plain={children}
      />
    </div>
  );
}
