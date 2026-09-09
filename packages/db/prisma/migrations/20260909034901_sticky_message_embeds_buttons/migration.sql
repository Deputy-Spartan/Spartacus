-- AlterTable
ALTER TABLE "StickyMessage" ADD COLUMN     "buttons" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "embedColor" TEXT,
ADD COLUMN     "embedDescription" TEXT,
ADD COLUMN     "embedEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "embedTitle" TEXT;
