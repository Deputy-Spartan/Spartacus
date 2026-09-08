import { Router } from "express";

const router = Router();

// Public, unauthenticated — this is the endpoint UptimeRobot (or any free
// monitor) pings every 5-10 minutes to keep the free-tier dyno from idling.
router.get(["/health", "/ping"], (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    timestamp: new Date().toISOString(),
  });
});

export default router;
