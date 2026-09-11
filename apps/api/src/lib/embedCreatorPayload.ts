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
}
export interface BuilderComponentRow {
  type: "buttons" | "string" | "user" | "role" | "user_role" | "channel" | null;
  placeholder?: string;
  items?: BuilderButtonItem[];
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

// Non-link components (plain Button, every Select Menu type) have no bot
// logic behind them yet — same real-world limitation Discohook itself has.
// Rather than let Discord show its own bare "This interaction failed", every
// one gets a custom_id prefixed "ecnoop:" that the bot recognizes and
// answers with a clear, honest message instead (see
// apps/bot/src/events/interactionCreate.ts).
export function buildComponentsJson(rows: BuilderComponentRow[]): Array<Record<string, unknown>> {
  return rows
    .filter((r) => r.type)
    .slice(0, 5)
    .map((row) => {
      if (row.type === "buttons") {
        const items = (row.items || []).slice(0, 5).map((it) => {
          if (it.kind === "link") {
            return { type: 2, style: 5, label: (it.label || "Link").slice(0, 80), url: it.url || "https://discord.com" };
          }
          return { type: 2, style: BUTTON_STYLES[it.style || "primary"], label: (it.label || "Button").slice(0, 80), custom_id: `ecnoop:${randomId()}` };
        });
        return { type: 1, components: items };
      }

      const selectType = SELECT_TYPES[row.type as string] ?? 3;
      const component: Record<string, unknown> = {
        type: selectType,
        custom_id: `ecnoop:${randomId()}`,
        placeholder: (row.placeholder || "Choose an option…").slice(0, 150),
      };
      // A STRING_SELECT is the one type Discord requires options for — this
      // control isn't wired to real choices yet, so it ships one minimal
      // placeholder option rather than a broken empty menu.
      if (selectType === 3) component.options = [{ label: "Option 1", value: "option_1" }];
      return { type: 1, components: [component] };
    });
}

export function buildMessagePayload(input: { content?: string; embeds?: BuilderEmbed[]; components?: BuilderComponentRow[] }) {
  const embeds = (input.embeds || []).map(buildEmbedJson).filter((e): e is Record<string, unknown> => e !== null);
  const components = buildComponentsJson(input.components || []);
  const payload: Record<string, unknown> = {};
  if (input.content) payload.content = input.content;
  if (embeds.length) payload.embeds = embeds;
  if (components.length) payload.components = components;
  return payload;
}
