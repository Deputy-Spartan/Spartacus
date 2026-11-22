// Streaming › Socials: the platform list the overlay, the API and the bot share.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SOCIAL_PLATFORMS, SOCIAL_PLATFORM_IDS } from "../packages/shared";

test("every social platform has its emoji image and a link", () => {
  for (const id of SOCIAL_PLATFORM_IDS) {
    assert.ok(existsSync(join(__dirname, "../apps/bot/assets/socials", `${id}.png`)), `${id}.png`);
    assert.equal(SOCIAL_PLATFORMS[id].id, id);
  }
});

test("names become clean links, however they're typed", () => {
  assert.equal(SOCIAL_PLATFORMS.kick.link("Deputy_Spartan"), "kick.com/Deputy_Spartan");
  assert.equal(SOCIAL_PLATFORMS.youtube.link("@Deputy_Spartan"), "youtube.com/@Deputy_Spartan");
  assert.equal(SOCIAL_PLATFORMS.tiktok.link(" Deputy_Spartan "), "tiktok.com/@Deputy_Spartan");
  assert.equal(SOCIAL_PLATFORMS.discord.link("https://discord.gg/abc123"), "discord.gg/abc123");
  assert.equal(SOCIAL_PLATFORMS.discord.link("abc123"), "discord.gg/abc123");
});
