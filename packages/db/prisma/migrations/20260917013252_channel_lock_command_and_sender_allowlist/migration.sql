-- AlterTable
ALTER TABLE "ChannelLock" ADD COLUMN     "allowedCommands" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "allowedRoleIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "allowedUserIds" JSONB NOT NULL DEFAULT '[]';
