-- AlterTable
ALTER TABLE "ApplicationType" ADD COLUMN     "customResponses" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "introMessage" TEXT,
ADD COLUMN     "submittedMessage" TEXT;
