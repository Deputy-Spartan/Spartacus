-- AlterEnum
ALTER TYPE "ModuleKey" ADD VALUE 'ROLE_MANAGER';

CREATE TABLE "RoleManagerConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "staffRoleIds" TEXT[],
    "logChannelId" TEXT,
    "hiddenRoleIds" TEXT[],
    CONSTRAINT "RoleManagerConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoleManagerConfig_guildId_key" ON "RoleManagerConfig"("guildId");

CREATE TABLE "TimedRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "byUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimedRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TimedRole_guildId_userId_roleId_key" ON "TimedRole"("guildId", "userId", "roleId");
CREATE INDEX "TimedRole_expiresAt_idx" ON "TimedRole"("expiresAt");

CREATE TABLE "BulkRoleJob" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "changedIds" TEXT[],
    "byUserId" TEXT NOT NULL,
    "byName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "BulkRoleJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BulkRoleJob_guildId_createdAt_idx" ON "BulkRoleJob"("guildId", "createdAt");

CREATE TABLE "RoleChangeLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "detail" TEXT,
    "byUserId" TEXT,
    "byName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleChangeLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RoleChangeLog_guildId_createdAt_idx" ON "RoleChangeLog"("guildId", "createdAt");
