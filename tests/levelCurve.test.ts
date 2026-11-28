// The XP curve: level 1 costs 500 XP, each level after costs 150 more.
import { test } from "node:test";
import assert from "node:assert/strict";
import { levelForXp, xpForLevel } from "../packages/shared";

test("xp curve: totals for the ranks", () => {
  assert.equal(xpForLevel(0), 0);
  assert.equal(xpForLevel(1), 500);
  assert.equal(xpForLevel(2), 1150);
  assert.equal(xpForLevel(10), 11_750);
  assert.equal(xpForLevel(25), 57_500);
  assert.equal(xpForLevel(50), 208_750);
});

test("xp curve: level from XP matches the totals exactly", () => {
  assert.equal(levelForXp(-5), 0);
  assert.equal(levelForXp(0), 0);
  assert.equal(levelForXp(499), 0);
  for (let L = 1; L <= 300; L++) {
    assert.equal(levelForXp(xpForLevel(L)), L, `at ${L}`);
    assert.equal(levelForXp(xpForLevel(L) - 1), L - 1, `just under ${L}`);
  }
});
