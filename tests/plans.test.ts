import { test } from "node:test";
import assert from "node:assert/strict";
import { MODULE_KEYS, MODULE_TIER, NAV_MODULE_KEYS, NAV_SECTIONS, PAGE_TIER, PRODUCT_TIERS, SD_ACTION_TIER, SINGLE_ITEMS, TIER_INFO, covers, featureForPath, moduleFeature, tierForPath, tiersForProducts, unlocksForProducts } from "../packages/shared";
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

test("single features: one item unlocks only itself, a plan covers all of them", () => {
  assert.deepEqual(unlocksForProducts(["money-counter"]), ["o:money"]);
  assert.ok(covers(["o:money"], "o:money", "kit"));
  assert.ok(!covers(["o:money"], "o:kd", "kit"));
  assert.ok(covers(["o:money"], "o:*", "kit"), "owning one overlay opens the Overlays page");
  assert.ok(covers(["kit"], "o:kd", "kit"));
  assert.ok(!covers(["kit"], "m:ANTI_RAID", "pro"));
  assert.equal(moduleFeature("LEVELING"), "m:ECONOMY", "the Economy Hub's tabs come with it");
  assert.deepEqual(featureForPath("/overlays/wheel", (h) => NAV_MODULE_KEYS[h]), { feature: "t:wheel", tier: "kit" });
  assert.deepEqual(featureForPath("/anti-raid", (h) => NAV_MODULE_KEYS[h]), { feature: "m:ANTI_RAID", tier: "pro" });
});

test("every single item is unique and matches a paid feature", () => {
  const ids = SINGLE_ITEMS.map((s) => s.product);
  assert.equal(new Set(ids).size, ids.length, "two singles share a product id");
  for (const s of SINGLE_ITEMS) {
    assert.ok(!PRODUCT_TIERS[s.product], `${s.product} is also a plan`);
    if (s.feature.startsWith("m:")) assert.equal(MODULE_TIER[s.feature.slice(2) as keyof typeof MODULE_TIER], s.tier, `${s.product} tier`);
  }
  // Every paid module (except the Economy Hub's tabs) can be bought on its own.
  for (const key of Object.keys(MODULE_TIER)) {
    const f = moduleFeature(key as keyof typeof MODULE_TIER);
    assert.ok(SINGLE_ITEMS.some((s) => s.feature === f), `${key} has no single item`);
  }
});

test("every Stream Deck key with a plan is a real plugin action", () => {
  const manifest = JSON.parse(readFileSync("tools/streamdeck-plugin/com.spartacus.streamdeck.sdPlugin/manifest.json", "utf8")) as { Actions: Array<{ UUID: string }> };
  const ids = new Set(manifest.Actions.map((a) => a.UUID.replace("com.spartacus.streamdeck.", "")));
  for (const id of Object.keys(SD_ACTION_TIER)) assert.ok(ids.has(id), `${id} is not a plugin action`);
});
