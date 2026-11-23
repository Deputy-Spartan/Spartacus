// Streaming › Overlays rules that don't need Discord or the database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOverlayAction, cleanOverlay, cleanToolSettings, messageStep, messageText, type OverlayState } from "../packages/shared";

const msg = (patch: Record<string, unknown> = {}) => cleanOverlay("message", { msgs: ["NEED {n} TO JOIN", "DROP A FOLLOW", "TYPE !discord TO JOIN"], ...patch });
const act = (st: OverlayState, a: Record<string, unknown>, now = 1_000_000) => {
  const r = applyOverlayAction("message", st, a, now);
  assert.ok(!("error" in r), JSON.stringify(r));
  return r as OverlayState;
};

test("message box: next, last, +1, -1 and squad full", () => {
  let st = msg();
  assert.equal(messageText(st), "NEED 1 TO JOIN");
  st = act(st, { op: "next" });
  assert.equal(messageText(st), "DROP A FOLLOW");
  st = act(st, { op: "prev" });
  st = act(st, { op: "prev" });
  assert.equal(messageText(st), "TYPE !discord TO JOIN", "ALL CAPS keeps chat commands as typed");
  st = act(st, { op: "plus" });
  assert.equal(messageText(st), "NEED 2 TO JOIN", "+1 jumps back to the message with the number");
  st = act(st, { op: "minus" });
  st = act(st, { op: "minus" });
  assert.equal(messageText(st), "SQUAD FULL ✅");
  st = act(st, { op: "minus" });
  assert.equal(st.need, 0, "never below 0");
  st = act(st, { op: "say", text: "brb 5 min" });
  assert.equal(messageText(st), "BRB 5 MIN");
  st = act(st, { op: "clear" });
  assert.equal(messageText(st), "SQUAD FULL ✅");
});

test("message box: cycling moves on with the clock and stops where it got to", () => {
  const t0 = 1_700_000_000_000;
  let st = act(msg({ every: 10 }), { op: "cycle", on: true }, t0);
  assert.equal(messageStep(st, t0 + 9_999), 0);
  assert.equal(messageText(st, t0 + 10_000), "DROP A FOLLOW");
  assert.equal(messageText(st, t0 + 25_000), "TYPE !discord TO JOIN");
  assert.equal(messageText(st, t0 + 30_000), "NEED 1 TO JOIN", "wraps round to the first");
  st = act(st, { op: "cycle", on: false }, t0 + 25_000);
  assert.equal(messageText(st, t0 + 99_000), "TYPE !discord TO JOIN", "stopping keeps the one on stream");
  st = act(st, { op: "next" }, t0 + 99_000);
  assert.equal(messageText(st), "NEED 1 TO JOIN");
});

test("message box: bad input is refused or cleaned", () => {
  const st = msg({ msgs: ["  ", "A".repeat(80), 5, ...Array(20).fill("X")], every: 7, extra: "boom" });
  assert.equal((st.msgs as string[]).length, 10);
  assert.equal((st.msgs as string[])[0].length, 60);
  assert.equal(st.every, 10);
  assert.equal(st.extra, "pop");
  assert.ok("error" in applyOverlayAction("message", st, { op: "say", text: "  " }));
  assert.ok("error" in applyOverlayAction("message", st, { op: "go", to: 99 }));
  assert.ok("error" in applyOverlayAction("message", st, { op: "nope" }));
});

test("canvas size is kept, and kept within limits", () => {
  assert.deepEqual([cleanOverlay("game", {}).canvasW, cleanOverlay("game", {}).canvasH], [1400, 500]);
  const big = cleanOverlay("game", { canvasW: 99999, canvasH: 1 });
  assert.deepEqual([big.canvasW, big.canvasH], [3840, 100]);
  const tool = cleanToolSettings("chat", { canvasW: 1280, canvasH: 720 });
  assert.deepEqual([tool.canvasW, tool.canvasH], [1280, 720]);
  assert.deepEqual([cleanToolSettings("chat", {}).canvasW, cleanToolSettings("chat", {}).canvasH], [1920, 1080]);
});
