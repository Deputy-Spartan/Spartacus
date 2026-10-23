-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'SUPPORT_INTAKE';

-- CreateEnum
CREATE TYPE "SupportQuestionMode" AS ENUM ('TEXT', 'CHOICE');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('DRAFT', 'OPEN', 'CLAIMED', 'CLOSED');

-- CreateTable
CREATE TABLE "SupportFlow" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "color" TEXT DEFAULT '#5865F2',
  "categoryId" TEXT,
  "roleId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportQuestion" (
  "id" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "mode" "SupportQuestionMode" NOT NULL DEFAULT 'TEXT',
  "choices" JSONB NOT NULL DEFAULT '[]',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SupportQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channelId" TEXT,
  "questionIndex" INTEGER NOT NULL DEFAULT 0,
  "answers" JSONB NOT NULL DEFAULT '[]',
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'DRAFT',
  "claimedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportFlow_guildId_idx" ON "SupportFlow"("guildId");

-- CreateIndex
CREATE INDEX "SupportQuestion_flowId_idx" ON "SupportQuestion"("flowId");

-- CreateIndex
CREATE INDEX "SupportTicket_guildId_status_idx" ON "SupportTicket"("guildId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_status_idx" ON "SupportTicket"("userId", "status");

-- AddForeignKey
ALTER TABLE "SupportFlow" ADD CONSTRAINT "SupportFlow_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportQuestion" ADD CONSTRAINT "SupportQuestion_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "SupportFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "SupportFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
