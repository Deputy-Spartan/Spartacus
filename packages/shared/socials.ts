// Streaming › Socials: the platforms you can show on stream (the OBS overlay)
// and post in Discord (the socials post), with how each name becomes a link.
// The dashboard, the API and the bot all read this one list.

export const SOCIAL_PLATFORM_IDS = ["twitch", "kick", "youtube", "tiktok", "x", "discord", "instagram"] as const;
export type SocialPlatformId = (typeof SOCIAL_PLATFORM_IDS)[number];

export interface SocialPlatform {
  id: SocialPlatformId;
  label: string;
  // What the name box asks for, e.g. "your-invite" for Discord.
  placeholder: string;
  // The address without https://, e.g. kick.com/Deputy_Spartan.
  link: (name: string) => string;
}

const clean = (name: string) => name.trim().replace(/^@/, "").replace(/^https?:\/\//, "");

export const SOCIAL_PLATFORMS: Record<SocialPlatformId, SocialPlatform> = {
  twitch: { id: "twitch", label: "Twitch", placeholder: "Your Twitch name", link: (n) => `twitch.tv/${clean(n)}` },
  kick: { id: "kick", label: "Kick", placeholder: "Your Kick name", link: (n) => `kick.com/${clean(n)}` },
  youtube: { id: "youtube", label: "YouTube", placeholder: "Your YouTube @handle", link: (n) => `youtube.com/@${clean(n)}` },
  tiktok: { id: "tiktok", label: "TikTok", placeholder: "Your TikTok name", link: (n) => `tiktok.com/@${clean(n)}` },
  x: { id: "x", label: "X", placeholder: "Your X name", link: (n) => `x.com/${clean(n)}` },
  discord: {
    id: "discord",
    label: "Discord",
    placeholder: "Your server invite code",
    // A full invite link pasted in still works.
    link: (n) => `discord.gg/${clean(n).replace(/^(discord\.gg|discord\.com\/invite)\//, "")}`,
  },
  instagram: { id: "instagram", label: "Instagram", placeholder: "Your Instagram name", link: (n) => `instagram.com/${clean(n)}` },
};

// The bot's own emoji for each platform (uploaded once from apps/bot/assets/socials).
export const socialEmojiName = (id: SocialPlatformId) => `sp_${id}`;

export const SOCIALS_POST_DEFAULTS = {
  title: "🔗 Find me everywhere",
  text: "Follow, sub and say hi. Tap a name to open it.",
};
