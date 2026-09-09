import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";
import {
  createGuildChannel,
  createGuildRole,
  getGuildChannels,
  getGuildRoles,
  type DiscordChannel,
  type DiscordRole,
} from "../lib/discordRest";

const router = Router();
const CATEGORY_TYPE = 4;

interface BackupData {
  roles: DiscordRole[];
  channels: DiscordChannel[];
}

router.get("/guilds/:guildId/backups", requireAuth, requireGuildPermission, async (req, res) => {
  const backups = await prisma.serverBackup.findMany({
    where: { guildId: req.params.guildId },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    backups.map((b) => {
      const data = b.data as unknown as BackupData;
      return {
        id: b.id,
        name: b.name,
        createdAt: b.createdAt,
        roleCount: data.roles?.length ?? 0,
        channelCount: data.channels?.length ?? 0,
      };
    })
  );
});

router.post("/guilds/:guildId/backups", requireAuth, requireGuildPermission, async (req, res) => {
  const { name } = req.body as { name?: string };
  const guildId = req.params.guildId;

  const [allRoles, allChannels] = await Promise.all([getGuildRoles(guildId), getGuildChannels(guildId)]);
  const roles = allRoles.filter((r) => r.name !== "@everyone");

  const backup = await prisma.serverBackup.create({
    data: {
      guildId,
      name: name || `Backup ${new Date().toLocaleString()}`,
      data: { roles, channels: allChannels } as object,
    },
  });

  res.status(201).json({ id: backup.id, name: backup.name, createdAt: backup.createdAt, roleCount: roles.length, channelCount: allChannels.length });
});

router.post("/guilds/:guildId/backups/:id/restore", requireAuth, requireGuildPermission, async (req, res) => {
  const backup = await prisma.serverBackup.findUnique({ where: { id: req.params.id } });
  if (!backup || backup.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Backup not found" });
  }

  const guildId = req.params.guildId;
  const data = backup.data as unknown as BackupData;
  const [currentRoles, currentChannels] = await Promise.all([getGuildRoles(guildId), getGuildChannels(guildId)]);
  const currentRoleNames = new Set(currentRoles.map((r) => r.name));
  const currentChannelNames = new Set(currentChannels.map((c) => c.name));

  let rolesCreated = 0;
  for (const role of data.roles) {
    if (currentRoleNames.has(role.name)) continue;
    const created = await createGuildRole(guildId, role);
    if (created) rolesCreated++;
  }

  // Categories first — other channels need the NEW category id, not the
  // one from the snapshot (Discord assigns fresh ids on every create).
  const categoryIdMap = new Map<string, string>();
  const categories = data.channels.filter((c) => c.type === CATEGORY_TYPE);
  const nonCategories = data.channels.filter((c) => c.type !== CATEGORY_TYPE);

  let channelsCreated = 0;
  for (const cat of categories) {
    if (currentChannelNames.has(cat.name)) continue;
    const created = await createGuildChannel(guildId, { ...cat, parent_id: null });
    if (created) {
      categoryIdMap.set(cat.id, created.id);
      channelsCreated++;
    }
  }

  for (const ch of nonCategories) {
    if (currentChannelNames.has(ch.name)) continue;
    const newParentId = ch.parent_id ? categoryIdMap.get(ch.parent_id) ?? null : null;
    const created = await createGuildChannel(guildId, { ...ch, parent_id: newParentId });
    if (created) channelsCreated++;
  }

  res.json({ created: { roles: rolesCreated, channels: channelsCreated } });
});

router.delete("/guilds/:guildId/backups/:id", requireAuth, requireGuildPermission, async (req, res) => {
  const backup = await prisma.serverBackup.findUnique({ where: { id: req.params.id } });
  if (!backup || backup.guildId !== req.params.guildId) {
    return res.status(404).json({ error: "Backup not found" });
  }
  await prisma.serverBackup.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
