// Every standard Unicode emoji Discord can show, grouped the way Discord's own
// picker groups them. The full list (about 1,900) comes from the
// unicode-emoji-json package and is only downloaded the first time a picker
// opens, so pages don't get heavier.

export interface StandardEmoji {
  emoji: string;
  name: string;
  search: string; // name and slug squashed together, for matching "thumbsup" to "thumbs up"
  tones: boolean; // takes a skin tone
}

export interface EmojiCategory {
  label: string;
  icon: string;
  emojis: StandardEmoji[];
}

// Newer emoji than this don't show in Discord yet, and Discord rejects them
// on buttons and reactions.
const MAX_EMOJI_VERSION = 15.1;

const LABELS: Record<string, [string, string]> = {
  smileys_emotion: ["Smileys", "😀"],
  people_body: ["People", "👋"],
  animals_nature: ["Nature", "🐻"],
  food_drink: ["Food", "🍔"],
  travel_places: ["Travel", "✈️"],
  activities: ["Activities", "⚽"],
  objects: ["Objects", "💡"],
  symbols: ["Symbols", "❤️"],
  flags: ["Flags", "🏳️"],
};

interface RawGroup {
  name: string;
  slug: string;
  emojis: Array<{ emoji: string; name: string; slug: string; emoji_version: string; skin_tone_support: boolean }>;
}

let loading: Promise<EmojiCategory[]> | null = null;

export function loadStandardEmojis(): Promise<EmojiCategory[]> {
  loading ??= import("unicode-emoji-json/data-by-group.json").then((mod) => {
    const groups = ((mod as { default?: unknown }).default ?? mod) as RawGroup[];
    return groups
      .filter((g) => g.slug !== "component")
      .map((g) => ({
        label: LABELS[g.slug]?.[0] ?? g.name,
        icon: LABELS[g.slug]?.[1] ?? g.emojis[0]?.emoji ?? "•",
        emojis: g.emojis
          .filter((e) => Number(e.emoji_version) <= MAX_EMOJI_VERSION)
          .map((e) => ({ emoji: e.emoji, name: e.name, search: `${e.name} ${e.slug}`.toLowerCase().replace(/[\s_:-]+/g, ""), tones: e.skin_tone_support })),
      }));
  });
  return loading;
}

// Skin tone modifiers, light to dark. Index 0 is the default yellow.
export const SKIN_TONES = ["", "\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];
export const SKIN_TONE_SWATCHES = ["✋", "✋🏻", "✋🏼", "✋🏽", "✋🏾", "✋🏿"];

// Puts the tone after the first person in the emoji, the way Discord does,
// dropping the variation selector that a tone replaces.
export function withSkinTone(e: StandardEmoji, tone: number): string {
  if (!tone || !e.tones) return e.emoji;
  const chars = [...e.emoji];
  const rest = chars.slice(1);
  if (rest[0] === "️") rest.shift();
  return chars[0] + SKIN_TONES[tone] + rest.join("");
}
