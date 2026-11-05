// Owner Only → Quick Links: shortcuts to the sites Spartacus runs on.
// Stored on BotConfig (account-wide, not per server) and fully editable from
// the dashboard; these are only the starting set.

export interface QuickLink {
  label: string;
  url: string; // "" = not set yet
}

export interface QuickLinkGroup {
  id: string;
  icon: string;
  name: string;
  note: string;
  pinned: boolean; // shown under Quick Links in the sidebar
  links: QuickLink[];
}

// Fired in the browser after Quick Links are saved, so the sidebar reloads them.
export const QUICK_LINKS_EVENT = "spartacus:quick-links";

export const QUICK_LINK_LIMITS = { groups: 30, links: 12, name: 40, note: 120, label: 40, url: 500, icon: 64 };

const DISCORD_APP = "1547035749826691152";

const RENDER = "https://dashboard.render.com/web/srv-dagb643l550s73bc2kcg";
const VERCEL = "https://vercel.com/spartacus4/spartacus-web";
const NEON = "https://console.neon.tech/app/projects/sparkling-cell-08559389";
const CLOUDFLARE = "https://dash.cloudflare.com/1d9e86370276ee2d56061b9a11707114";
const GITHUB = "https://github.com/Deputy-Spartan/Spartacus";

// Every site Spartacus runs on or needs a key from, in one place.
export const DEFAULT_QUICK_LINKS: QuickLinkGroup[] = [
  {
    id: "render",
    icon: "🟣",
    name: "Render",
    note: "Runs the bot and the API (spartacus-api)",
    pinned: true,
    links: [
      { label: "Service & deploys", url: RENDER },
      { label: "Logs", url: `${RENDER}/logs` },
      { label: "Environment (API keys)", url: `${RENDER}/env` },
      { label: "Events", url: `${RENDER}/events` },
      { label: "Settings", url: `${RENDER}/settings` },
    ],
  },
  {
    id: "vercel",
    icon: "▲",
    name: "Vercel",
    note: "Hosts this dashboard (spartc.us)",
    pinned: true,
    links: [
      { label: "Project", url: VERCEL },
      { label: "Deployments", url: `${VERCEL}/deployments` },
      { label: "Logs", url: `${VERCEL}/logs` },
      { label: "Domains", url: `${VERCEL}/settings/domains` },
      { label: "Environment variables", url: `${VERCEL}/settings/environment-variables` },
    ],
  },
  {
    id: "discord",
    icon: "🎮",
    name: "Discord Developer Portal",
    note: "The bot's name, avatar, token, login redirect and invite link",
    pinned: true,
    links: [
      { label: "General info", url: `https://discord.com/developers/applications/${DISCORD_APP}/information` },
      { label: "Bot (token & avatar)", url: `https://discord.com/developers/applications/${DISCORD_APP}/bot` },
      { label: "OAuth2 (login & invite)", url: `https://discord.com/developers/applications/${DISCORD_APP}/oauth2` },
      { label: "Emojis", url: `https://discord.com/developers/applications/${DISCORD_APP}/emojis` },
    ],
  },
  {
    id: "claude",
    icon: "✳️",
    name: "Claude Console",
    note: "AI Chat & AI Moderation: keys, credit and spend limit",
    pinned: true,
    links: [
      { label: "API keys", url: "https://platform.claude.com/settings/keys" },
      { label: "Billing & credit", url: "https://platform.claude.com/settings/billing" },
      { label: "Spend limits", url: "https://platform.claude.com/settings/limits" },
      { label: "Usage", url: "https://platform.claude.com/usage" },
    ],
  },
  {
    id: "github",
    icon: "🐙",
    name: "GitHub",
    note: "The code. Every push to main updates the bot and dashboard",
    pinned: true,
    links: [
      { label: "Repository", url: GITHUB },
      { label: "Recent commits", url: `${GITHUB}/commits/main` },
      { label: "Webhooks", url: `${GITHUB}/settings/hooks` },
    ],
  },
  {
    id: "neon",
    icon: "🐘",
    name: "Neon",
    note: "The database",
    pinned: false,
    links: [
      { label: "Project", url: NEON },
      { label: "Branches", url: `${NEON}/branches` },
      { label: "Main branch", url: `${NEON}/branches/br-quiet-leaf-aepja1jh` },
    ],
  },
  {
    id: "cloudflare",
    icon: "🟠",
    name: "Cloudflare",
    note: "The spartc.us domain: renewal and DNS",
    pinned: false,
    links: [
      { label: "spartc.us", url: `${CLOUDFLARE}/spartc.us` },
      { label: "DNS records", url: `${CLOUDFLARE}/spartc.us/dns/records` },
      { label: "Account home", url: CLOUDFLARE },
    ],
  },
  {
    id: "streaming",
    icon: "📡",
    name: "Streaming Platforms",
    note: "Developer apps whose keys power Going Live alerts",
    pinned: false,
    links: [
      { label: "Twitch app", url: "https://dev.twitch.tv/console/apps/90qzo1tog7x49ey3eatuiwgo455dks" },
      { label: "Kick developer", url: "https://kick.com/settings/developer" },
    ],
  },
  {
    id: "uptimerobot",
    icon: "🟢",
    name: "UptimeRobot",
    note: "Watches that the bot and dashboard stay up",
    pinned: false,
    links: [{ label: "Monitors", url: "https://dashboard.uptimerobot.com/monitors" }],
  },
  {
    id: "changelog",
    icon: "📝",
    name: "Spartacus Changelog",
    note: "Before / Now of every change",
    pinned: false,
    links: [{ label: "Changelog", url: "https://claude.ai/artifact/3VPCUiSnRQYb9ctet6eecu" }],
  },
];

// Keeps only safe, well-formed entries. Links must be http(s) or empty.
export function cleanQuickLinks(input: unknown): QuickLinkGroup[] | null {
  if (!Array.isArray(input)) return null;
  const L = QUICK_LINK_LIMITS;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const url = (v: unknown) => {
    const u = str(v, L.url);
    if (!u) return "";
    try {
      const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
    } catch {
      return null;
    }
  };
  const seen = new Set<string>();
  const out: QuickLinkGroup[] = [];
  for (const g of input.slice(0, L.groups)) {
    if (!g || typeof g !== "object") continue;
    const o = g as Record<string, unknown>;
    let id = str(o.id, 40).replace(/[^\w-]/g, "") || Math.random().toString(36).slice(2, 10);
    while (seen.has(id)) id += "x";
    seen.add(id);
    const links: QuickLink[] = [];
    for (const l of Array.isArray(o.links) ? o.links.slice(0, L.links) : []) {
      if (!l || typeof l !== "object") continue;
      const u = url((l as Record<string, unknown>).url);
      if (u === null) return null; // a bad link is an error, not silently dropped
      links.push({ label: str((l as Record<string, unknown>).label, L.label) || "Link", url: u });
    }
    out.push({
      id,
      icon: str(o.icon, L.icon) || "🔗",
      name: str(o.name, L.name) || "Untitled",
      note: str(o.note, L.note),
      pinned: o.pinned === true,
      links,
    });
  }
  return out;
}

// The page a group's sidebar entry opens: its first link that's set.
export function quickLinkMain(g: QuickLinkGroup): string | null {
  return g.links.find((l) => l.url)?.url ?? null;
}
