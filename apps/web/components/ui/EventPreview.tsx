"use client";

import type { RsvpRole, StickyButton } from "../../lib/api";
import { useBotAvatar } from "../../lib/useBotAvatar";

interface EventPreviewProps {
  title: string;
  description: string;
  startTime: string;
  embedEnabled: boolean;
  embedColor: string;
  buttons: StickyButton[];
  enabledRoles: RsvpRole[];
}

const ROLE_META: Record<RsvpRole, { fieldLabel: string; buttonLabel: string }> = {
  TANK: { fieldLabel: "🛡️ Tank", buttonLabel: "Tank" },
  DPS: { fieldLabel: "⚔️ DPS", buttonLabel: "DPS" },
  HEALER: { fieldLabel: "✨ Healer", buttonLabel: "Healer" },
  ATTENDING: { fieldLabel: "✅ Attending", buttonLabel: "Attending" },
  ABSENT: { fieldLabel: "❌ Absent", buttonLabel: "Absent" },
};

// Mirrors apps/bot/src/lib/eventRender.ts's actual output so what you see
// here is what gets posted to Discord.
export function EventPreview({ title, description, startTime, embedEnabled, embedColor, buttons, enabledRoles }: EventPreviewProps) {
  const timeLabel = startTime ? new Date(startTime).toLocaleString() : "—";
  const fields = [
    { label: "🕒 Starts", value: timeLabel },
    ...enabledRoles.map((role) => ({ label: ROLE_META[role].fieldLabel, value: "—" })),
  ];
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
          </div>

          {!embedEnabled && (
            <p className="text-[#dbdee1] text-sm mt-1 whitespace-pre-wrap">
              <span className="font-semibold">{title || "Event Title"}</span>
              {"\n"}
              {description || ""}
              {"\n"}🕒 {timeLabel}
            </p>
          )}

          {embedEnabled && (
            <div className="mt-2 rounded bg-[#2b2d31] border-l-4 p-3 max-w-md" style={{ borderColor: embedColor || "#00E5FF" }}>
              <p className="text-[#f2f3f5] font-semibold text-sm mb-1">⚔️ {title || "Event Title"}</p>
              <p className="text-[#dbdee1] text-sm mb-2 whitespace-pre-wrap">{description || "No description provided."}</p>
              <div className="grid grid-cols-3 gap-2">
                {fields.map((f) => (
                  <div key={f.label}>
                    <p className="text-[#949ba4] text-[11px] font-semibold uppercase">{f.label}</p>
                    <p className="text-[#dbdee1] text-xs">{f.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {enabledRoles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {enabledRoles.map((role) => (
                <div key={role} className="bg-[#4e5058] text-[#f2f3f5] text-xs px-2.5 py-1 rounded">
                  {ROLE_META[role].buttonLabel}
                </div>
              ))}
            </div>
          )}
          {buttons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {buttons.map((b, i) => (
                <div key={i} className="bg-[#4e5058] text-[#f2f3f5] text-xs px-2.5 py-1 rounded flex items-center gap-1">
                  {b.label || "Button"} <span>↗</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
