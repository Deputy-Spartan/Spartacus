// The owner's menu layout (Edit Mode): saved order, keys the API accepts,
// and nothing lost when a page is added after the layout was saved.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NAV_SECTIONS } from "../packages/shared";
import { applyOrder, groupSlug, NAV_KEYS, parseList } from "../apps/web/lib/navLayoutCore";

const KEY = /^[a-z0-9._-]{1,120}$/i; // same rule as apps/api/src/routes/dashboardTexts.ts

test("saved order comes first, new items keep coming after", () => {
  const out = applyOrder(["a", "b", "c", "d"], (x) => x, ["c", "a"]);
  assert.deepEqual(out, ["c", "a", "b", "d"]);
});

test("no saved order leaves the built-in order", () => {
  assert.deepEqual(applyOrder(["a", "b"], (x) => x, []), ["a", "b"]);
});

test("a saved id that no longer exists is ignored", () => {
  assert.deepEqual(applyOrder(["a", "b"], (x) => x, ["gone", "b"]), ["b", "a"]);
});

test("bad saved data reads as empty", () => {
  assert.deepEqual(parseList("not json"), []);
  assert.deepEqual(parseList('{"a":1}'), []);
  assert.deepEqual(parseList('["x", 2, "y"]'), ["x", "y"]);
});

test("every group and page gets a key the API will save", () => {
  const slugs = new Set<string>();
  for (const s of NAV_SECTIONS) {
    if (!s.section) continue;
    const slug = groupSlug(s.section);
    assert.ok(!slugs.has(slug), `two groups share the key ${slug}`);
    slugs.add(slug);
    for (const k of [NAV_KEYS.pageOrder(s.section), NAV_KEYS.groupLabel(s.section)]) assert.match(k, KEY);
    for (const i of s.items) assert.match(NAV_KEYS.pageLabel(i.href), KEY);
  }
  assert.match(NAV_KEYS.groupOrder, KEY);
  assert.match(NAV_KEYS.hidden, KEY);
});
