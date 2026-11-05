/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@spartacus/shared"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
  },
  // Local preview only: proxies API calls through the Next dev server so
  // the browser sees them as same-origin (no CORS) and can talk to the
  // already-live production API without touching its CORS config or
  // Discord's OAuth redirect settings. Set LOCAL_PREVIEW_API in .env to
  // point at the real API; unused in the deployed build.
  // These pages are tabs of the Economy Hub now; old links land on the right tab.
  async redirects() {
    const tab = (from, t) => ({ source: `/dashboard/:guildId/${from}`, destination: `/dashboard/:guildId/economy-hub?tab=${t}`, permanent: false });
    return [
      tab("leveling", "levels"),
      tab("level-roles", "roles"),
      tab("prestige", "boosts"),
      tab("voice-activity", "boosts"),
      tab("achievements", "achievements"),
      tab("profile-cards", "profile"),
      tab("economy", "coins"),
      tab("economy/settings", "coins"),
      tab("economy/earning", "coins"),
      tab("economy/leaderboard", "stats"),
      tab("economy/analytics", "stats"),
    ];
  },
  async rewrites() {
    if (!process.env.LOCAL_PREVIEW_API) return [];
    return [{ source: "/api-proxy/:path*", destination: `${process.env.LOCAL_PREVIEW_API}/:path*` }];
  },
};

module.exports = nextConfig;
