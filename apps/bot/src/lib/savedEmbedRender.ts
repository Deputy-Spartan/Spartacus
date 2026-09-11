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

export async function buildSavedEmbedPayload(guildId: string, data: SavedEmbedData): Promise<BaseMessageOptions> {
  const embeds = (data.embeds || [])
    .map((em) => {
      const hasContent = em.title || em.description || (em.fields && em.fields.length) || em.imageUrl || em.thumbnailUrl || em.authorName;
      if (!hasContent) return null;
      const embed = new EmbedBuilder();
      if (em.authorName) embed.setAuthor({ name: em.authorName, iconURL: em.authorIconUrl || undefined, url: em.authorUrl || undefined });
      if (em.title) embed.setTitle(em.title.slice(0, 256));
      if (em.titleUrl) embed.setURL(em.titleUrl);
      if (em.description) embed.setDescription(em.description.slice(0, 4096));
      if (em.color) embed.setColor(em.color as `#${string}`);
      if (em.thumbnailUrl) embed.setThumbnail(em.thumbnailUrl);
      if (em.imageUrl) embed.setImage(em.imageUrl);
      if (em.fields && em.fields.length) {
        embed.addFields(
          em.fields
            .filter((f) => f.name || f.value)
            .slice(0, 25)
            .map((f) => ({ name: (f.name || "​").slice(0, 256), value: (f.value || "​").slice(0, 1024), inline: !!f.inline }))
        );
      }
      if (em.footerText || em.footerIconUrl) embed.setFooter({ text: (em.footerText || "​").slice(0, 2048), iconURL: em.footerIconUrl || undefined });
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
          buttons.push(new ButtonBuilder().setLabel((it.label || "Link").slice(0, 80)).setStyle(ButtonStyle.Link).setURL(it.url || "https://discord.com"));
          continue;
        }
        const customId = hasAction(it.action) ? await createActionCustomId(prisma, guildId, "button", it.action) : `ecnoop:${randomId()}`;
        buttons.push(new ButtonBuilder().setLabel((it.label || "Button").slice(0, 80)).setStyle(BUTTON_STYLES[it.style || "primary"]).setCustomId(customId));
      }
      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
      continue;
    }

    const hasAnyAction = hasAction(row.action) || (row.options || []).some((o) => hasAction(o.action));
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

  return { content: data.content || "", embeds, components };
}
