import { prisma, createActionCustomId, type EmbedActionConfig, type EmbedSelectOption } from "@spartacus/db";

// Converts the Embed Creator's builder-friendly shape (one object per
// embed/row, arrays of plain fields) into the raw Discord message-body JSON
// (embeds[] + components[] actions rows) that both the bot-send and
// webhook-send paths post as-is. Kept separate from the route so the same
// conversion is trivially testable without spinning up Express.
export interface BuilderField {
  name: string;
  value: string;
  inline?: boolean;
}
export interface BuilderEmbed {
  authorName?: string;
  authorIconUrl?: string;
  authorUrl?: string;
  title?: string;
  titleUrl?: string;
  description?: string;
  color?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  fields?: BuilderField[];
  footerText?: string;
  footerIconUrl?: string;
  timestamp?: boolean;
}
export interface BuilderButtonItem {
  kind: "button" | "link";
  label?: string;
  style?: "primary" | "secondary" | "success" | "danger";
  url?: string;
  action?: EmbedActionConfig;
}
export interface BuilderComponentRow {
  type: "buttons" | "string" | "user" | "role" | "user_role" | "channel" | null;
  placeholder?: string;
  items?: BuilderButtonItem[];
  options?: EmbedSelectOption[];
  action?: EmbedActionConfig;
  defaultValueId?: string; // pre-selects a role/channel/user in the picker — Discord's own "default value" for that select type
}

const BUTTON_STYLES: Record<string, number> = { primary: 1, secondary: 2, success: 3, danger: 4 };
const SELECT_TYPES: Record<string, number> = { string: 3, user: 5, role: 6, user_role: 7, channel: 8 };

function hexToInt(hex?: string): number | undefined {
  if (!hex) return undefined;
  const n = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(n) ? undefined : n;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function hasAction(action?: EmbedActionConfig): boolean {
  return !!action && action.type !== "none";
}

export function buildEmbedJson(em: BuilderEmbed): Record<string, unknown> | null {
  const hasContent = em.title || em.description || (em.fields && em.fields.length) || em.imageUrl || em.thumbnailUrl || em.authorName;
  if (!hasContent) return null;

  const embed: Record<string, unknown> = {};
  if (em.authorName) embed.author = { name: em.authorName, icon_url: em.authorIconUrl || undefined, url: em.authorUrl || undefined };
  if (em.title) embed.title = em.title;
  if (em.titleUrl) embed.url = em.titleUrl;
  if (em.description) embed.description = em.description;
  const colorInt = hexToInt(em.color);
  if (colorInt !== undefined) embed.color = colorInt;
  if (em.thumbnailUrl) embed.thumbnail = { url: em.thumbnailUrl };
  if (em.imageUrl) embed.image = { url: em.imageUrl };
  if (em.fields && em.fields.length) {
    embed.fields = em.fields
      .filter((f) => f.name || f.value)
      .slice(0, 25)
      .map((f) => ({ name: (f.name || "​").slice(0, 256), value: (f.value || "​").slice(0, 1024), inline: !!f.inline }));
  }
  if (em.footerText || em.footerIconUrl) embed.footer = { text: (em.footerText || "​").slice(0, 2048), icon_url: em.footerIconUrl || undefined };
  if (em.timestamp) embed.timestamp = new Date().toISOString();
  return embed;
}

// A button/select with no configured action still gets a custom_id (every
// interactive component needs one), just a plain random one prefixed
// "ecnoop:" that the bot answers with an honest "not connected" message
// instead of Discord's own bare interaction failure. One WITH an action
// gets a real "ecaction:<id>" pointing at a persisted EmbedComponentAction
// row the bot actually executes (see apps/bot/src/modules/community/embedActions.ts).
export async function buildComponentsJson(guildId: string, rows: BuilderComponentRow[]): Promise<Array<Record<string, unknown>>> {
  const result: Array<Record<string, unknown>> = [];

  for (const row of rows.filter((r) => r.type).slice(0, 5)) {
    if (row.type === "buttons") {
      const items: Array<Record<string, unknown>> = [];
      for (const it of (row.items || []).slice(0, 5)) {
        if (it.kind === "link") {
          items.push({ type: 2, style: 5, label: (it.label || "Link").slice(0, 80), url: it.url || "https://discord.com" });
          continue;
        }
        const customId = hasAction(it.action) ? await createActionCustomId(prisma, guildId, "button", it.action) : `ecnoop:${randomId()}`;
        items.push({ type: 2, style: BUTTON_STYLES[it.style || "primary"], label: (it.label || "Button").slice(0, 80), custom_id: customId });
      }
      result.push({ type: 1, components: items });
      continue;
    }

    const selectType = SELECT_TYPES[row.type as string] ?? 3;
    // A curated options list restricts the picker even if none of the
    // listed roles/channels/users have a custom action set — those still
    // fall back to a sensible default (e.g. self-toggle a role) rather than
    // silently allowing anything Discord's own unfiltered picker shows.
    const hasAnyAction = hasAction(row.action) || (row.options || []).length > 0;
    const customId = hasAnyAction
      ? await createActionCustomId(prisma, guildId, "select", {
          selectType: row.type,
          defaultAction: row.action,
          options: (row.options || []).map((o) => ({ value: o.value, action: o.action })),
        })
      : `ecnoop:${randomId()}`;

    const component: Record<string, unknown> = { type: selectType, custom_id: customId, placeholder: (row.placeholder || "Choose an option…").slice(0, 150) };
    if (selectType === 3) {
      const opts = (row.options && row.options.length ? row.options : [{ label: "Option 1", value: "option_1" }]).slice(0, 25);
      component.options = opts.map((o) => ({ label: o.label.slice(0, 100), value: o.value.slice(0, 100) }));
    }
    // Discord's own "default value" — pre-selects a role/channel/user in the
    // picker so it opens already showing a choice instead of empty.
    const defaultType = row.type === "role" ? "role" : row.type === "channel" ? "channel" : row.type === "user" ? "user" : null;
    if (defaultType && row.defaultValueId) {
      component.default_values = [{ id: row.defaultValueId, type: defaultType }];
    }
    result.push({ type: 1, components: [component] });
  }

  return result;
}

export async function buildMessagePayload(guildId: string, input: { content?: string; embeds?: BuilderEmbed[]; components?: BuilderComponentRow[] }) {
  const embeds = (input.embeds || []).map(buildEmbedJson).filter((e): e is Record<string, unknown> => e !== null);
  const components = await buildComponentsJson(guildId, input.components || []);
  const payload: Record<string, unknown> = {};
  if (input.content) payload.content = input.content;
  if (embeds.length) payload.embeds = embeds;
  if (components.length) payload.components = components;
  return payload;
}
