"use client";

import { useEffect, useState } from "react";
import { useBotAvatar } from "../../lib/useBotAvatar";
import { DiscordButton, DiscordButtonRow, DiscordEmbed, DiscordMessage } from "../ui/DiscordPreview";
import { api, type EmbedCreatorComponentRow, type EmbedCreatorState, type DiscordRoleOption, type DiscordChannelOption } from "../../lib/api";

const SELECT_LABELS: Record<string, string> = { string: "Select Menu", user: "User Select", role: "Role Select", user_role: "User & Role Select", channel: "Channel Select" };

function nowStr(): string {
  return "Today at " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// `extra` is what a module adds under the saved embed, like the Rules panel's Agree buttons.
export function EmbedCreatorPreview({ guildId, state, extra }: { guildId: string; state: EmbedCreatorState; extra?: React.ReactNode }) {
  const botAvatar = useBotAvatar();
  const usesWebhookProfile = state.deliveryMode === "webhook" && (state.profileName || state.profileAvatar);
  const displayName = usesWebhookProfile && state.profileName ? state.profileName : "Spartacus";
  const avatarUrl = usesWebhookProfile && state.profileAvatar ? state.profileAvatar : botAvatar;

  const hasAnything = state.content.trim() || state.embeds.some(hasEmbedContent) || state.components.some((r) => r.type) || extra;
  if (!hasAnything) {
    return <p className="text-xs text-slate-600 text-center py-8">Nothing to preview yet — start typing.</p>;
  }

  return (
    <DiscordMessage name={displayName} avatarUrl={avatarUrl} tag="APP" time={nowStr()} content={state.content}>
          {state.embeds.filter(hasEmbedContent).map((em) => (
            <DiscordEmbed
              key={em.id}
              color={em.color || "#1e1f22"}
              author={em.authorName}
              authorIconUrl={em.authorIconUrl}
              title={em.title}
              description={em.description}
              fields={em.fields}
              thumbnailUrl={em.thumbnailUrl}
              imageUrl={em.imageUrl}
              footer={em.footerText}
              footerIconUrl={em.footerIconUrl}
              timestamp={!!em.timestamp}
            />
          ))}

          {state.components.map((row) =>
            row.type === "buttons" ? (
              <DiscordButtonRow key={row.id}>
                {row.items.map((it) => (
                  <DiscordButton key={it.id} label={it.label || (it.kind === "link" ? "Link" : "Button")} style={it.kind === "link" ? "link" : it.style} />
                ))}
              </DiscordButtonRow>
            ) : row.type ? (
              <SelectPreview key={row.id} guildId={guildId} row={row} />
            ) : null
          )}
          {extra}
    </DiscordMessage>
  );
}

function hasEmbedContent(em: EmbedCreatorState["embeds"][number]): boolean {
  return !!(em.title || em.description || em.fields.some((f) => f.name || f.value) || em.imageUrl || em.thumbnailUrl || em.authorName);
}

// Clicking any select-menu preview opens a real (mocked) options list,
// same as clicking it for real in Discord — string select shows exactly
// the configured options; role/channel select fetch the server's actual
// live roles/channels (Discord's picker always shows everything, it can't
// be filtered) with a small tag on ones that have a curated action.
function SelectPreview({ guildId, row }: { guildId: string; row: EmbedCreatorComponentRow }) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<DiscordRoleOption[] | null>(null);
  const [channels, setChannels] = useState<DiscordChannelOption[] | null>(null);

  useEffect(() => {
    if (!open) return;
    if (row.type === "role" && roles === null) api.getDiscordRoles(guildId).then(setRoles);
    if (row.type === "channel" && channels === null) api.getDiscordChannels(guildId).then((r) => setChannels([...r.textChannels, ...r.voiceChannels]));
  }, [open, row.type, guildId, roles, channels]);

  const optionValues = new Set((row.options ?? []).map((o) => o.value));
  const hasCurated = (row.options ?? []).length > 0;

  return (
    <div className="max-w-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-[#2b2d31] border border-[#1e1f22] rounded-lg px-3 py-2 text-sm text-[#949ba4] flex items-center justify-between hover:border-[#3a3c42] transition-colors"
      >
        <span>{row.placeholder || `${SELECT_LABELS[row.type as string]}…`}</span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {open && (
        <div className="mt-1 bg-[#2b2d31] border border-[#1e1f22] rounded-lg py-1.5 max-h-56 overflow-y-auto">
          {row.type === "string" &&
            ((row.options ?? []).length > 0 ? (
              (row.options ?? []).map((o) => (
                <div key={o.id} className="px-3 py-2 text-sm text-[#dbdee1] hover:bg-[#35373c] flex items-center justify-between gap-2">
                  <span className="truncate">{o.label || o.value}</span>
                  {o.action && o.action.type !== "none" && <span className="text-[9px] text-emerald-400 shrink-0">●</span>}
                </div>
              ))
            ) : (
              <p className="px-3 py-2 text-xs text-[#6d6f78]">No options added yet.</p>
            ))}

          {row.type === "role" &&
            (roles === null ? (
              <p className="px-3 py-2 text-xs text-[#6d6f78]">Loading roles…</p>
            ) : roles.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#6d6f78]">No roles found.</p>
            ) : (
              roles.map((r) => (
                <div key={r.id} className="px-3 py-2 text-sm text-[#dbdee1] hover:bg-[#35373c] flex items-center justify-between gap-2">
                  <span className="truncate">@{r.name}</span>
                  {hasCurated && optionValues.has(r.id) && <span className="text-[9px] text-emerald-400 shrink-0">● configured</span>}
                </div>
              ))
            ))}

          {row.type === "channel" &&
            (channels === null ? (
              <p className="px-3 py-2 text-xs text-[#6d6f78]">Loading channels…</p>
            ) : channels.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#6d6f78]">No channels found.</p>
            ) : (
              channels.map((c) => (
                <div key={c.id} className="px-3 py-2 text-sm text-[#dbdee1] hover:bg-[#35373c] flex items-center justify-between gap-2">
                  <span className="truncate">#{c.name}</span>
                  {hasCurated && optionValues.has(c.id) && <span className="text-[9px] text-emerald-400 shrink-0">● configured</span>}
                </div>
              ))
            ))}

          {(row.type === "user" || row.type === "user_role") && (
            <>
              <p className="px-3 py-2 text-xs text-[#6d6f78]">
                {row.type === "user" ? "Shows every member in the server." : "Shows every member and role in the server."} Discord's own picker — can't be
                previewed here without picking a real member.
              </p>
              {hasCurated && (
                <div className="px-3 pb-2">
                  <p className="text-[10px] text-slate-500 mb-1">Configured IDs:</p>
                  {(row.options ?? []).map((o) => (
                    <div key={o.id} className="text-xs text-[#dbdee1] flex items-center gap-1.5">
                      <span className="text-[9px] text-emerald-400">●</span>
                      <span className="truncate font-mono">{o.value || "(empty)"}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
