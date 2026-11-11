import { Router } from "express";
import { prisma, Prisma } from "@spartacus/db";
import { ECONOMY_PLUS_DEFAULTS, MAX_SHOP_ITEMS, STARTER_SHOP, cleanEconomyPlus, cleanShopItem } from "@spartacus/shared";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import { getBotClient } from "../lib/botClient";
import { deleteChannelMessage } from "../lib/discordRest";

// Economy Hub: one page for every levels-and-coins feature.
const router = Router();
const P = "/guilds/:guildId/economy-hub";

async function view(guildId: string, panelError: string | null = null) {
  const [row, items, purchases, levelRoles] = await Promise.all([
    prisma.economyPlus.findUnique({ where: { guildId } }),
    prisma.shopItem.findMany({ where: { guildId }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    prisma.shopPurchase.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 15 }),
    prisma.levelRole.findMany({ where: { guildId }, orderBy: { level: "asc" } }),
  ]);
  const settings = row ? cleanEconomyPlus(row as unknown as Record<string, unknown>) : { ...ECONOMY_PLUS_DEFAULTS };
  return {
    settings,
    panel: {
      channelId: row?.shopPanelChannelId ?? null,
      posted: !!row?.shopPanelMessageId,
      title: row?.shopPanelTitle ?? "",
      text: row?.shopPanelText ?? "",
      error: panelError,
    },
    items,
    purchases,
    levelRoles: levelRoles.map((r) => ({ level: r.level, roleId: r.roleId })),
  };
}

async function forgetCache(guildId: string) {
  if (!getBotClient()) return;
  const { forgetEconomyPlus } = await import("@spartacus/bot");
  forgetEconomyPlus(guildId);
}

router.get(P, requireAuth, requireGuildPermission, async (req, res) => {
  res.json(await view(req.params.guildId));
});

router.put(P, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const s = cleanEconomyPlus((body.settings ?? {}) as Record<string, unknown>);
  const panel = (body.panel ?? {}) as Record<string, unknown>;
  const before = await prisma.economyPlus.findUnique({ where: { guildId } });
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const panelChannelId = typeof panel.channelId === "string" && /^\d{15,25}$/.test(panel.channelId) ? panel.channelId : null;
  const panelTitle = str(panel.title, 256) || null;
  const panelText = str(panel.text, 4000) || null;
  const changed =
    panelChannelId !== (before?.shopPanelChannelId ?? null) || panelTitle !== (before?.shopPanelTitle ?? null) || panelText !== (before?.shopPanelText ?? null) || body.repost === true;
  if (changed && before?.shopPanelChannelId && before.shopPanelMessageId) await deleteChannelMessage(before.shopPanelChannelId, before.shopPanelMessageId).catch(() => null);
  const data = {
    ...s,
    ladder: s.ladder as unknown as Prisma.InputJsonValue,
    shopPanelChannelId: panelChannelId,
    shopPanelTitle: panelTitle,
    shopPanelText: panelText,
    shopPanelMessageId: changed ? null : (before?.shopPanelMessageId ?? null),
  };
  await prisma.economyPlus.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
  await forgetCache(guildId);
  let panelError: string | null = null;
  const client = getBotClient();
  if (client && panelChannelId && changed) {
    const { postShopPanel } = await import("@spartacus/bot");
    panelError = await postShopPanel(client, guildId).catch((e: Error) => e.message);
  }
  res.json(await view(guildId, panelError));
});

router.post(`${P}/items`, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  if ((await prisma.shopItem.count({ where: { guildId } })) >= MAX_SHOP_ITEMS) return res.status(400).json({ error: `The shop can hold ${MAX_SHOP_ITEMS} items.` });
  const item = cleanShopItem(req.body ?? {});
  if (typeof item === "string") return res.status(400).json({ error: item });
  const sort = await prisma.shopItem.count({ where: { guildId } });
  await prisma.shopItem.create({ data: { guildId, sort, ...item } });
  res.json(await view(guildId));
});

// A few ready-made items to start from.
router.post(`${P}/items/starter`, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  let sort = await prisma.shopItem.count({ where: { guildId } });
  for (const s of STARTER_SHOP) {
    if (sort >= MAX_SHOP_ITEMS) break;
    const item = cleanShopItem({ ...s, roleId: null, stock: null, enabled: true } as unknown as Record<string, unknown>);
    if (typeof item !== "string") await prisma.shopItem.create({ data: { guildId, sort: sort++, ...item } });
  }
  res.json(await view(guildId));
});

router.put(`${P}/items/:itemId`, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  const item = cleanShopItem(req.body ?? {});
  if (typeof item === "string") return res.status(400).json({ error: item });
  await prisma.shopItem.updateMany({ where: { id: req.params.itemId, guildId }, data: item });
  res.json(await view(guildId));
});

router.delete(`${P}/items/:itemId`, requireAuth, requireGuildPermission, async (req, res) => {
  const guildId = req.params.guildId;
  await prisma.shopItem.deleteMany({ where: { id: req.params.itemId, guildId } });
  res.json(await view(guildId));
});

export default router;
