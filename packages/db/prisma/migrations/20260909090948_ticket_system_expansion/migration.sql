/*
  Warnings:

  - Added the required column `ticketNumber` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TicketPanelLayout" AS ENUM ('BUTTONS', 'DROPDOWN');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "closeReason" TEXT,
ADD COLUMN     "feedbackRating" INTEGER,
ADD COLUMN     "priority" TEXT,
ADD COLUMN     "tags" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "ticketNumber" INTEGER NOT NULL,
ADD COLUMN     "transcriptUrl" TEXT,
ADD COLUMN     "typeId" TEXT;

-- AlterTable
ALTER TABLE "TicketPanel" ADD COLUMN     "description" TEXT,
ADD COLUMN     "layout" "TicketPanelLayout" NOT NULL DEFAULT 'BUTTONS',
ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "typeIds" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "TicketType" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "categoryId" TEXT,
    "staffRoleIds" JSONB NOT NULL DEFAULT '[]',
    "openMessage" TEXT,
    "modalFields" JSONB NOT NULL DEFAULT '[]',
    "autoCloseHours" INTEGER,
    "slaMinutes" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTag" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#5865F2',

    CONSTRAINT "TicketTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCannedResponse" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "TicketCannedResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketKnowledgeBase" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "TicketKnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "logChannelId" TEXT,
    "transcriptChannelId" TEXT,
    "ticketCap" INTEGER NOT NULL DEFAULT 0,
    "requireCloseReason" BOOLEAN NOT NULL DEFAULT false,
    "supportRoleIds" JSONB NOT NULL DEFAULT '[]',
    "blacklistUserIds" JSONB NOT NULL DEFAULT '[]',
    "blacklistRoleIds" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "TicketSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketType_guildId_idx" ON "TicketType"("guildId");

-- CreateIndex
CREATE INDEX "TicketTag_guildId_idx" ON "TicketTag"("guildId");

-- CreateIndex
CREATE INDEX "TicketCannedResponse_guildId_idx" ON "TicketCannedResponse"("guildId");

-- CreateIndex
CREATE INDEX "TicketKnowledgeBase_guildId_idx" ON "TicketKnowledgeBase"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketSettings_guildId_key" ON "TicketSettings"("guildId");

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTag" ADD CONSTRAINT "TicketTag_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketCannedResponse" ADD CONSTRAINT "TicketCannedResponse_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketKnowledgeBase" ADD CONSTRAINT "TicketKnowledgeBase_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketSettings" ADD CONSTRAINT "TicketSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
