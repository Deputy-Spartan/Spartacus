-- CreateTable
CREATE TABLE "EventTemplate" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 15,
    "embedEnabled" BOOLEAN NOT NULL DEFAULT true,
    "embedColor" TEXT DEFAULT '#00E5FF',
    "buttons" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSettings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "defaultChannelId" TEXT,
    "defaultReminder" INTEGER NOT NULL DEFAULT 15,
    "mentionRoleId" TEXT,

    CONSTRAINT "EventSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventTemplate_guildId_name_key" ON "EventTemplate"("guildId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EventSettings_guildId_key" ON "EventSettings"("guildId");

-- AddForeignKey
ALTER TABLE "EventTemplate" ADD CONSTRAINT "EventTemplate_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSettings" ADD CONSTRAINT "EventSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
