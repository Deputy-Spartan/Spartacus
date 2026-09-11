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
import { prisma } from "./prisma";

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
}
interface SavedEmbedRow {
  type: "buttons" | "string" | "user" | "role" | "user_role" | "channel" | null;
  placeholder?: string;
  items?: SavedEmbedButtonItem[];
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

export function buildSavedEmbedPayload(data: SavedEmbedData): BaseMessageOptions {
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

  const components = (data.components || [])
    .filter((r) => r.type)
    .slice(0, 5)
    .map((row) => {
      if (row.type === "buttons") {
        const buttons = (row.items || []).slice(0, 5).map((it) =>
          it.kind === "link"
            ? new ButtonBuilder().setLabel((it.label || "Link").slice(0, 80)).setStyle(ButtonStyle.Link).setURL(it.url || "https://discord.com")
            : new ButtonBuilder().setLabel((it.label || "Button").slice(0, 80)).setStyle(BUTTON_STYLES[it.style || "primary"]).setCustomId(`ecnoop:${randomId()}`)
        );
        return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
      }

      const customId = `ecnoop:${randomId()}`;
      const placeholder = (row.placeholder || "Choose an option…").slice(0, 150);
      if (row.type === "user") return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder));
      if (row.type === "role") return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(new RoleSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder));
      if (row.type === "user_role") return new ActionRowBuilder<MentionableSelectMenuBuilder>().addComponents(new MentionableSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder));
      if (row.type === "channel") return new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder));
      // STRING_SELECT is the one type Discord requires options for — this
      // control isn't wired to real choices yet (see interactionCreate.ts's
      // "ecnoop:" handler), so it ships one minimal placeholder option.
      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions({ label: "Option 1", value: "option_1" })
      );
    });

  return { content: data.content || "", embeds, components };
}
