import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

// GET /guilds — servers the logged-in user can manage (used by the
// dashboard's server selector). Already filtered to manageable guilds and
// captured into the session at OAuth callback time (routes/auth.ts).
router.get("/guilds", requireAuth, async (req: any, res) => {
  res.json(req.session?.guilds ?? []);
});

export default router;
