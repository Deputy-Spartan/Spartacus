import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

const DEFAULT_CONFIG = {
  channelId: null as string | null,
  embedTitle: "🎂 Happy Birthday!",
  embedMessage: "Everyone wish {user} a happy birthday! 🎉",
  embedColor: "#FF69B4",
  pingRoleId: null as string | null,
  useButton: false,
  buttonChannelId: null as string | null,
};

router.get("/guilds/:guildId/birthday-config", requireAuth, requireGuildPermission, async (req, res) => {
  const config = await prisma.birthdayConfig.findUnique({ where: { guildId: req.params.guildId } });
  res.json(config ?? { guildId: req.params.guildId, ...DEFAULT_CONFIG });
});

router.put("/guilds/:guildId/birthday-config", requireAuth, requireGuildPermission, async (req, res) => {
  const { channelId, embedTitle, embedMessage, embedColor, pingRoleId, useButton, buttonChannelId, embedExtra } = req.body;
  const existing = await prisma.birthdayConfig.findUnique({ where: { guildId: req.params.guildId } });

  // Changing the button channel (or turning the button on) invalidates any
  // already-posted panel so the poster job redraws it in the right place.
  const buttonChannelChanged = buttonChannelId !== undefined && buttonChannelId !== existing?.buttonChannelId;
  const buttonJustEnabled = useButton === true && existing?.useButton !== true;

  const data = {
    channelId,
    embedTitle,
    embedMessage,
    embedColor,
    pingRoleId,
    useButton,
    buttonChannelId,
    embedExtra: embedExtra ?? Prisma.JsonNull,
    ...(buttonChannelChanged || buttonJustEnabled ? { buttonMessageId: null } : {}),
  };

  const row = await prisma.birthdayConfig.upsert({
    where: { guildId: req.params.guildId },
    create: { guildId: req.params.guildId, ...DEFAULT_CONFIG, ...data },
    update: data,
  });
  res.json(row);
});

router.get("/guilds/:guildId/birthdays", requireAuth, requireGuildPermission, async (req, res) => {
  const rows = await prisma.birthday.findMany({ where: { guildId: req.params.guildId }, orderBy: [{ month: "asc" }, { day: "asc" }] });
  res.json(rows);
});

router.delete("/guilds/:guildId/birthdays/:userId", requireAuth, requireGuildPermission, async (req, res) => {
  await prisma.birthday.deleteMany({ where: { guildId: req.params.guildId, userId: req.params.userId } });
  res.status(204).send();
});

export default router;
