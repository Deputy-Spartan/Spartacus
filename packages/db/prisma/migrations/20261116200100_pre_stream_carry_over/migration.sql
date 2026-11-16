-- Servers that had Stream Growth on were already using /prestream, so the new
-- Pre-Stream Checklist module starts on for them. (A separate file because a
-- new enum value can't be used in the migration that adds it.)
INSERT INTO "ModuleToggle" ("id", "guildId", "key", "enabled")
SELECT md5(random()::text || "guildId"), "guildId", 'PRE_STREAM', true
FROM "ModuleToggle"
WHERE "key" = 'STREAM_GROWTH' AND "enabled" = true
ON CONFLICT ("guildId", "key") DO NOTHING;
