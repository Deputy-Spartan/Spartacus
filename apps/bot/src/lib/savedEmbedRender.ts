import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  EmbedBuilder,
  MentionableSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  type BaseMessageOptions,
} from "discord.js";
import { prisma, createActionCustomId, type EmbedActionConfig, type EmbedSelectOption } from "@spartacus/db";
import { applyTokens } from "./applyTokens";

// Every embed-producing feature (Welcome, Custom Commands, Announcements,
// Sticky Messages, Birthdays, Custom Slash Commands, Giveaways, LFG) can
// point at a saved embed from the Embed Creator library instead of building
// its own embed — this is the one place that turns an EmbedCreatorPreset's
// stored JSON into the actual discord.js payload every one of those
// features sends. Keep this in sync with apps/api/src/lib/embedCreatorPayload.ts,
// which does the equivalent conversion to raw REST JSON for routes that
// build messages without discord.js (e.g. resend-via-REST endpoints).
interface SavedEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}
interface SavedEmbedEmbed {
  authorName?: string;
  authorIconUrl?: string;
  authorUrl?: string;
  title?: string;
  titleUrl?: string;
  description?: string;
  color?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  fields?: SavedEmbedField[];
  footerText?: string;
  footerIconUrl?: string;
  timestamp?: boolean;
}
interface SavedEmbedButtonItem {
  kind: "button" | "link";
  label?: string;
  style?: "primary" | "secondary" | "success" | "danger";
  url?: string;
  action?: EmbedActionConfig;
}
interface SavedEmbedRow {
  type: "buttons" | "string" | "user" | "role" | "user_role" | "channel" | null;
  placeholder?: string;
  items?: SavedEmbedButtonItem[];
  options?: EmbedSelectOption[];
  action?: EmbedActionConfig;
  defaultValueId?: string;
}
export interface SavedEmbedData {
  content?: string;
  embeds?: SavedEmbedEmbed[];
  components?: SavedEmbedRow[];
}

// Looked up by id only — no guildId check here, since every call site
// already scoped which preset it's allowed to reference at config time
// (the dashboard's SavedEmbedPicker only ever lists that guild's own
// presets, and savedEmbedId is stored on a row that already belongs to
// this guild).
export async function resolveSavedEmbed(savedEmbedId: string | null | undefined): Promise<SavedEmbedData | null> {
  if (!savedEmbedId) return null;
  const preset = await prisma.embedCreatorPreset.findUnique({ where: { id: savedEmbedId } });
  if (!preset) return null;
  return preset.data as SavedEmbedData;
}

const BUTTON_STYLES: Record<string, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

function randomId(): string {
  return Math.random().toString(36).slice(2, 11);
}
function hasAction(action?: EmbedActionConfig): boolean {
  return !!action && action.type !== "none";
}

// `tokens` (e.g. {"{user}": "<@123>", "{server}": "My Server"}) are applied
// to every text field below — content, author name, title, description,
// field name/value, footer text, button labels — before building anything.
// Without this, a feature whose config supports tokens (Welcome's {user}/
// {server}, LFG's {user}/{voice}/{message}, etc.) would silently post them
// literally, unexpanded, whenever that config points at a saved embed
// instead of its own inline embed fields.
export async function buildSavedEmbedPayload(guildId: string, data: SavedEmbedData, tokens?: Record<string, string>): Promise<BaseMessageOptions> {
  const t = (s: string | undefined) => (s && tokens ? applyTokens(s, tokens) : s);

  const embeds = (data.embeds || [])
    .map((em) => {
      const hasContent = em.title || em.description || (em.fields && em.fields.length) || em.imageUrl || em.thumbnailUrl || em.authorName;
      if (!hasContent) return null;
      const embed = new EmbedBuilder();
      if (em.authorName) embed.setAuthor({ name: t(em.authorName)!, iconURL: em.authorIconUrl || undefined, url: em.authorUrl || undefined });
      if (em.title) embed.setTitle(t(em.title)!.slice(0, 256));
      if (em.titleUrl) embed.setURL(em.titleUrl);
      if (em.description) embed.setDescription(t(em.description)!.slice(0, 4096));
      if (em.color) embed.setColor(em.color as `#${string}`);
      if (em.thumbnailUrl) embed.setThumbnail(em.thumbnailUrl);
      if (em.imageUrl) embed.setImage(em.imageUrl);
      if (em.fields && em.fields.length) {
        embed.addFields(
          em.fields
            .filter((f) => f.name || f.value)
            .slice(0, 25)
            .map((f) => ({ name: (t(f.name) || "​").slice(0, 256), value: (t(f.value) || "​").slice(0, 1024), inline: !!f.inline }))
        );
      }
      if (em.footerText || em.footerIconUrl) embed.setFooter({ text: (t(em.footerText) || "​").slice(0, 2048), iconURL: em.footerIconUrl || undefined });
      if (em.timestamp) embed.setTimestamp(new Date());
      return embed;
    })
    .filter((e): e is EmbedBuilder => e !== null);

  const components: ActionRowBuilder<any>[] = [];
  for (const row of (data.components || []).filter((r) => r.type).slice(0, 5)) {
    if (row.type === "buttons") {
      const buttons: ButtonBuilder[] = [];
      for (const it of (row.items || []).slice(0, 5)) {
        if (it.kind === "link") {
          buttons.push(new ButtonBuilder().setLabel((t(it.label) || "Link").slice(0, 80)).setStyle(ButtonStyle.Link).setURL(it.url || "https://discord.com"));
          continue;
        }
        const customId = hasAction(it.action) ? await createActionCustomId(prisma, guildId, "button", it.action) : `ecnoop:${randomId()}`;
        buttons.push(new ButtonBuilder().setLabel((t(it.label) || "Button").slice(0, 80)).setStyle(BUTTON_STYLES[it.style || "primary"]).setCustomId(customId));
      }
      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
      continue;
    }

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
    const placeholder = (row.placeholder || "Choose an option…").slice(0, 150);

    if (row.type === "user") {
      const menu = new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);
      if (row.defaultValueId) menu.setDefaultUsers([row.defaultValueId]);
      components.push(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu));
      continue;
    }
    if (row.type === "role") {
      const menu = new RoleSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);
      if (row.defaultValueId) menu.setDefaultRoles([row.defaultValueId]);
      components.push(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu));
      continue;
    }
    if (row.type === "user_role") {
      components.push(new ActionRowBuilder<MentionableSelectMenuBuilder>().addComponents(new MentionableSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder)));
      continue;
    }
    if (row.type === "channel") {
      const menu = new ChannelSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder);
      if (row.defaultValueId) menu.setDefaultChannels([row.defaultValueId]);
      components.push(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu));
      continue;
    }
    // STRING_SELECT — the one type Discord requires real options for.
    const opts = (row.options && row.options.length ? row.options : [{ label: "Option 1", value: "option_1" }]).slice(0, 25);
    components.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(customId)
          .setPlaceholder(placeholder)
          .addOptions(opts.map((o) => ({ label: o.label.slice(0, 100), value: o.value.slice(0, 100) })))
      )
    );
  }

  return { content: t(data.content) || "", embeds, components };
}
