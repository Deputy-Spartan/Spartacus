/*
  Warnings:

  - You are about to drop the column `formId` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the `ApplicationForm` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `panelId` to the `Application` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ApplicationPanelLayout" AS ENUM ('BUTTONS', 'DROPDOWN');

-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_formId_fkey";

-- DropForeignKey
ALTER TABLE "ApplicationForm" DROP CONSTRAINT "ApplicationForm_guildId_fkey";

-- AlterTable
ALTER TABLE "Application" DROP COLUMN "formId",
ADD COLUMN     "panelId" TEXT NOT NULL,
ADD COLUMN     "typeId" TEXT;

-- DropTable
DROP TABLE "ApplicationForm";

-- CreateTable
CREATE TABLE "ApplicationPanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "description" TEXT,
    "layout" "ApplicationPanelLayout" NOT NULL DEFAULT 'BUTTONS',
    "typeIds" JSONB NOT NULL DEFAULT '[]',
    "messageId" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ApplicationPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationType" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "reviewChannelId" TEXT,
    "staffRoleIds" JSONB NOT NULL DEFAULT '[]',
    "questions" JSONB NOT NULL DEFAULT '[]',
    "acceptMessage" TEXT DEFAULT '🎉 Your application for {type} was accepted!',
    "denyMessage" TEXT DEFAULT 'Your application for {type} was not accepted this time.',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "logChannelId" TEXT,
    "supportRoleIds" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ApplicationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationPanel_guildId_idx" ON "ApplicationPanel"("guildId");

-- CreateIndex
CREATE INDEX "ApplicationType_guildId_idx" ON "ApplicationType"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationSettings_guildId_key" ON "ApplicationSettings"("guildId");

-- AddForeignKey
ALTER TABLE "ApplicationPanel" ADD CONSTRAINT "ApplicationPanel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationType" ADD CONSTRAINT "ApplicationType_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationSettings" ADD CONSTRAINT "ApplicationSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
