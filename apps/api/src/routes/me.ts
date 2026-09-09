import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";

const router = Router();

router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json(req.user);
});

export default router;
