// Streaming › Overlays: the Spin wheel and AFK popups rules (no database).
import { test } from "node:test";
import assert from "node:assert/strict";
import { AFK_DEFAULTS, applyToolAction, cleanAfkList, cleanToolRow, cleanToolSettings, cleanWheelExtra, TOOLS, wheelItemsOf, wheelSlicesOf } from "../packages/shared";

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
  assert.equal(s.hubText, "SPARTA");
  assert.equal(cleanToolSettings("wheel", { hubText: "TOOLONGTEXT" }).hubText, "TOOLON");
  assert.equal(s.pegColor, TOOLS.wheel.settings.pegColor);
  assert.equal(s.spinCmd, "spinnow");
  // Every starting look only sets real settings with allowed values.
  for (const [name, p] of Object.entries(TOOLS.wheel.presets ?? {})) {
    const clean = cleanToolSettings("wheel", { ...TOOLS.wheel.settings, ...p });
    for (const [k, v] of Object.entries(p)) assert.equal(clean[k], v, `${name}.${k}`);
  }
});

test("spin wheel: odds, taking winners off and putting them back", () => {
  const extra = cleanWheelExtra([{ w: 5, msg: "  Do it  ", c: "#FFC641" }, { w: 99 }, { w: -3, tc: "red" }]);
  assert.deepEqual(extra[0], { c: "#ffc641", tc: "", w: 5, msg: "Do it" });
  assert.equal(extra[1].w, 5);
  assert.equal(extra[2].w, 1);
  assert.equal(extra[2].tc, "");
  assert.equal(extra.length, 16);

  const s = cleanToolSettings("wheel", { s1: "A", s2: "B", s3: "C", s4: "", s5: "", s6: "", odds: true, remove: true, extra: JSON.stringify([{ w: 5, msg: "yay" }, { w: 1 }, { w: 1 }]) });
  assert.deepEqual(wheelItemsOf(s).map((x) => x.t), ["A", "B", "C"]);
  // A 5× slice wins far more often.
  let a = 0;
  for (let i = 0; i < 400; i++) {
    const r = applyToolAction("wheel", cleanToolRow("wheel", { settings: s }), { op: "spin" }, 1_000_000);
    if (!("error" in r) && r.state.last === "A") a++;
  }
  assert.ok(a > 230 && a < 330, `A won ${a} of 400`);

  // Taking winners off: each spin removes the slice that won.
  let row = cleanToolRow("wheel", { settings: s });
  const r1 = applyToolAction("wheel", row, { op: "spin" }, 100_000);
  assert.ok(!("error" in r1));
  row = r1 as typeof row;
  assert.equal((row.state.out as number[]).length, 1);
  const ev = row.events[row.events.length - 1];
  assert.deepEqual(ev.data.out, []);
  assert.equal(wheelItemsOf(s, row.state.out as number[]).length, 2);
  const r2 = applyToolAction("wheel", row, { op: "spin" }, 200_000);
  row = r2 as typeof row;
  assert.deepEqual(applyToolAction("wheel", row, { op: "spin" }, 300_000), { error: "Only one slice is left. Press Put slices back." });
  const back = applyToolAction("wheel", row, { op: "putback" }, 300_000) as typeof row;
  assert.deepEqual(back.state.out, []);
  assert.deepEqual(applyToolAction("wheel", back, { op: "putback" }, 300_000), { error: "Every slice is already on the wheel." });
});

test("spin wheel: center links, old text color switch, new picks", () => {
  assert.equal(cleanToolSettings("wheel", { hubMedia: "javascript:alert(1)" }).hubMedia, "");
  assert.equal(cleanToolSettings("wheel", { hubMedia: "http://x.com/a.png" }).hubMedia, "");
  assert.equal(cleanToolSettings("wheel", { hubMedia: "https://api.example.com/public/tool-media/1/wheel/abc" }).hubMedia, "https://api.example.com/public/tool-media/1/wheel/abc");
  assert.equal(cleanToolSettings("wheel", { autoText: false }).textMode, "one");
  assert.equal(cleanToolSettings("wheel", { autoText: false, textMode: "slice" }).textMode, "slice");
  const s = cleanToolSettings("wheel", { pegSize: 99, pegStyle: "spiky", enter: "teleport", textMove: -999, place: "left" });
  assert.equal(s.pegSize, 30);
  assert.equal(s.pegStyle, "stud");
  assert.equal(s.enter, "zoom");
  assert.equal(s.textMove, -150);
  assert.equal(s.place, "left");
});

test("color picks take your own hex code too", () => {
  let checked = 0;
  for (const [kind, info] of Object.entries(TOOLS)) {
    for (const [k, g] of Object.entries(info.groups)) {
      if (!g.swatch) continue;
      const k2 = kind as keyof typeof TOOLS;
      assert.equal(cleanToolSettings(k2, { [k]: "#FFC641" })[k], "#ffc641", `${kind}.${k}`);
      assert.equal(cleanToolSettings(k2, { [k]: "red" })[k], info.settings[k], `${kind}.${k} bad`);
      checked++;
    }
  }
  assert.ok(checked > 0);
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
