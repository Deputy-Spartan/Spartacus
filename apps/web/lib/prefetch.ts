import { api } from "./api";
import { inBackground } from "./apiCache";
import { ROUTE_LOADS } from "./routeLoads";

// What nearly every page uses, loaded once when you open a server.
const SHARED = ["getModules", "getDiscordChannels", "getDiscordRoles", "getDiscordEmojis"] as const;

export function preloadGuild(guildId: string) {
  inBackground(() => {
    for (const name of SHARED) api[name](guildId).catch(() => null);
  });
}

// Start a page's loads early, e.g. when its sidebar link is hovered.
export function prefetchRoute(guildId: string, href: string) {
  const route = href.split("?")[0].replace(`/dashboard/${guildId}`, "");
  const loads = ROUTE_LOADS[route];
  if (!loads) return;
  inBackground(() => {
    for (const name of loads) (api[name] as (id: string) => Promise<unknown>)(guildId).catch(() => null);
  });
}

// Wait a moment so sliding the mouse down the sidebar doesn't load every page.
export function hoverPrefetch(guildId: string, href: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    onMouseEnter: () => {
      timer = setTimeout(() => prefetchRoute(guildId, href), 100);
    },
    onMouseLeave: () => {
      if (timer) clearTimeout(timer);
    },
    onFocus: () => prefetchRoute(guildId, href),
  };
}
