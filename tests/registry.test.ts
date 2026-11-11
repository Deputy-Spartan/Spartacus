// Checks that the lists everything is built from still agree with each other:
// the sidebar groups, the module switches, the guides and the pages on disk.
// These are the mistakes that don't fail a build but leave a page unreachable,
// a module with no switch, or a test channel with no card.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  MODULE_KEYS,
  MODULE_KEY_TO_HREF,
  MODULE_LABELS,
  NAV_MODULE_KEYS,
  NAV_SECTIONS,
  OWNER_NAV_SECTION,
  PAGE_GUIDES,
  RETIRED_NAV_SECTIONS,
  TEST_GUIDES,
  UNLISTED_MODULES,
  navSectionForPath,
  slugifyModuleLabel,
} from "../packages/shared";

const ROOT = join(__dirname, "..");
const groups = NAV_SECTIONS.filter((s) => s.section);
const pages = groups.flatMap((s) => s.items);
const everyItem = [...NAV_SECTIONS, OWNER_NAV_SECTION].flatMap((s) => s.items);

test("every page is listed once", () => {
  const hrefs = everyItem.map((i) => i.href);
  assert.deepEqual(hrefs, [...new Set(hrefs)], "a page is in the sidebar twice");
  const labels = pages.map((i) => i.label);
  assert.deepEqual(labels, [...new Set(labels)], "two pages share a name");
});

test("every group has a name, an icon and a description of its own", () => {
  const names = groups.map((s) => s.section);
  assert.deepEqual(names, [...new Set(names)]);
  const icons = groups.map((s) => s.icon);
  assert.deepEqual(icons, [...new Set(icons)], "two groups share an icon");
  for (const s of groups) {
    assert.ok(s.icon, `${s.section} has no icon`);
    assert.ok(s.description, `${s.section} has no description`);
    assert.ok(s.items.length > 0, `${s.section} is empty`);
  }
});

test("a retired group name isn't in use", () => {
  for (const name of RETIRED_NAV_SECTIONS) assert.ok(!groups.some((s) => s.section === name), `${name} is both retired and current`);
});

test("every page's module is a real module", () => {
  for (const item of everyItem) if (item.moduleKey) assert.ok((MODULE_KEYS as readonly string[]).includes(item.moduleKey), `${item.label}: ${item.moduleKey}`);
});

test("every module has a name", () => {
  for (const key of MODULE_KEYS) assert.ok(MODULE_LABELS[key], `${key} has no label`);
});

test("every module can be switched on from somewhere", () => {
  const reachable = new Set<string>([...Object.values(NAV_MODULE_KEYS), ...UNLISTED_MODULES.map((m) => m.key), ...Object.keys(MODULE_KEY_TO_HREF)]);
  // Switched from inside another page, or not built into the dashboard yet.
  const elsewhere = new Set(["MODMAIL", "SCHEDULED_MESSAGES"]);
  const missing = MODULE_KEYS.filter((k) => !reachable.has(k) && !elsewhere.has(k));
  assert.deepEqual(missing, [], "modules with no page, no Modules-page switch and no hub tab");
});

test("every page in the sidebar exists", () => {
  for (const item of everyItem) {
    if (!item.href) continue;
    const file = join(ROOT, "apps/web/app/dashboard/[guildId]", item.href, "page.tsx");
    assert.ok(existsSync(file), `${item.label} points at ${item.href}, which has no page`);
  }
});

test("every page has a guide and a test card", () => {
  const noGuide = pages.filter((i) => !PAGE_GUIDES[i.href]).map((i) => i.href);
  const noTest = pages.filter((i) => !TEST_GUIDES[i.href]).map((i) => i.href);
  assert.deepEqual(noGuide, [], "pages with no guide");
  assert.deepEqual(noTest, [], "pages with no test card");
});

test("a page's path finds its group", () => {
  assert.equal(navSectionForPath("/cases")?.section, "Moderation");
  assert.equal(navSectionForPath("/tickets/123")?.section, "Support");
  assert.equal(navSectionForPath("/stream-extras")?.section, "Streaming");
  assert.equal(navSectionForPath("/economy-hub")?.section, "Levelling & Economy");
  assert.equal(navSectionForPath("/economy"), null, "/economy must not match /economy-hub");
  assert.equal(navSectionForPath(""), null);
  assert.equal(navSectionForPath("/modules"), null);
});

test("channel names made from page names are valid in Discord", () => {
  for (const item of pages) {
    const slug = slugifyModuleLabel(item.label);
    assert.match(slug, /^[a-z0-9-]{1,100}$/, `${item.label} -> ${slug}`);
  }
});
