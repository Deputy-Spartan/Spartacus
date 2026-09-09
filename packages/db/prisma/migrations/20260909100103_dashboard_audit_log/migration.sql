-- CreateTable
CREATE TABLE "DashboardAuditEntry" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardAuditEntry_guildId_createdAt_idx" ON "DashboardAuditEntry"("guildId", "createdAt");

-- AddForeignKey
ALTER TABLE "DashboardAuditEntry" ADD CONSTRAINT "DashboardAuditEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
