-- Consolidate Reaction Roles / Role Panels / Join Roles into one module
-- (REACTION_ROLES), and give Reaction Roles a real panel: the bot now posts
-- the message itself and seeds every reaction, instead of requiring an
-- admin to paste an already-existing message ID that nothing ever reacted
-- to.

-- 1. Retire the ROLE_PANELS / JOIN_ROLES module toggles — both guilds using
--    them already have REACTION_ROLES enabled too (verified against
--    production data before writing this migration), so nothing needs
--    reconciling beyond deleting the now-redundant rows.
DELETE FROM "ModuleToggle" WHERE "key" IN ('JOIN_ROLES', 'ROLE_PANELS');

-- 2. New table: the panel (message) itself.
CREATE TABLE "ReactionRolePanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "title" TEXT,
    "description" TEXT,
    "embedEnabled" BOOLEAN NOT NULL DEFAULT false,
    "embedColor" TEXT,
    "embedExtra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReactionRolePanel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReactionRolePanel_guildId_idx" ON "ReactionRolePanel"("guildId");

ALTER TABLE "ReactionRolePanel" ADD CONSTRAINT "ReactionRolePanel_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Backfill: one panel per distinct (guildId, channelId, messageId) group
--    already present in ReactionRole — these were manually pasted existing
--    messages, so messageId is already known and the panel starts "posted".
INSERT INTO "ReactionRolePanel" ("id", "guildId", "channelId", "messageId", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), "guildId", "channelId", "messageId", CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "guildId", "channelId", "messageId" FROM "ReactionRole") AS grouped;

-- 4. Link existing ReactionRole rows to their new panel.
ALTER TABLE "ReactionRole" ADD COLUMN "panelId" TEXT;

UPDATE "ReactionRole" rr
SET "panelId" = p."id"
FROM "ReactionRolePanel" p
WHERE p."guildId" = rr."guildId" AND p."channelId" = rr."channelId" AND p."messageId" = rr."messageId";

ALTER TABLE "ReactionRole" ALTER COLUMN "panelId" SET NOT NULL;
ALTER TABLE "ReactionRole" ALTER COLUMN "messageId" DROP NOT NULL;

CREATE INDEX "ReactionRole_panelId_idx" ON "ReactionRole"("panelId");

ALTER TABLE "ReactionRole" ADD CONSTRAINT "ReactionRole_panelId_fkey"
    FOREIGN KEY ("panelId") REFERENCES "ReactionRolePanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Recreate the ModuleKey enum without JOIN_ROLES / ROLE_PANELS (Postgres
--    has no direct DROP VALUE, so the type is recreated and the one column
--    using it is re-pointed at the new type).
ALTER TYPE "ModuleKey" RENAME TO "ModuleKey_old";

CREATE TYPE "ModuleKey" AS ENUM (
    'MODERATION', 'WELCOME', 'LEVELING', 'STREAM_ALERTS', 'CUSTOM_COMMANDS', 'EVENTS', 'LOGGING', 'ANTI_RAID',
    'REACTION_ROLES', 'STICKY_MESSAGES', 'STARBOARD', 'TEMP_CHANNELS', 'TICKETS', 'GIVEAWAYS', 'VERIFICATION',
    'QUARANTINE', 'ANTI_NUKE', 'HONEYPOT', 'ROLE_PERSISTENCE', 'SCHEDULED_MESSAGES', 'POLLS', 'SUGGESTIONS',
    'ECONOMY', 'COUNTING_GAME', 'TRIVIA', 'CASINO', 'INVITE_TRACKING', 'MODMAIL', 'PLAYER_REPORTS', 'PERM_WATCH',
    'CHANNEL_LOCKS', 'STAT_CHANNELS', 'AI_CHAT', 'AI_MODERATION', 'SERVER_BACKUP', 'ANNOUNCEMENTS', 'SLOW_MODE',
    'BIRTHDAYS', 'APPLICATIONS', 'STATUS_CHANNEL', 'WARN_ESCALATION', 'BAN_APPEALS', 'MOD_DIGEST', 'VOICE_ACTIVITY',
    'WEEKLY_RECAP', 'ACHIEVEMENTS', 'GROWTH_ANALYTICS', 'SERVER_TEMPLATES', 'BUMP_REMINDER', 'SUGGESTION_ANALYTICS',
    'RANK_CARDS', 'CONFESSIONS', 'MEMBER_MILESTONES', 'RULES_GATE', 'PRESTIGE', 'REMINDERS', 'LFG'
);

ALTER TABLE "ModuleToggle" ALTER COLUMN "key" TYPE "ModuleKey" USING ("key"::text::"ModuleKey");

DROP TYPE "ModuleKey_old";
