// Streaming › Chat Commands rules that don't need Kick, Twitch or the database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyToolAction, chatRankFrom, cleanChatCommands, cleanChatCommandsState, cleanToolRow, findChatCommand, renderChatReply, STARTER_COMMANDS } from "../packages/shared";

const cfg = cleanChatCommands({});

test("chat commands: the starters load, and names are found by alias", () => {
  assert.equal(cfg.cmds.length, STARTER_COMMANDS.length);
  assert.equal(findChatCommand(cfg, "!DC")?.cmd.name, "discord");
  assert.deepEqual(findChatCommand(cfg, "!so @Nova hi")?.parts, ["@Nova", "hi"]);
  assert.equal(findChatCommand(cfg, "discord"), null, "needs the !");
  assert.equal(findChatCommand(cfg, "!nope"), null);
  const off = cleanChatCommands({ cmds: cfg.cmds.map((c) => (c.name === "discord" ? { ...c, on: false } : c)) });
  assert.equal(findChatCommand(off, "!discord"), null, "turned-off commands don't run");
});

test("chat commands: replies fill themselves in", () => {
  const base = { user: "Nova", target: "Kai", args: "Kai", platform: "kick", cmds: cfg.cmds, random: () => 0 };
  assert.equal(renderChatReply("{user} hugs {target}", base), "Nova hugs Kai");
  assert.equal(renderChatReply("Live for {uptime}.", { ...base, liveMs: 83 * 60000 }), "Live for 1h 23m.");
  assert.equal(renderChatReply("{uptime}", { ...base, liveMs: null }), "not live right now");
  assert.equal(renderChatReply("rolled {random:1-6}", base), "rolled 1");
  assert.equal(renderChatReply("{pick:yes|no}", base), "yes");
  assert.equal(renderChatReply("{solink}", base), "kick.com/kai");
  assert.equal(renderChatReply("{solink}", { ...base, platform: "twitch" }), "twitch.tv/kai");
  const death = cfg.cmds.find((c) => c.name === "death")!;
  assert.equal(renderChatReply("{get:death}", { ...base, counts: { [death.id]: 4 } }), "4");
  const listed = renderChatReply("{commands}", base).split(" ");
  assert.ok(listed.includes("!discord"));
  assert.ok(!listed.includes("!so"), "mod commands aren't listed");
  assert.equal(renderChatReply("{nothing}", base), "{nothing}");
});

test("chat commands: who someone is, from their badges", () => {
  assert.equal(chatRankFrom([]), 0);
  assert.equal(chatRankFrom(["subscriber"]), 1);
  assert.equal(chatRankFrom(["vip"]), 1);
  assert.equal(chatRankFrom(["subscriber", "moderator"]), 2);
  assert.equal(chatRankFrom(["broadcaster"]), 3);
});

test("chat commands: bad input is cleaned", () => {
  const c = cleanChatCommands({
    cmds: [
      { name: "!Hype Train!", reply: "x".repeat(900), who: 9, cd: -4, sound: "boom", soundUrl: "http://insecure/a.mp3", ov: "explode", app: "rm -rf" },
      { name: "hypetrain", reply: "dupe" },
      { name: "" },
      { name: "two", alias: ["hypetrain", "2"] },
    ],
    timers: [{ text: "hi", every: 0, chat: -1 }, { text: "" }],
    runKey: "short",
  });
  assert.equal(c.cmds.length, 2, "the empty and duplicate names are dropped");
  const [a, b] = c.cmds;
  assert.equal(a.name, "hypetrain");
  assert.equal(a.reply.length, 400);
  assert.deepEqual([a.who, a.cd, a.sound, a.soundUrl, a.ov, a.app], [3, 0, "none", "", "none", "none"]);
  assert.deepEqual(b.alias, ["2"], "an alias can't take another command's name");
  assert.deepEqual(c.timers.map((t) => [t.every, t.chat]), [[1, 0]]);
  assert.equal(c.runKey, "");
  const st = cleanChatCommandsState({ counts: { a: 3.7, b: -2, c: "x" }, quotes: ["", "ok", 4] });
  assert.deepEqual(st, { counts: { a: 3, b: 0 }, quotes: ["ok"] });
});

test("command alerts: a command going off is saved for OBS to play once", () => {
  const row = applyToolAction("cmdfx", cleanToolRow("cmdfx", null), { op: "fire", sound: "airhorn", popup: true, emoji: "🔥", text: "HYPE!", app: "lumia", appv: "hype", soundUrl: "javascript:alert(1)" }, 1000);
  assert.ok(!("error" in row));
  if ("error" in row) return;
  assert.equal(row.events.length, 1);
  assert.equal(row.events[0].type, "fire");
  assert.equal(row.events[0].data.appv, "hype");
  assert.equal(row.events[0].data.soundUrl, "", "only https sound links");
});
