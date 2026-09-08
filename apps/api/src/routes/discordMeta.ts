import { Router } from "express";
import { getGuildChannels, getGuildRoles } from "../lib/discordRest";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

const router = Router();

const TEXT_LIKE = new Set([0, 5, 15]); // GUILD_TEXT, GUILD_ANNOUNCEMENT, GUILD_FORUM
const VOICE_LIKE = new Set([2, 13]); // GUILD_VOICE, GUILD_STAGE_VOICE
const CATEGORY = 4;

// Every "which channel/category should this go to" picker in the dashboard
// calls this one endpoint — kept separate from /guilds/:guildId/modules so
// it can be cached independently and doesn't require any bot-process state.
router.get("/guilds/:guildId/discord/channels", requireAuth, requireGuildPermission, async (req, res) => {
  const channels = await getGuildChannels(req.params.guildId);

  const categories = channels.filter((c) => c.type === CATEGORY);
  const textChannels = channels.filter((c) => TEXT_LIKE.has(c.type));
  const voiceChannels = channels.filter((c) => VOICE_LIKE.has(c.type));

  const withCategoryName = (c: (typeof channels)[number]) => ({
    id: c.id,
    name: c.name,
    categoryName: categories.find((cat) => cat.id === c.parent_id)?.name ?? null,
  });

  res.json({
    categories: categories.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
    textChannels: textChannels.map(withCategoryName).sort((a, b) => a.name.localeCompare(b.name)),
    voiceChannels: voiceChannels.map(withCategoryName).sort((a, b) => a.name.localeCompare(b.name)),
  });
});

router.get("/guilds/:guildId/discord/roles", requireAuth, requireGuildPermission, async (req, res) => {
  const roles = await getGuildRoles(req.params.guildId);
  res.json(
    roles
      .filter((r) => r.name !== "@everyone")
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.color }))
  );
});

export default router;
