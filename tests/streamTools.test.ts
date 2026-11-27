// Streaming › Overlays: the Spin wheel and AFK popups rules (no database).
import { test } from "node:test";
import assert from "node:assert/strict";
import { AFK_DEFAULTS, applyToolAction, cleanAfkList, cleanToolRow, cleanToolSettings, TOOLS, wheelSlicesOf } from "../packages/shared";

test("spin wheel: up to 16 slices, one spin at a time", () => {
  const s = cleanToolSettings("wheel", { s1: "A", s2: "B", s9: "I", s16: "P", s17: "nope", spinTime: 5 });
  assert.deepEqual(wheelSlicesOf(s).filter((x) => ["A", "B", "I", "P"].includes(x)), ["A", "B", "I", "P"]);
  assert.ok(!wheelSlicesOf(s).includes("nope"));
  let row = cleanToolRow("wheel", { settings: s });
  const first = applyToolAction("wheel", row, { op: "spin" }, 10_000);
  assert.ok(!("error" in first));
  row = first as typeof row;
  assert.ok(wheelSlicesOf(s).includes(String(row.state.last)));
  assert.deepEqual(applyToolAction("wheel", row, { op: "spin" }, 12_000), { error: "It's still spinning." });
  assert.ok(!("error" in applyToolAction("wheel", row, { op: "spin" }, 16_000)), "free again after the spin time");
});

test("spin wheel: colors, sizes and picks are kept to what's allowed", () => {
  const s = cleanToolSettings("wheel", { colors: "#ff0000, red ,#00ff00,javascript:", rimWidth: 999, pointerSide: "under", hubText: "SPARTA", pegColor: "blue", spinCmd: "!Spin Now" });
  assert.equal(s.colors, "#ff0000,#00ff00");
  assert.equal(s.rimWidth, 60);
  assert.equal(s.pointerSide, "top");
  assert.equal(s.hubText, "SPA");
  assert.equal(s.pegColor, TOOLS.wheel.settings.pegColor);
  assert.equal(s.spinCmd, "spinnow");
  // Every starting look only sets real settings with allowed values.
  for (const [name, p] of Object.entries(TOOLS.wheel.presets ?? {})) {
    const clean = cleanToolSettings("wheel", { ...TOOLS.wheel.settings, ...p });
    for (const [k, v] of Object.entries(p)) assert.equal(clean[k], v, `${name}.${k}`);
  }
});

test("afk popups: start, a set number of minutes, and back", () => {
  let row = cleanToolRow("afk", null);
  assert.equal(cleanAfkList(row.settings.list).length, AFK_DEFAULTS.length);
  assert.deepEqual(applyToolAction("afk", row, { op: "back" }, 1000), { error: "Nothing is up right now." });
  const started = applyToolAction("afk", row, { op: "start", cmd: "!Coffee", min: 8 }, 1000);
  assert.ok(!("error" in started));
  row = started as typeof row;
  assert.equal((row.state.cur as { t: string }).t, "Coffee run");
  assert.equal(row.state.len, 8 * 60_000);
  assert.equal(row.state.t0, 1000);
  const back = applyToolAction("afk", row, { op: "back" }, 1000 + 192_000);
  assert.ok(!("error" in back));
  const b = back as typeof row;
  assert.equal(b.state.cur, null);
  assert.equal(b.events[b.events.length - 1].data.gone, 192_000);
  assert.deepEqual(applyToolAction("afk", row, { op: "start", cmd: "nap" }), { error: "No AFK command like that." });
});

test("afk popups: the list is tidied (names, duplicates, minutes, colors)", () => {
  const list = cleanAfkList([
    { cmd: "!Smoke Break", ico: "🚬", t: "Break", s: "", min: 500, c: "orange" },
    { cmd: "smokebreak", t: "dupe" },
    { cmd: "", t: "no name" },
  ]);
  assert.deepEqual(list, [{ cmd: "smokebreak", ico: "🚬", t: "Break", s: "", min: 120, c: "#d4a24c" }]);
  assert.equal(cleanAfkList("not json").length, AFK_DEFAULTS.length);
  const s = cleanToolSettings("afk", { list: JSON.stringify(list), backCmd: "!Home", bgOpacity: -5 });
  assert.equal(cleanAfkList(s.list)[0].cmd, "smokebreak");
  assert.equal(s.backCmd, "home");
  assert.equal(s.bgOpacity, 0);
});
