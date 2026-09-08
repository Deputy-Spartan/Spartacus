import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

const MANAGE_GUILD = 0x20;
const ADMINISTRATOR = 0x8;

// GET /guilds — servers the logged-in user can manage (used by the
// dashboard's server selector). Guild list + permissions were captured
// into the session at OAuth callback time (routes/auth.ts).
router.get("/guilds", requireAuth, async (req: any, res) => {
  const guilds = req.session?.guilds ?? [];

  const manageable = guilds.filter((g: { permissions: string }) => {
    const perms = BigInt(g.permissions);
    return (perms & BigInt(MANAGE_GUILD)) !== 0n || (perms & BigInt(ADMINISTRATOR)) !== 0n;
  });

  res.json(manageable);
});

export default router;
