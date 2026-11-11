# Spartacus Stream Deck plugin

Controls Spartacus from an Elgato Stream Deck or Stream Deck +. The dashboard's
Owner Only → Stream Deck page has the setup steps and makes connection keys.

- `src/actions.ts`: every key and dial, its icon, settings and tip.
- `src/plugin.ts`: the plugin (Elgato's `@elgato/streamdeck` SDK).
- `src/settings.html`: the settings panel (Elgato's sdpi-components).
- `build.mjs`: `npm run build` makes `com.spartacus.streamdeck.sdPlugin/`;
  `npm run pack` also writes `apps/web/public/downloads/Spartacus.streamDeckPlugin`
  for the dashboard's download button.

It lives outside the npm workspaces on purpose, so it never affects the bot or
dashboard deploys. After changing it: `npm install`, `npm run pack`, commit.
Check it with `npx @elgato/cli validate com.spartacus.streamdeck.sdPlugin`.
