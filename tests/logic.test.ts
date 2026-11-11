// Small pieces of logic that are easy to get subtly wrong: reading a time or
// a day someone typed, working out when a weekly stream next starts in the
// server's time zone, and the "look for work" rule the posting jobs use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTwitchLogin, formatTimeOfDay, isValidTimezone, LINK_CODE_PATTERN, makeLinkCode, nextSlotStart, parseDay, parseTimeOfDay } from "../packages/shared";
import { markChange } from "@spartacus/db";
import { shouldLook } from "../apps/bot/src/lib/quietPoll";

test("times people type are read correctly", () => {
  assert.equal(parseTimeOfDay("7pm"), 19 * 60);
  assert.equal(parseTimeOfDay("19:30"), 19 * 60 + 30);
  assert.equal(parseTimeOfDay("12am"), 0);
  assert.equal(parseTimeOfDay("12pm"), 12 * 60);
  assert.equal(parseTimeOfDay("25:00"), null);
  assert.equal(parseTimeOfDay("soon"), null);
});

test("a time reads back the way it was meant", () => {
  for (const minutes of [0, 59, 12 * 60, 19 * 60 + 30, 23 * 60 + 59]) assert.equal(parseTimeOfDay(formatTimeOfDay(minutes)), minutes, formatTimeOfDay(minutes));
});

test("days people type are read correctly", () => {
  assert.equal(parseDay("Sunday"), 0);
  assert.equal(parseDay("friday"), 5);
  assert.equal(parseDay("fri"), 5);
  assert.equal(parseDay("someday"), null);
});

test("time zones are checked", () => {
  assert.equal(isValidTimezone("America/New_York"), true);
  assert.equal(isValidTimezone("UTC"), true);
  assert.equal(isValidTimezone("Mars/Olympus"), false);
});

test("the next start of a weekly stream is right in the server's time zone", () => {
  // Wednesday 11 Nov 2026, 15:00 UTC (10am in New York, on winter time).
  const from = new Date("2026-11-11T15:00:00Z");
  // Wednesday 7pm New York is midnight UTC the next day.
  assert.equal(nextSlotStart("America/New_York", 3, 19 * 60, from).toISOString(), "2026-11-12T00:00:00.000Z");
  // A time already past today rolls to next week.
  assert.equal(nextSlotStart("America/New_York", 3, 9 * 60, from).toISOString(), "2026-11-18T14:00:00.000Z");
  // Summer time: Wednesday 7pm New York is 23:00 UTC.
  assert.equal(nextSlotStart("America/New_York", 3, 19 * 60, new Date("2026-07-01T12:00:00Z")).toISOString(), "2026-07-01T23:00:00.000Z");
  assert.equal(nextSlotStart("UTC", 5, 20 * 60, from).toISOString(), "2026-11-13T20:00:00.000Z");
});

test("Twitch names and link codes", () => {
  assert.equal(cleanTwitchLogin("https://twitch.tv/Spartan_Gaming"), "spartan_gaming");
  assert.equal(cleanTwitchLogin("@SomeOne"), "someone");
  for (let i = 0; i < 20; i++) assert.match(makeLinkCode(), LINK_CODE_PATTERN);
});

test("posting jobs look often after a change and rarely when nothing has changed", (t) => {
  // Ten minutes after start-up with nothing saved since.
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 10 * 60_000 });
  assert.equal(shouldLook("test-job"), true, "the first look always happens");
  assert.equal(shouldLook("test-job"), false, "nothing changed, so the next turn is skipped");
  t.mock.timers.tick(5_000);
  assert.equal(shouldLook("test-job"), false);
  t.mock.timers.tick(15_000);
  assert.equal(shouldLook("test-job"), true, "it still looks every 20 seconds");
  assert.equal(shouldLook("test-job"), false);
  markChange();
  assert.equal(shouldLook("test-job"), true, "a save makes it look straight away");
  t.mock.timers.tick(5_000);
  assert.equal(shouldLook("test-job"), true, "and on every turn for the next minute");
  t.mock.timers.tick(61_000);
  assert.equal(shouldLook("test-job"), true);
  assert.equal(shouldLook("test-job"), false, "then it goes quiet again");
});
