import type { EmbedCreatorState } from "./api";

// Discord's hard limits for one message. Anything over these and Discord
// rejects the whole send (or a module posting this saved embed fails), so
// the Embed Creator checks them live instead of letting the send fail.
// https://discord.com/developers/docs/resources/message#embed-object-embed-limits
export const DISCORD_LIMITS = {
  content: 2000,
  embeds: 10,
  embedTotal: 6000,
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  rows: 5,
  buttonsPerRow: 5,
  buttonLabel: 80,
  placeholder: 150,
  selectOptions: 25,
  optionLabel: 100,
} as const;

export interface LimitIssue {
  // "error": Discord will refuse the message. "warning": it sends, but not as shown.
  level: "error" | "warning";
  message: string;
}

export interface LimitReport {
  embedChars: number;
  issues: LimitIssue[];
  hasErrors: boolean;
}

// Discord counts characters the way Python does (code points), so an emoji
// like 🛡️ counts as 2, not the 3 UTF-16 units JS's .length would report.
export function charCount(s: string | undefined | null): number {
  return s ? [...s].length : 0;
}

function isValidUrl(url: string, allowed: string[]): boolean {
  try {
    return allowed.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function checkDiscordLimits(state: EmbedCreatorState): LimitReport {
  const L = DISCORD_LIMITS;
  const issues: LimitIssue[] = [];
  const err = (message: string) => issues.push({ level: "error", message });
  const warn = (message: string) => issues.push({ level: "warning", message });

  if (charCount(state.content) > L.content) err(`Message text is ${charCount(state.content)}/${L.content} characters.`);
  if (state.embeds.length > L.embeds) err(`${state.embeds.length} embeds — Discord allows ${L.embeds} per message.`);

  let embedChars = 0;
  let nonEmptyEmbeds = 0;
  state.embeds.forEach((em, i) => {
    const n = `Embed ${i + 1}`;
    const hasContent = em.title || em.description || em.fields.length || em.imageUrl || em.thumbnailUrl || em.authorName;
    if (!hasContent) {
      if (state.embeds.length > 1) warn(`${n} is empty and will be skipped.`);
      return;
    }
    nonEmptyEmbeds++;

    const check = (label: string, value: string | undefined, max: number) => {
      const c = charCount(value);
      if (c > max) err(`${n}: ${label} is ${c}/${max} characters.`);
      return c;
    };
    embedChars += check("title", em.title, L.title);
    embedChars += check("description", em.description, L.description);
    embedChars += check("author name", em.authorName, L.author);
    embedChars += check("footer", em.footerText, L.footer);

    if (em.fields.length > L.fields) err(`${n}: ${em.fields.length} fields — Discord allows ${L.fields}.`);
    em.fields.forEach((f, j) => {
      embedChars += check(`field ${j + 1} name`, f.name, L.fieldName);
      embedChars += check(`field ${j + 1} value`, f.value, L.fieldValue);
    });

    if (em.color && !/^#[0-9a-fA-F]{6}$/.test(em.color)) err(`${n}: color "${em.color}" isn't a valid hex color like #3b82f6.`);

    const urls: [string, string | undefined][] = [
      ["title link", em.titleUrl],
      ["author link", em.authorUrl],
    ];
    const imageUrls: [string, string | undefined][] = [
      ["image", em.imageUrl],
      ["thumbnail", em.thumbnailUrl],
      ["author icon", em.authorIconUrl],
      ["footer icon", em.footerIconUrl],
    ];
    for (const [label, url] of urls) {
      if (url && !isValidUrl(url, ["http:", "https:"])) err(`${n}: ${label} isn't a valid web address (must start with https://).`);
    }
    for (const [label, url] of imageUrls) {
      if (url && !isValidUrl(url, ["http:", "https:", "attachment:"])) err(`${n}: ${label} URL isn't a valid image address (must start with https://).`);
    }
  });

  if (embedChars > L.embedTotal) {
    err(`All embeds together use ${embedChars.toLocaleString()}/${L.embedTotal.toLocaleString()} characters. Shorten them or split across two messages.`);
  }

  const rows = state.components.filter((r) => r.type);
  if (rows.length > L.rows) err(`${rows.length} button/menu rows — Discord allows ${L.rows}.`);
  state.components.forEach((row, i) => {
    const n = `Row ${i + 1}`;
    if (!row.type) {
      warn(`${n} has no type picked and will be skipped.`);
      return;
    }
    if (row.type === "buttons") {
      if (row.items.length === 0) err(`${n} has no buttons. Add one or remove the row.`);
      if (row.items.length > L.buttonsPerRow) err(`${n} has ${row.items.length} buttons — Discord allows ${L.buttonsPerRow} per row.`);
      row.items.forEach((it, j) => {
        if (charCount(it.label) > L.buttonLabel) err(`${n}, button ${j + 1}: label is over ${L.buttonLabel} characters.`);
        if (it.kind === "link" && (!it.url || !isValidUrl(it.url, ["http:", "https:", "discord:"]))) {
          err(`${n}, button ${j + 1}: link button needs a valid URL (https://…).`);
        }
      });
      return;
    }
    if (charCount(row.placeholder) > L.placeholder) err(`${n}: placeholder is over ${L.placeholder} characters.`);
    if (row.type === "string") {
      const opts = row.options ?? [];
      if (opts.length === 0) warn(`${n}: no options yet, so a placeholder "Option 1" will be used.`);
      if (opts.length > L.selectOptions) err(`${n}: ${opts.length} options — Discord allows ${L.selectOptions}.`);
      const values = opts.map((o) => o.value);
      if (new Set(values).size !== values.length) err(`${n}: two options share the same value — each must be unique.`);
      opts.forEach((o, j) => {
        if (!o.label.trim()) err(`${n}, option ${j + 1}: needs a label.`);
        if (charCount(o.label) > L.optionLabel) err(`${n}, option ${j + 1}: label is over ${L.optionLabel} characters.`);
      });
    }
  });

  if (!state.content.trim() && nonEmptyEmbeds === 0 && rows.length === 0) {
    err("The message is empty. Add text, an embed, or a button.");
  }

  return { embedChars, issues, hasErrors: issues.some((i) => i.level === "error") };
}
