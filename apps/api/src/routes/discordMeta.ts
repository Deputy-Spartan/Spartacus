import { Router } from "express";
import { getGuildChannels, getGuildMember, getGuildRoles } from "../lib/discordRest";
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

  const categories = channels.filter((c) => c.type === CATEGORY).sort((a, b) => a.position - b.position);
  const textChannels = channels.filter((c) => TEXT_LIKE.has(c.type));
  const voiceChannels = channels.filter((c) => VOICE_LIKE.has(c.type));

  // Matches Discord's own sidebar ordering: channels with no category
  // first (Discord always renders these above every category), then each
  // category in its real position, with its channels in their real
  // position underneath it — not alphabetical.
  const categoryPosition = (parentId: string | null) => {
    if (!parentId) return -1;
    const idx = categories.findIndex((cat) => cat.id === parentId);
    return idx === -1 ? -1 : idx;
  };

  const withCategoryName = (c: (typeof channels)[number]) => ({
    id: c.id,
    name: c.name,
    categoryName: categories.find((cat) => cat.id === c.parent_id)?.name ?? null,
  });

  const byDiscordOrder = (a: (typeof channels)[number], b: (typeof channels)[number]) => {
    const catDiff = categoryPosition(a.parent_id) - categoryPosition(b.parent_id);
    return catDiff !== 0 ? catDiff : a.position - b.position;
  };

  res.json({
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    textChannels: [...textChannels].sort(byDiscordOrder).map(withCategoryName),
    voiceChannels: [...voiceChannels].sort(byDiscordOrder).map(withCategoryName),
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

// Batched member lookup for leaderboard-style lists — takes a comma-separated
// ?ids= list (capped at 50 per request) so callers don't need to page the
// full member list to resolve a handful of user ids to display names.
router.get("/guilds/:guildId/discord/members", requireAuth, requireGuildPermission, async (req, res) => {
  const ids = String(req.query.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);

  const members = await Promise.all(ids.map((id) => getGuildMember(req.params.guildId, id)));
  res.json(
    members.map((m, i) => m ?? { id: ids[i], username: ids[i], nickname: null, avatar: null })
  );
});

export default router;
