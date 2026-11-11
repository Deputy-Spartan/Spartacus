"use client";

import type { RsvpRole, StickyButton } from "../../lib/api";
import { DiscordButton, DiscordButtonRow, DiscordEmbed, DiscordMessage } from "./DiscordPreview";

interface EventPreviewProps {
  title: string;
  description: string;
  startTime: string;
  embedEnabled: boolean;
  embedColor: string;
  buttons: StickyButton[];
  enabledRoles: RsvpRole[];
}

// Same names and button colors as apps/bot/src/lib/eventRender.ts.
const ROLE_META: Record<RsvpRole, { fieldLabel: string; buttonLabel: string; style: string }> = {
  TANK: { fieldLabel: "🛡️ Tank", buttonLabel: "Tank", style: "primary" },
  DPS: { fieldLabel: "⚔️ DPS", buttonLabel: "DPS", style: "danger" },
  HEALER: { fieldLabel: "✨ Healer", buttonLabel: "Healer", style: "success" },
  ATTENDING: { fieldLabel: "✅ Attending", buttonLabel: "Attending", style: "secondary" },
  ABSENT: { fieldLabel: "❌ Absent", buttonLabel: "Absent", style: "secondary" },
};

// Mirrors apps/bot/src/lib/eventRender.ts's actual output so what you see
// here is what gets posted to Discord.
export function EventPreview({ title, description, startTime, embedEnabled, embedColor, buttons, enabledRoles }: EventPreviewProps) {
  // The bot posts a Discord timestamp, which each member sees in their own time zone.
  const when = startTime && !Number.isNaN(new Date(startTime).getTime()) ? `<t:${Math.floor(new Date(startTime).getTime() / 1000)}:F>` : "—";

  return (
    <DiscordMessage content={embedEnabled ? null : `**${title || "Event Title"}**\n${description || ""}\n🕒 ${when}`}>
      {embedEnabled && (
        <DiscordEmbed
          color={embedColor || "#00E5FF"}
          title={`⚔️ ${title || "Event Title"}`}
          description={description || "No description provided."}
          fields={[{ name: "🕒 Starts", value: when, inline: true }, ...enabledRoles.map((role) => ({ name: ROLE_META[role].fieldLabel, value: "—", inline: true }))]}
          footer="Spartacus Event Coordination"
        />
      )}
      {enabledRoles.length > 0 && (
        <DiscordButtonRow>
          {enabledRoles.map((role) => (
            <DiscordButton key={role} label={ROLE_META[role].buttonLabel} style={ROLE_META[role].style} />
          ))}
        </DiscordButtonRow>
      )}
      {buttons.length > 0 && (
        <DiscordButtonRow>
          {buttons.map((b, i) => (
            <DiscordButton key={i} label={b.label || "Button"} style="link" />
          ))}
        </DiscordButtonRow>
      )}
    </DiscordMessage>
  );
}
