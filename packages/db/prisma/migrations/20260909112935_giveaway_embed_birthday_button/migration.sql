-- AlterTable
ALTER TABLE "BirthdayConfig" ADD COLUMN     "buttonChannelId" TEXT,
ADD COLUMN     "buttonMessageId" TEXT,
ADD COLUMN     "useButton" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Giveaway" ADD COLUMN     "buttons" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "embedColor" TEXT DEFAULT '#B14BFF',
ADD COLUMN     "imageUrl" TEXT;
