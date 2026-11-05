// Builds the Spartacus Stream Deck plugin.
//   node build.mjs         bundles src/ into com.spartacus.streamdeck.sdPlugin/
//   node build.mjs --pack  also packs it as Spartacus.streamDeckPlugin for the
//                          dashboard's download button (apps/web/public/downloads)
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync, copyFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const plugin = join(here, "com.spartacus.streamdeck.sdPlugin");
const require = createRequire(import.meta.url);
const { KEYS, DIALS, PLUGIN_UUID } = await import("./dist-actions.mjs").catch(async () => {
  // actions.ts is TypeScript; compile it once for the manifest.
  await build({ entryPoints: [join(here, "src/actions.ts")], outfile: join(here, "dist-actions.mjs"), format: "esm", platform: "node", bundle: true, logLevel: "silent" });
  return import("./dist-actions.mjs");
});

// 1. The plugin code.
await build({
  entryPoints: [join(here, "src/plugin.ts")],
  outfile: join(plugin, "bin/plugin.js"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  logLevel: "info",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

// 2. The manifest, made from the action list so the two can't drift apart.
const action = (a, dial) => ({
  UUID: `${PLUGIN_UUID}.${a.id}`,
  Name: a.name,
  Icon: `imgs/actions/${a.id}`,
  Tooltip: a.tip,
  PropertyInspectorPath: "ui/settings.html",
  Controllers: [dial ? "Encoder" : "Keypad"],
  States: [{ Image: `imgs/actions/${a.id}`, TitleAlignment: "middle", FontSize: 11, ShowTitle: true }],
  ...(dial
    ? {
        Encoder: {
          layout: "$B1",
          Icon: `imgs/actions/${a.id}`,
          TriggerDescription: { Rotate: a.dial.rotate, Push: a.dial.push, ...(a.dial.touch ? { Touch: a.dial.touch } : {}) },
        },
      }
    : {}),
  UserTitleEnabled: false,
});
const manifest = {
  $schema: "https://schemas.elgato.com/streamdeck/plugins/manifest.json",
  UUID: PLUGIN_UUID,
  Name: "Spartacus",
  Version: "1.0.0.0",
  Author: "Spartacus",
  Description: "Control your Spartacus Discord bot: lockdowns, going live, squads, timers and live counts.",
  Category: "Spartacus",
  CategoryIcon: "imgs/plugin/category",
  Icon: "imgs/plugin/icon",
  URL: "https://spartc.us",
  CodePath: "bin/plugin.js",
  SDKVersion: 2,
  Software: { MinimumVersion: "7.1" },
  OS: [
    { Platform: "windows", MinimumVersion: "10" },
    { Platform: "mac", MinimumVersion: "12" },
  ],
  Nodejs: { Version: "20", Debug: "enabled" },
  Actions: [...KEYS.map((a) => action(a, false)), ...DIALS.map((a) => action(a, true))],
};
writeFileSync(join(plugin, "manifest.json"), JSON.stringify(manifest, null, 2));

// The settings panel, with each action's fields and tip filled in.
mkdirSync(join(plugin, "ui"), { recursive: true });
const all = [...KEYS, ...DIALS];
const html = readFileSync(join(here, "src/settings.html"), "utf8")
  .replace("__FIELDS__", JSON.stringify(Object.fromEntries(all.map((x) => [x.id, x.fields]))))
  .replace("__TIPS__", JSON.stringify(Object.fromEntries(all.map((x) => [x.id, x.tip]))));
writeFileSync(join(plugin, "ui/settings.html"), html);
// The plugin code is an ES module.
writeFileSync(join(plugin, "bin/package.json"), JSON.stringify({ type: "module" }));

// 3. Icons, all made from the bot's real logo (its Discord avatar), so the
//    plugin looks like Spartacus everywhere. Each action is the logo inside a
//    ring of the action's color, so they're still easy to tell apart. (Text and
//    emoji go in the key's title, which Stream Deck draws itself.)
//    logo.png is refreshed from the live bot each build, and the saved copy
//    is used when offline.
const COLORS = { raid: "#ef4444", safe: "#22c55e", golive: "#f43f5e", liveind: "#ef4444", post: "#9146ff", bump: "#f59e0b", lock: "#64748b", slow: "#0ea5e9", module: "#6366f1", role: "#a855f7", squadlock: "#38bdf8", mute: "#94a3b8", pull: "#14b8a6", newsquad: "#22c55e", online: "#3b82f6", tickets: "#eab308", claim: "#f97316", apps: "#10b981", giveaway: "#facc15", purge: "#f87171", poll: "#5865f2", say: "#7b99bc", shout: "#9146ff", event: "#06b6d4", sticky: "#f472b6", status: "#22c55e", botstat: "#10b981" };
const sharp = (await import("sharp")).default;
const logoFile = join(here, "logo.png");
try {
  const res = await fetch("https://api.spartc.us/bot-avatar");
  if (res.ok) writeFileSync(logoFile, Buffer.from(await res.arrayBuffer()));
} catch {
  // offline: keep the saved logo
}
if (!existsSync(logoFile)) throw new Error("logo.png is missing and the bot avatar couldn't be downloaded.");
const logo = readFileSync(logoFile);
const roundLogo = (size) =>
  sharp(logo)
    .resize(size, size)
    .composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`), blend: "dest-in" }])
    .png()
    .toBuffer();
const actionTile = async (color, size) => {
  const ring = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 72 72"><rect width="72" height="72" rx="14" fill="#16181d"/><rect x="3" y="3" width="66" height="66" rx="12" fill="none" stroke="${color}" stroke-width="4"/></svg>`;
  const inner = Math.round(size * 0.72);
  return sharp(Buffer.from(ring))
    .composite([{ input: await roundLogo(inner), top: Math.round((size - inner) / 2), left: Math.round((size - inner) / 2) }])
    .png()
    .toBuffer();
};
rmSync(join(plugin, "imgs"), { recursive: true, force: true });
mkdirSync(join(plugin, "imgs/actions"), { recursive: true });
mkdirSync(join(plugin, "imgs/plugin"), { recursive: true });
for (const a of [...KEYS, ...DIALS]) {
  const color = COLORS[a.id] ?? "#7b99bc";
  writeFileSync(join(plugin, `imgs/actions/${a.id}.png`), await actionTile(color, 72));
  writeFileSync(join(plugin, `imgs/actions/${a.id}@2x.png`), await actionTile(color, 144));
}
writeFileSync(join(plugin, "imgs/plugin/icon.png"), await roundLogo(256));
writeFileSync(join(plugin, "imgs/plugin/icon@2x.png"), await roundLogo(512));
writeFileSync(join(plugin, "imgs/plugin/category.png"), await roundLogo(28));
writeFileSync(join(plugin, "imgs/plugin/category@2x.png"), await roundLogo(56));

// 4. Pack it: a .streamDeckPlugin is a zip with the .sdPlugin folder inside.
if (process.argv.includes("--pack")) {
  const out = join(here, "..", "..", "apps", "web", "public", "downloads");
  mkdirSync(out, { recursive: true });
  const zip = join(out, "Spartacus.streamDeckPlugin");
  if (existsSync(zip)) rmSync(zip);
  const tmp = join(here, "Spartacus.zip");
  if (existsSync(tmp)) rmSync(tmp);
  if (process.platform === "win32") {
    execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${plugin}' -DestinationPath '${tmp}' -Force`], { stdio: "inherit" });
  } else {
    execFileSync("zip", ["-r", tmp, "com.spartacus.streamdeck.sdPlugin"], { cwd: here, stdio: "inherit" });
  }
  copyFileSync(tmp, zip);
  rmSync(tmp);
  console.log("Packed:", zip);
}
rmSync(join(here, "dist-actions.mjs"), { force: true });
