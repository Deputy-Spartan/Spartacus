"use client";

import type { StickyButton } from "../../lib/api";
import { useBotAvatar } from "../../lib/useBotAvatar";

interface StickyPreviewProps {
  content: string;
  embedEnabled: boolean;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  buttons: StickyButton[];
}

// Mimics Discord's own dark theme colors (not the dashboard's neon theme)
// so what you see here is what actually shows up in Discord.
export function StickyPreview({ content, embedEnabled, embedTitle, embedDescription, embedColor, buttons }: StickyPreviewProps) {
  const hasContent = embedEnabled ? embedTitle || embedDescription || content : content;
  const avatarUrl = useBotAvatar();

  return (
    <div className="rounded-lg bg-[#313338] p-4 font-sans">
      <div className="flex gap-3">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-full bg-neon-gradient flex items-center justify-center text-sm font-bold text-base-950">
            S
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[#f2f3f5] font-medium text-sm">Spartacus</span>
            <span className="bg-[#5865f2] text-white text-[10px] px-1 rounded">BOT</span>
            <span className="text-[#949ba4] text-xs">Today at 12:00 PM</span>
          </div>

          {!hasContent && <p className="text-[#949ba4] text-sm italic mt-1">Nothing to preview yet.</p>}

          {!embedEnabled && content && <p className="text-[#dbdee1] text-sm mt-1 whitespace-pre-wrap break-words">{content}</p>}

          {embedEnabled && (embedTitle || embedDescription || content) && (
            <div
              className="mt-2 rounded bg-[#2b2d31] border-l-4 p-3 max-w-md"
              style={{ borderColor: embedColor || "#5865f2" }}
            >
              {embedTitle && <p className="text-[#f2f3f5] font-semibold text-sm mb-1">{embedTitle}</p>}
              <p className="text-[#dbdee1] text-sm whitespace-pre-wrap break-words">{embedDescription || content}</p>
            </div>
          )}

          {buttons.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {buttons.map((b, i) => (
                <div
                  key={i}
                  className="bg-[#4e5058] hover:bg-[#5c5e66] text-[#f2f3f5] text-sm px-3 py-1.5 rounded flex items-center gap-1.5"
                >
                  {b.label || "Button"}
                  <span className="text-xs">↗</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
