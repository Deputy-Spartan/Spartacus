import { test } from "node:test";
import assert from "node:assert/strict";
import { MODULE_KEYS, MODULE_TIER, NAV_MODULE_KEYS, NAV_SECTIONS, PAGE_TIER, PRODUCT_TIERS, SD_ACTION_TIER, TIER_INFO, tierForPath, tiersForProducts } from "../packages/shared";
import { readFileSync } from "node:fs";

const hrefs = new Set(NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)));

test("every paid module is a real module", () => {
  for (const key of Object.keys(MODULE_TIER)) assert.ok((MODULE_KEYS as readonly string[]).includes(key), `${key} is not a module`);
});

test("every paid page is in the menu", () => {
  for (const href of Object.keys(PAGE_TIER)) assert.ok(hrefs.has(href), `${href} is not a dashboard page`);
});

test("pages pick up their module's plan", () => {
  assert.equal(tierForPath("/anti-raid", (h) => NAV_MODULE_KEYS[h]), "pro");
  assert.equal(tierForPath("/overlays/kd", (h) => NAV_MODULE_KEYS[h]), "kit");
  assert.equal(tierForPath("/stream-deck", (h) => NAV_MODULE_KEYS[h]), "deck");
  assert.equal(tierForPath("/moderation", (h) => NAV_MODULE_KEYS[h]), null);
  assert.equal(tierForPath("/stream-alerts", (h) => NAV_MODULE_KEYS[h]), null, "Going Live stays free");
});

test("All Access unlocks every plan and each plan has a store product", () => {
  assert.deepEqual(tiersForProducts(["all-access"]), ["pro", "kit", "deck"]);
  assert.deepEqual(tiersForProducts(["socials-lower-third"]), []);
  for (const t of Object.values(TIER_INFO)) assert.ok(PRODUCT_TIERS[t.product], `${t.product} unlocks nothing`);
});

test("every Stream Deck key with a plan is a real plugin action", () => {
  const manifest = JSON.parse(readFileSync("tools/streamdeck-plugin/com.spartacus.streamdeck.sdPlugin/manifest.json", "utf8")) as { Actions: Array<{ UUID: string }> };
  const ids = new Set(manifest.Actions.map((a) => a.UUID.replace("com.spartacus.streamdeck.", "")));
  for (const id of Object.keys(SD_ACTION_TIER)) assert.ok(ids.has(id), `${id} is not a plugin action`);
});
