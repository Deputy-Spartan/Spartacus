import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type BaseMessageOptions } from "discord.js";

interface LinkButton {
  label: string;
  url: string;
}

export type RsvpRole = "TANK" | "DPS" | "HEALER" | "ATTENDING" | "ABSENT";

export const RSVP_ROLE_META: Record<RsvpRole, { label: string; fieldName: string; style: ButtonStyle }> = {
  TANK: { label: "Tank", fieldName: "🛡️ Tank", style: ButtonStyle.Primary },
  DPS: { label: "DPS", fieldName: "⚔️ DPS", style: ButtonStyle.Danger },
  HEALER: { label: "Healer", fieldName: "✨ Healer", style: ButtonStyle.Success },
  ATTENDING: { label: "Attending", fieldName: "✅ Attending", style: ButtonStyle.Secondary },
  ABSENT: { label: "Absent", fieldName: "❌ Absent", style: ButtonStyle.Secondary },
};

export interface EventLike {
  id: string;
  title: string;
  description: string | null;
  startTime: Date;
  embedEnabled: boolean;
  embedColor: string | null;
  buttons: unknown;
  enabledRoles: unknown;
}

function parseEnabledRoles(input: unknown): RsvpRole[] {
  const list = Array.isArray(input) ? (input as string[]) : [];
  const valid = list.filter((r): r is RsvpRole => r in RSVP_ROLE_META);
  return valid.length > 0 ? valid : (["TANK", "DPS", "HEALER", "ATTENDING", "ABSENT"] as RsvpRole[]);
}

function rsvpRow(eventId: string, roles: RsvpRole[]) {
  if (roles.length === 0) return null;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    roles.map((role) =>
      new ButtonBuilder().setCustomId(`event:${eventId}:${role}`).setLabel(RSVP_ROLE_META[role].label).setStyle(RSVP_ROLE_META[role].style)
    )
  );
}

function linkButtonsRow(buttons: unknown) {
  const list = Array.isArray(buttons) ? (buttons as LinkButton[]) : [];
  if (list.length === 0) return null;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    list.map((b) => new ButtonBuilder().setLabel(b.label).setURL(b.url).setStyle(ButtonStyle.Link))
  );
}

// The RSVP row only includes whichever roles the dashboard left enabled —
// a simple meetup might just want Attending/Absent, not the raid roles —
// plus an optional second row of link buttons. The embed toggle controls
// only whether the decorative info card renders vs a plain-text summary;
// RSVP still works either way.
export function buildEventPayload(event: EventLike): BaseMessageOptions {
  const roles = parseEnabledRoles(event.enabledRoles);
  const rows = [rsvpRow(event.id, roles), linkButtonsRow(event.buttons)].filter(
    (r): r is ActionRowBuilder<ButtonBuilder> => r !== null
  );

  if (!event.embedEnabled) {
    const content = `**${event.title}**\n${event.description ?? ""}\n🕒 <t:${Math.floor(event.startTime.getTime() / 1000)}:F>`;
    return { content, embeds: [], components: rows };
  }

  const embed = new EmbedBuilder()
    .setColor((event.embedColor ?? "#00E5FF") as `#${string}`)
    .setTitle(`⚔️ ${event.title}`)
    .setDescription(event.description ?? "No description provided.")
    .addFields(
      { name: "🕒 Starts", value: `<t:${Math.floor(event.startTime.getTime() / 1000)}:F>`, inline: true },
      ...roles.map((role) => ({ name: RSVP_ROLE_META[role].fieldName, value: "—", inline: true }))
    )
    .setFooter({ text: "Spartacus Event Coordination" });

  return { content: "", embeds: [embed], components: rows };
}
