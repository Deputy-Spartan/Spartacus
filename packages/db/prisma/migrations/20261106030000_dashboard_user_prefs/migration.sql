-- Per-person dashboard settings (theme, reduce motion, display name), keyed by Discord user id.
CREATE TABLE "DashboardUserPrefs" (
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'studio',
    "reduceMotion" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DashboardUserPrefs_pkey" PRIMARY KEY ("userId")
);
