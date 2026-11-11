"use client";

import { useState } from "react";
import { useBotAvatar } from "../../lib/useBotAvatar";
import { DiscordMarkdown, type SampleNames } from "./DiscordMarkdown";

// Building blocks for previews that look the way Discord draws them: the
// message row, embeds, buttons and dropdowns. Sizes and colors follow
// Discord's dark theme.

export function DiscordMessage({
  children,
  content,
  time = "Today at 12:00 PM",
  name = "Spartacus",
  ephemeral,
  className,
  avatarUrl: avatarOverride,
  tag = "APP",
  names,
}: {
  children?: React.ReactNode;
  content?: string | null;
  time?: string;
  name?: string;
  ephemeral?: boolean;
  className?: string;
  avatarUrl?: string | null;
  tag?: string | null;
  names?: SampleNames;
}) {
  const botAvatar = useBotAvatar();
  const avatarUrl = avatarOverride || botAvatar;
  return (
    <div className={["rounded-lg bg-[#313338] p-4 font-sans text-[#dbdee1] text-[15px] leading-[1.375]", className ?? ""].join(" ")}>
      <div className="flex gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-full bg-neon-gradient flex items-center justify-center text-sm font-bold text-base-950">S</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[#f2f3f5] font-medium text-[15px]">{name}</span>
            {tag && <span className="bg-[#5865f2] text-white text-[10px] font-semibold leading-[15px] px-1 rounded-[3px]">{tag}</span>}
            <span className="text-[#949ba4] text-xs">{time}</span>
          </div>
          {content && <DiscordMarkdown text={content} names={names} className="mt-0.5" />}
          {children && <div className="mt-1 space-y-2">{children}</div>}
          {ephemeral && <p className="mt-1.5 text-xs text-[#949ba4]">👁 Only you can see this · Dismiss message</p>}
        </div>
      </div>
    </div>
  );
}

export interface PreviewField {
  name: string;
  value: string;
  inline?: boolean;
}

export function DiscordEmbed({
  color,
  author,
  authorIconUrl,
  title,
  description,
  fields = [],
  thumbnailUrl,
  imageUrl,
  footer,
  footerIconUrl,
  timestamp,
  children,
  names,
}: {
  names?: SampleNames;
  color?: string | number | null;
  author?: string | null;
  authorIconUrl?: string | null;
  title?: string | null;
  description?: string | null;
  fields?: PreviewField[];
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  footer?: string | null;
  footerIconUrl?: string | null;
  timestamp?: boolean;
  children?: React.ReactNode;
}) {
  const bar = typeof color === "number" ? `#${color.toString(16).padStart(6, "0")}` : color || "#1e1f22";
  const shown = fields.filter((f) => f.name || f.value);
  return (
    <div className="grid max-w-[432px] rounded bg-[#2b2d31] border-l-4 overflow-hidden" style={{ borderColor: bar }}>
      <div className="px-4 pt-2 pb-4 min-w-0">
        {thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="float-right ml-4 mt-2 h-20 w-20 rounded object-cover" />
        )}
        {author && (
          <div className="mt-2 flex items-center gap-2">
            {authorIconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={authorIconUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
            )}
            <span className="text-[#f2f3f5] text-sm font-semibold">{author}</span>
          </div>
        )}
        {title && <DiscordMarkdown inline names={names} text={title} as="div" className="mt-2 text-[#f2f3f5] text-base font-semibold" />}
        {description && <DiscordMarkdown text={description} names={names} className="mt-2 text-sm" />}
        {shown.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-2">
            {shown.map((f, i) => (
              <div key={i} className={f.inline ? "min-w-0" : "col-span-3 min-w-0"}>
                <DiscordMarkdown inline text={f.name || "​"} as="div" className="text-[#f2f3f5] text-sm font-semibold mb-0.5" />
                <DiscordMarkdown text={f.value || "​"} names={names} className="text-sm" />
              </div>
            ))}
          </div>
        )}
        {children}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="mt-4 rounded max-h-[300px] w-full object-cover clear-both" />
        )}
        {(footer || timestamp) && (
          <div className="mt-2 flex items-center gap-2 clear-both">
            {footerIconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={footerIconUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
            )}
            <span className="text-[#dbdee1] text-xs">
              {footer}
              {footer && timestamp ? " • " : ""}
              {timestamp ? `Today at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const BUTTON_BG: Record<string, string> = { primary: "#5865f2", secondary: "#4e5058", success: "#248046", danger: "#da373c", link: "#4e5058" };

// A button's emoji, either a standard one or a server emoji token.
function ButtonEmoji({ emoji }: { emoji?: string | null }) {
  if (!emoji) return null;
  const m = emoji.match(/^<(a?):(\w+):(\d+)>$/);
  if (m)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`https://cdn.discordapp.com/emojis/${m[3]}.${m[1] ? "gif" : "png"}?size=48`} alt={`:${m[2]}:`} className="h-[18px] w-[18px] object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
    );
  return <span className="text-[16px] leading-none">{emoji}</span>;
}

export function DiscordButton({ label, emoji, style = "secondary", disabled }: { label?: string | null; emoji?: string | null; style?: string; disabled?: boolean }) {
  const s = style.toLowerCase();
  return (
    <span
      className={["inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-sm font-medium text-white", disabled ? "opacity-50" : ""].join(" ")}
      style={{ background: BUTTON_BG[s] ?? BUTTON_BG.secondary }}
    >
      <ButtonEmoji emoji={emoji} />
      {label}
      {s === "link" && (
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="opacity-90">
          <path fill="currentColor" d="M15 2a1 1 0 1 0 0 2h3.6l-7.3 7.3a1 1 0 1 0 1.4 1.4L20 5.4V9a1 1 0 1 0 2 0V3a1 1 0 0 0-1-1h-6ZM5 4a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-6a1 1 0 1 0-2 0v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6a1 1 0 1 0 0-2H5Z" />
        </svg>
      )}
    </span>
  );
}

export function DiscordButtonRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export interface PreviewOption {
  label: string;
  emoji?: string | null;
  description?: string | null;
}

// A dropdown showing its placeholder. Clicking it opens the options, like in Discord.
export function DiscordSelect({ placeholder, options = [], open: startOpen = false }: { placeholder: string; options?: PreviewOption[]; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="max-w-[432px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 rounded-lg bg-[#1e1f22] border border-[#1e1f22] hover:border-[#4e5058] px-3 h-10 text-sm text-[#949ba4] text-left"
      >
        <DiscordMarkdown inline text={placeholder} className="truncate" />
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
          <path fill="currentColor" d="M5.3 9.3a1 1 0 0 1 1.4 0l5.3 5.29 5.3-5.3a1 1 0 1 1 1.4 1.42l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.42Z" />
        </svg>
      </button>
      {open && options.length > 0 && (
        <div className="mt-1 rounded-lg bg-[#2b2d31] border border-[#1e1f22] py-1">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#dbdee1]">
              <ButtonEmoji emoji={o.emoji} />
              <div className="min-w-0">
                <div className="truncate">{o.label}</div>
                {o.description && <div className="truncate text-xs text-[#949ba4]">{o.description}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The optional embed extras (author, thumbnail, image, footer, fields) as DiscordEmbed props.
export function extraEmbedProps(extra?: {
  authorName?: string;
  authorIconUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerText?: string;
  footerIconUrl?: string;
  timestamp?: boolean;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}) {
  return {
    author: extra?.authorName,
    authorIconUrl: extra?.authorIconUrl,
    thumbnailUrl: extra?.thumbnailUrl,
    imageUrl: extra?.imageUrl,
    footer: extra?.footerText,
    footerIconUrl: extra?.footerIconUrl,
    timestamp: extra?.timestamp,
    fields: extra?.fields ?? [],
  };
}
