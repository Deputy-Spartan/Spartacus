// !setup-test-server works out what to create, move and delete before it
// touches anything. These run that planning against made-up servers: a fresh
// one, one that already matches, and one laid out the way the dashboard was
// grouped before (which must be moved over, not deleted and rebuilt).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ChannelType, Collection } from "discord.js";
import { slugifyModuleLabel } from "../packages/shared";
import { buildLayout, computePlan, normalizeCategoryName, type CategorySpec } from "../apps/bot/src/modules/owner/setupTestServer";

type Fake = { id: string; name: string; type: ChannelType; parentId: string | null };

function fakeGuild(categories: CategorySpec[]) {
  const cache = new Collection<string, Fake>();
  let n = 0;
  for (const category of categories) {
    const id = `cat${n++}`;
    cache.set(id, { id, name: category.name, type: ChannelType.GuildCategory, parentId: null });
    for (const ch of category.channels) {
      const cid = `ch${n++}`;
      cache.set(cid, { id: cid, name: ch.name, type: ch.type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText, parentId: id });
    }
  }
  return { channels: { cache } } as unknown as Parameters<typeof computePlan>[0];
}

const layout = buildLayout();

test("no two test channels share a name", () => {
  // Channels are matched by name, so a repeat would be treated as a duplicate and deleted.
  const names = layout.flatMap((c) => c.channels.map((ch) => ch.name.toLowerCase()));
  const repeats = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual(repeats, []);
});

test("categories are distinct and within Discord's limits", () => {
  const norms = layout.map((c) => normalizeCategoryName(c.name));
  assert.deepEqual(norms, [...new Set(norms)]);
  for (const c of layout) assert.ok(c.channels.length <= 50, `${c.name} has ${c.channels.length} channels (Discord allows 50)`);
  assert.ok(layout.length + layout.reduce((n, c) => n + c.channels.length, 0) <= 450, "too close to Discord's 500 channel limit");
});

test("an empty server gets everything created and nothing deleted", () => {
  const plan = computePlan(fakeGuild([]), layout);
  assert.equal(plan.categoriesToCreate.length, layout.length);
  assert.equal(plan.channelsToCreate.length, layout.reduce((n, c) => n + c.channels.length, 0));
  assert.equal(plan.staleChannelIds.length + plan.duplicateChannelIds.length + plan.duplicateCategoryIds.length + plan.channelsToReparent.length, 0);
});

test("a server that already matches needs nothing", () => {
  const plan = computePlan(fakeGuild(layout), layout);
  for (const [key, value] of Object.entries(plan)) assert.equal((value as unknown[]).length, 0, `${key} should be empty`);
});

// The grouping before the pages were regrouped, by page name.
const OLD: Record<string, string[]> = {
  Moderation: ["Moderator", "Cases & Warnings", "Player Reports", "Weekly Staff Report", "Warn Escalation", "Appeals"],
  Security: ["AI Moderation", "Anti-Raid", "Anti-Nuke", "Server Backup", "Verification", "Rules", "Honeypot", "Perm Watch"],
  Community: ["Welcome", "Reaction Roles", "Sticky Messages", "Starboard", "Temp Channels", "AI Chat", "Birthdays", "Member Milestones", "Anonymous", "Event Scheduler", "LFG"],
  Engagement: ["Embed Creator", "Announcements", "Quote of the Day", "Matchmaking", "Playing Now", "Giveaways", "Polls", "Going Live", "Stream Extras", "Custom Commands", "Weekly Recap", "Bump Reminder", "Suggestion Analytics", "Server Partnerships", "Counting Game"],
  "Levelling & Economy": ["Economy Hub"],
  Support: ["Tickets", "Applications", "Support DM"],
  Utility: ["Role Manager", "Channel Locks", "Slow Mode", "Server Stat Channels", "Status Channel", "Server Config Templates", "Growth Analytics"],
};
const OLD_EXTRA: Record<string, string[]> = { "Quote of the Day": ["question-of-the-day"], "Stream Extras": ["stream-clips"] };

function oldLayout(): CategorySpec[] {
  const typeOf = new Map(layout.flatMap((c) => c.channels.map((ch) => [ch.name, ch.type] as const)));
  const old = Object.entries(OLD).map(([name, labels]) => ({
    name,
    channels: labels.flatMap((label) => [slugifyModuleLabel(label), ...(OLD_EXTRA[label] ?? [])]).map((n) => ({ name: n, type: typeOf.get(n) ?? ("text" as const) })),
  }));
  // The commands and voice-testing categories were there before and haven't changed.
  return [...old, ...layout.slice(-2)];
}

test("a server set up under the old groups is moved over, with nothing lost", () => {
  const old = oldLayout();
  const before = old.reduce((n, c) => n + c.channels.length, 0);
  assert.equal(before, layout.reduce((n, c) => n + c.channels.length, 0), "the old and new layouts should hold the same channels");

  const plan = computePlan(fakeGuild(old), layout);
  assert.equal(plan.channelsToCreate.length, 0, "every channel already exists, so none should be made");
  assert.deepEqual(plan.staleChannelLabels, [], "no channel should be deleted");
  assert.deepEqual(plan.duplicateChannelLabels, [], "no channel should be deleted as a duplicate");
  assert.ok(plan.channelsToReparent.length > 20, "channels should move into their new groups");
  assert.deepEqual([...plan.duplicateCategoryLabels].sort(), ["Community", "Engagement", "Security", "Utility"], "the four old groups are removed once emptied");
  assert.deepEqual(plan.emptyCategoryIds, []);
  for (const name of ["Protection", "Onboarding", "Streaming", "Messaging", "Insights"]) assert.ok(plan.categoriesToCreate.includes(name), `${name} should be created`);
  // Moderation and Support keep their name, so they stay and are not recreated.
  assert.ok(!plan.categoriesToCreate.includes("Moderation") && !plan.categoriesToCreate.includes("Support"));
});
