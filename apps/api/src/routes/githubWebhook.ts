import { Router, raw } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { markDeployStarted } from "../jobs/deployTracker";

const router = Router();

// GitHub → repo Settings → Webhooks, "Just the push event", content type
// application/json, secret = GITHUB_WEBHOOK_SECRET. Flips the status to
// "Updating" the instant a push to main lands, before Render or Vercel have
// started building. Mounted ahead of express.json() in index.ts because the
// signature has to be checked against the exact raw bytes GitHub sent.
router.post("/webhooks/github", raw({ type: "application/json", limit: "5mb" }), async (req, res) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: "GITHUB_WEBHOOK_SECRET not set" });

  const body = req.body as Buffer;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const given = req.header("x-hub-signature-256") ?? "";
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return res.status(401).json({ error: "Bad signature" });
  }

  const event = req.header("x-github-event");
  if (event === "ping") return res.json({ ok: true });
  if (event !== "push") return res.json({ ignored: event });

  const payload = JSON.parse(body.toString("utf8")) as { ref?: string; after?: string; deleted?: boolean };
  if (payload.ref !== "refs/heads/main" || payload.deleted || !payload.after) return res.json({ ignored: payload.ref });

  await markDeployStarted(payload.after);
  res.json({ ok: true, commit: payload.after });
});

export default router;
