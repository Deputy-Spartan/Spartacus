import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { uploadImageAsset } from "../lib/discordRest";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // Discord's own non-boosted attachment cap
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  },
});

// Backs every "Upload" button next to an image-URL field across the
// dashboard (embed thumbnails/images, role panels, etc.) — the file lands
// as a real Discord attachment (see uploadImageAsset) and this just hands
// back the resulting CDN URL for whatever field asked for it.
router.post("/guilds/:guildId/upload-image", requireAuth, requireGuildPermission, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file was received." });
  }

  const result = await uploadImageAsset(req.params.guildId, {
    buffer: req.file.buffer,
    filename: req.file.originalname || "image",
    mimetype: req.file.mimetype,
  });

  if (result.error) return res.status(502).json({ error: result.error });
  res.status(201).json({ url: result.url });
});

export default router;
