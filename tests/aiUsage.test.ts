// AI Usage: costs from token counts, and days in the owner's time zone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aiCostMicros, aiUsageDay, aiUsageMonth } from "../packages/shared";

test("ai usage: cost in micro-dollars, split out web searches", () => {
  // Sonnet 5.5: 20,000 read × $2/M = 4¢, 500 written × $10/M = 0.5¢, 2 searches = 2¢.
  assert.deepEqual(aiCostMicros({ model: "claude-sonnet-5-5", inputTokens: 20_000, outputTokens: 500, searches: 2 }), { total: 65_000, search: 20_000 });
  // Haiku 5.5: 1,000 × $0.10/M + 100 × $0.50/M.
  assert.deepEqual(aiCostMicros({ model: "claude-haiku-5-5", inputTokens: 1_000, outputTokens: 100, searches: 0 }), { total: 150, search: 0 });
  // An unknown model is priced like Sonnet 5.5 rather than free.
  assert.equal(aiCostMicros({ model: "mystery", inputTokens: 1_000_000, outputTokens: 0, searches: 0 }).total, 2_000_000);
});

test("ai usage: days and months follow New York time", () => {
  // 03:00 UTC on Dec 1 is still Nov 30 in New York.
  assert.equal(aiUsageDay(new Date("2026-12-01T03:00:00Z")), "2026-11-30");
  assert.equal(aiUsageMonth(new Date("2026-12-01T03:00:00Z")), "2026-11");
  assert.equal(aiUsageDay(new Date("2026-12-01T06:00:00Z")), "2026-12-01");
});
