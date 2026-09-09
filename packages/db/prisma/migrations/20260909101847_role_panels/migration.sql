-- CreateEnum
CREATE TYPE "RolePanelLayout" AS ENUM ('BUTTONS', 'DROPDOWN');

-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'ROLE_PANELS';

-- CreateTable
CREATE TABLE "RolePanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "description" TEXT,
    "layout" "RolePanelLayout" NOT NULL DEFAULT 'BUTTONS',
    "options" JSONB NOT NULL DEFAULT '[]',
    "messageId" TEXT,

    CONSTRAINT "RolePanel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RolePanel_guildId_idx" ON "RolePanel"("guildId");

-- AddForeignKey
ALTER TABLE "RolePanel" ADD CONSTRAINT "RolePanel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
