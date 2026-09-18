ALTER TABLE "RolePanel"
  ADD COLUMN "embedEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "embedColor" TEXT,
  ADD COLUMN "embedExtra" JSONB;
