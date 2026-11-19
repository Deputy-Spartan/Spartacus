-- Each person's own accent color and compact mode for the dashboard.
ALTER TABLE "DashboardUserPrefs" ADD COLUMN "accent" TEXT;
ALTER TABLE "DashboardUserPrefs" ADD COLUMN "compact" BOOLEAN NOT NULL DEFAULT false;
