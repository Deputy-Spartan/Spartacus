import { Router } from "express";
import { requireAuthOnly, type AuthedRequest } from "../middleware/requireAuth";

const router = Router();

// requireAuthOnly, not requireAuth — a logged-in-but-unapproved visitor
// still needs to know who they are to render the "access needed" screen.
router.get("/me", requireAuthOnly, (req: AuthedRequest, res) => {
  res.json(req.user);
});

export default router;
