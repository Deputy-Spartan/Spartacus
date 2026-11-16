// Stream Growth's rules that don't need Discord or the database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_RANKS, KICK_LOGIN, cleanKickLogin, findClipLinks, nextTimeAt, splitTeams, utcWeek } from "../packages/shared";
import { existsSync } from "node:fs";
import { join } from "node:path";

test("teams are even and nobody is lost or doubled", () => {
  const players = Array.from({ length: 11 }, (_, i) => `p${i}`);
  const teams = splitTeams(players, 5);
  assert.equal(teams.length, 2);
  assert.deepEqual(teams.flat().sort(), [...players].sort());
  const sizes = teams.map((t) => t.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  assert.equal(splitTeams(["a", "b", "c", "d"], 2).length, 2);
  assert.equal(splitTeams(["a"], 5).length, 1);
});

test("clip links from Kick and Twitch are found once each", () => {
  const found = findClipLinks(
    "lol https://kick.com/deputyspartan/clips/clip_01JABC and https://kick.com/deputyspartan?clip=clip_01JABC plus https://clips.twitch.tv/FunnyClipSlug-abc and https://www.twitch.tv/someone/clip/OtherSlug",
  );
  assert.deepEqual(
    found.map((c) => `${c.platform}:${c.clipId}`),
    ["kick:clip_01JABC", "twitch:FunnyClipSlug-abc", "twitch:OtherSlug"],
  );
  assert.equal(found[0].streamer, "deputyspartan");
  assert.equal(findClipLinks("https://kick.com/deputyspartan").length, 0);
});

test("a game night time lands on the right day in the server's zone", () => {
  // Friday 13 Nov 2026, 15:00 in New York (20:00 UTC).
  const from = new Date("2026-11-13T20:00:00Z");
  // 8pm today, still ahead.
  assert.equal(nextTimeAt("America/New_York", 20 * 60, null, from).toISOString(), "2026-11-14T01:00:00.000Z");
  // 2pm already passed today, so tomorrow.
  assert.equal(nextTimeAt("America/New_York", 14 * 60, null, from).toISOString(), "2026-11-14T19:00:00.000Z");
  // Monday 8pm.
  assert.equal(nextTimeAt("America/New_York", 20 * 60, 1, from).toISOString(), "2026-11-17T01:00:00.000Z");
});

test("weeks start on Monday", () => {
  assert.equal(utcWeek(new Date("2026-11-16T10:00:00Z")), "2026-11-16");
  assert.equal(utcWeek(new Date("2026-11-22T23:00:00Z")), "2026-11-16");
});

test("Kick names are cleaned and checked", () => {
  assert.equal(cleanKickLogin("https://kick.com/Deputy_Spartan/"), "deputy_spartan");
  assert.ok(KICK_LOGIN.test("deputy-spartan"));
  assert.ok(!KICK_LOGIN.test("no spaces"));
});

test("every chat rank has its badge image and ranks go up", () => {
  for (const r of CHAT_RANKS) assert.ok(existsSync(join(__dirname, "../apps/bot/assets/ranks", r.file)), r.file);
  const levels = CHAT_RANKS.map((r) => r.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
});

test("stored logins can only be read back with the key", async () => {
  process.env.NEXTAUTH_SECRET = "test-secret";
  const { seal, unseal } = await import("../apps/bot/src/modules/stream/accounts");
  const sealed = seal("token-123");
  assert.ok(!sealed.includes("token-123"));
  assert.equal(unseal(sealed), "token-123");
  process.env.NEXTAUTH_SECRET = "other";
  assert.throws(() => unseal(sealed));
});
