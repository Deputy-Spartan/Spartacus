"use client";

import { useBotAvatar } from "../../lib/useBotAvatar";
import type { EmbedCreatorState } from "../../lib/api";

function esc(s: string | undefined): string {
  return s || "";
}

// Minimal markdown-to-HTML for the preview only — the actual send always
// ships raw markdown text to Discord, which renders it for real. This just
// approximates bold/italic/underline/strike/code/spoiler so the preview
// looks close to what members will actually see.
function mdToHtml(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|\|(.+?)\|\|/g, '<span style="background:#202225;color:#202225;border-radius:3px;">$1</span>')
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>")
    .replace(/`(.+?)`/g, '<code style="background:#1e1f22;padding:1px 4px;border-radius:4px;">$1</code>');
}

const BUTTON_COLORS: Record<string, string> = { primary: "#5865f2", secondary: "#4e5058", success: "#248046", danger: "#da373c" };
const SELECT_LABELS: Record<string, string> = { string: "Select Menu", user: "User Select", role: "Role Select", user_role: "User & Role Select", channel: "Channel Select" };

function nowStr(): string {
  return "Today at " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function EmbedCreatorPreview({ state }: { state: EmbedCreatorState }) {
  const botAvatar = useBotAvatar();
  const usesWebhookProfile = state.deliveryMode === "webhook" && (state.profileName || state.profileAvatar);
  const displayName = usesWebhookProfile && state.profileName ? state.profileName : "Spartacus";
  const avatarUrl = usesWebhookProfile && state.profileAvatar ? state.profileAvatar : botAvatar;

  const hasAnything = state.content.trim() || state.embeds.some(hasEmbedContent) || state.components.some((r) => r.type);
  if (!hasAnything) {
    return <p className="text-xs text-slate-600 text-center py-8">Nothing to preview yet — start typing.</p>;
  }

  return (
    <div className="rounded-lg bg-[#313338] p-4 font-sans">
      <div className="flex gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-full bg-neon-gradient flex items-center justify-center text-sm font-bold text-base-950">S</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[#f2f3f5] font-medium text-sm">{displayName}</span>
            <span className="bg-[#5865f2] text-white text-[10px] px-1 rounded">{state.deliveryMode === "webhook" ? "WEBHOOK" : "APP"}</span>
            <span className="text-[#949ba4] text-xs">{nowStr()}</span>
          </div>

          {state.content && (
            <p className="text-[#dbdee1] text-sm mt-1 whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: mdToHtml(state.content) }} />
          )}

          {state.embeds.filter(hasEmbedContent).map((em) => (
            <div key={em.id} className="flex mt-2 max-w-full">
              <div className="w-1 rounded-l" style={{ background: em.color || "#7B99BC" }} />
              <div className="bg-[#2b2d31] rounded-r p-3 min-w-0 flex-1">
                {em.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={em.thumbnailUrl} alt="" className="float-right h-16 w-16 rounded object-cover ml-3 mb-1" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                )}
                {em.authorName && (
                  <div className="flex items-center gap-1.5 mb-1">
                    {em.authorIconUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={em.authorIconUrl} alt="" className="h-4 w-4 rounded-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                    )}
                    <span className="text-[#f2f3f5] text-xs font-semibold">{em.authorName}</span>
                  </div>
                )}
                {em.title && <p className="text-[#f2f3f5] font-semibold text-sm mb-1" dangerouslySetInnerHTML={{ __html: mdToHtml(em.title) }} />}
                {em.description && <p className="text-[#dbdee1] text-sm whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: mdToHtml(em.description) }} />}
                {em.fields.filter((f) => f.name || f.value).length > 0 && (
                  <div className={`grid gap-2 mt-2 ${em.fields.some((f) => f.inline) ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1"}`}>
                    {em.fields
                      .filter((f) => f.name || f.value)
                      .map((f, i) => (
                        <div key={i} className={f.inline ? "" : "sm:col-span-3"}>
                          <p className="text-[#f2f3f5] text-xs font-semibold" dangerouslySetInnerHTML={{ __html: mdToHtml(f.name || "Field") }} />
                          <p className="text-[#dbdee1] text-xs whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: mdToHtml(f.value) }} />
                        </div>
                      ))}
                  </div>
                )}
                {em.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={em.imageUrl} alt="" className="rounded mt-2 max-h-64 w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                )}
                {(em.footerText || em.timestamp) && (
                  <div className="flex items-center gap-1.5 mt-2">
                    {em.footerIconUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={em.footerIconUrl} alt="" className="h-4 w-4 rounded-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                    )}
                    <span className="text-[#a8aab0] text-[11px]">
                      {esc(em.footerText)}
                      {em.footerText && em.timestamp ? " • " : ""}
                      {em.timestamp ? nowStr() : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {state.components.map((row) =>
            row.type === "buttons" ? (
              <div key={row.id} className="flex flex-wrap gap-2 mt-2">
                {row.items.map((it) => (
                  <span
                    key={it.id}
                    className="text-white text-sm font-medium px-3.5 py-1.5 rounded flex items-center gap-1.5"
                    style={{ background: it.kind === "link" ? "#4e5058" : BUTTON_COLORS[it.style] }}
                  >
                    {it.label || (it.kind === "link" ? "Link" : "Button")}
                    {it.kind === "link" && <span className="text-xs">↗</span>}
                  </span>
                ))}
              </div>
            ) : row.type ? (
              <div key={row.id} className="mt-2 bg-[#2b2d31] border border-[#1e1f22] rounded-lg px-3 py-2 text-sm text-[#949ba4] flex items-center justify-between max-w-sm">
                <span>{row.placeholder || `${SELECT_LABELS[row.type]}…`}</span>
                <span>⌄</span>
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}

function hasEmbedContent(em: EmbedCreatorState["embeds"][number]): boolean {
  return !!(em.title || em.description || em.fields.some((f) => f.name || f.value) || em.imageUrl || em.thumbnailUrl || em.authorName);
}
