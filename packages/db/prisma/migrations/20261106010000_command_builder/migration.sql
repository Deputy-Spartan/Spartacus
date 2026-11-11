-- Command Builder: custom /commands made of steps.
ALTER TABLE "CustomSlashCommand" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CustomSlashCommand" ADD COLUMN "access" TEXT NOT NULL DEFAULT 'EVERYONE';
ALTER TABLE "CustomSlashCommand" ADD COLUMN "roleIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CustomSlashCommand" ADD COLUMN "channelIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CustomSlashCommand" ADD COLUMN "cooldownSec" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomSlashCommand" ADD COLUMN "checkPerms" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CustomSlashCommand" ADD COLUMN "skipConfirm" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomSlashCommand" ADD COLUMN "inputs" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CustomSlashCommand" ADD COLUMN "steps" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CustomSlashCommand" ADD COLUMN "reply" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CustomSlashCommand" ADD COLUMN "replyPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomSlashCommand" ADD COLUMN "logChannelId" TEXT;
ALTER TABLE "CustomSlashCommand" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The old one-action commands become the same thing as steps, keeping their
-- Discord option ("user"), so they keep working without being re-registered.
UPDATE "CustomSlashCommand" SET "reply" = COALESCE("messageText", ''), "replyPublic" = NOT "ephemeralReply"
WHERE "actionType" = 'SEND_MESSAGE';
UPDATE "CustomSlashCommand" SET
  "steps" = jsonb_build_array(jsonb_build_object('action', 'post_embed', 'params', jsonb_build_object('channel', '', 'title', COALESCE("embedTitle", ''), 'description', COALESCE(NULLIF("embedDescription", ''), NULLIF("messageText", ''), ' '), 'color', COALESCE("embedColor", ''), 'image', ''))),
  "reply" = '✅ Posted.'
WHERE "actionType" = 'POST_EMBED';
UPDATE "CustomSlashCommand" SET
  "inputs" = '[{"name":"user","type":"member","description":"Member to target (defaults to you)","required":false,"choices":[]}]',
  "steps" = jsonb_build_array(jsonb_build_object('action', CASE WHEN "actionType" = 'GIVE_ROLE' THEN 'give_role' ELSE 'remove_role' END, 'params', jsonb_build_object('user', '{user}', 'role', COALESCE("roleId", '')))),
  "reply" = CASE WHEN "actionType" = 'GIVE_ROLE' THEN '✅ Gave the role to {user}.' ELSE '✅ Removed the role from {user}.' END,
  "replyPublic" = NOT "ephemeralReply"
WHERE "actionType" IN ('GIVE_ROLE', 'REMOVE_ROLE');
UPDATE "CustomSlashCommand" SET
  "inputs" = '[{"name":"user","type":"member","description":"Member to give currency to","required":true,"choices":[]}]',
  "steps" = jsonb_build_array(jsonb_build_object('action', 'coins', 'params', jsonb_build_object('user', '{user}', 'amount', COALESCE("currencyAmount", 0)::text))),
  "reply" = '✅ Gave ' || COALESCE("currencyAmount", 0)::text || ' coins to {user}.',
  "replyPublic" = NOT "ephemeralReply",
  "access" = 'ADMINS'
WHERE "actionType" = 'ADD_CURRENCY';

ALTER TABLE "CustomSlashCommand" DROP COLUMN "actionType";
ALTER TABLE "CustomSlashCommand" DROP COLUMN "ephemeralReply";
ALTER TABLE "CustomSlashCommand" DROP COLUMN "messageText";
ALTER TABLE "CustomSlashCommand" DROP COLUMN "roleId";
ALTER TABLE "CustomSlashCommand" DROP COLUMN "currencyAmount";
ALTER TABLE "CustomSlashCommand" DROP COLUMN "embedEnabled";
ALTER TABLE "CustomSlashCommand" DROP COLUMN "embedTitle";
ALTER TABLE "CustomSlashCommand" DROP COLUMN "embedDescription";
ALTER TABLE "CustomSlashCommand" DROP COLUMN "embedColor";
ALTER TABLE "CustomSlashCommand" DROP COLUMN "buttons";
ALTER TABLE "CustomSlashCommand" DROP COLUMN "embedExtra";
ALTER TABLE "CustomSlashCommand" DROP COLUMN "savedEmbedId";

CREATE TABLE "CustomCommandRun" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "commandId" TEXT,
    "commandName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "result" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomCommandRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomCommandRun_guildId_createdAt_idx" ON "CustomCommandRun"("guildId", "createdAt");

CREATE TABLE "CommandTimer" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "roleId" TEXT,
    "channelId" TEXT,
    "text" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommandTimer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommandTimer_runAt_idx" ON "CommandTimer"("runAt");
