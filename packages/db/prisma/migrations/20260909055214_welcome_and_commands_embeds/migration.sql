-- AlterTable
ALTER TABLE "CustomCommand" ADD COLUMN     "buttons" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "embedColor" TEXT,
ADD COLUMN     "embedEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "embedTitle" TEXT;

-- AlterTable
ALTER TABLE "WelcomeConfig" ADD COLUMN     "buttons" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "embedEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "embedTitle" TEXT;
