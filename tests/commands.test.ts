// Loads every slash command the way the bot does and checks each one against
// Discord's rules, so a bad name or a repeat is caught here instead of when
// Discord rejects the whole command list on deploy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODULE_KEYS } from "../packages/shared";
import { commands } from "../apps/bot/src/commands";

const list = [...commands.values()];
const json = list.map((c) => c.data.toJSON() as { name: string; description: string; options?: Array<{ name: string; description: string }> });

test("the commands load", () => {
  assert.ok(list.length >= 30, `only ${list.length} commands loaded`);
  assert.ok(list.length <= 100, "Discord allows 100 slash commands");
});

test("command names are unique and valid", () => {
  const names = json.map((c) => c.name);
  assert.deepEqual(names, [...new Set(names)], "two commands share a name");
  for (const c of json) {
    assert.match(c.name, /^[a-z0-9_-]{1,32}$/, c.name);
    assert.ok(c.description.length >= 1 && c.description.length <= 100, `/${c.name} description is ${c.description.length} characters`);
    for (const o of c.options ?? []) {
      assert.match(o.name, /^[a-z0-9_-]{1,32}$/, `/${c.name} ${o.name}`);
      assert.ok(o.description.length >= 1 && o.description.length <= 100, `/${c.name} ${o.name} description is ${o.description.length} characters`);
    }
  }
});

test("each command belongs to a real module", () => {
  for (const c of list) if (c.moduleKey) assert.ok((MODULE_KEYS as readonly string[]).includes(c.moduleKey), `/${c.data.name}: ${c.moduleKey}`);
});

test("every command can run", () => {
  for (const c of list) assert.equal(typeof c.execute, "function", `/${c.data.name} has no execute`);
});
