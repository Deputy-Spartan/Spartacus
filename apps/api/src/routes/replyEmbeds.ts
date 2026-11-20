import { Router } from "express";
import { Prisma, prisma } from "@spartacus/db";
import { requireAuth } from "../middleware/requireAuth";
import { requireGuildPermission } from "../middleware/requireGuildPermission";

// Short replies and DMs that can be plain text or an embed (Verification,
// Rules gate, Reports, Applications, Support DM). Each module keeps a
// `replyEmbeds` map of reply name → saved embed id; this reads and sets it.
const router = Router();

export const REPLY_KEYS = {
  verification: ["verifiedReply", "alreadyVerifiedReply", "noRoleReply", "accountTooNewMessage", "noAvatarMessage", "captchaWrongReply", "dmConfirmMessage", "reminderMessage", "kickMessage"],
  rules: ["agreeReplyMessage", "alreadyAgreedMessage", "noRoleConfiguredMessage", "accountTooNewMessage", "declineReplyMessage", "dmConfirmMessage", "reminderMessage"],
  reports: ["dmCreateMessage", "dmClaimMessage", "dmCloseMessage"],
  support: ["noFlowsMessage", "alreadyOpenMessage", "ticketOpenedMessage", "ticketClaimedMessage", "ticketClosedMessage"],
  application: ["introMessage", "submittedMessage", "acceptMessage", "denyMessage"],
} as const;
type Module = keyof typeof REPLY_KEYS;

const asMap = (v: unknown): Record<string, string> =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, id]) => typeof id === "string" && id)) as Record<string, string> : {};

async function read(module: Module, guildId: string, typeId?: string): Promise<unknown> {
  switch (module) {
    case "verification":
      return (await prisma.verificationConfig.findUnique({ where: { guildId }, select: { replyEmbeds: true } }))?.replyEmbeds;
    case "rules":
      return (await prisma.rulesGateSettings.findUnique({ where: { guildId }, select: { replyEmbeds: true } }))?.replyEmbeds;
    case "reports":
      return (await prisma.playerReportSettings.findUnique({ where: { guildId }, select: { replyEmbeds: true } }))?.replyEmbeds;
    case "support":
      return (await prisma.supportSettings.findUnique({ where: { guildId }, select: { replyEmbeds: true } }))?.replyEmbeds;
    case "application":
      return (await prisma.applicationType.findFirst({ where: { id: typeId ?? "", guildId }, select: { replyEmbeds: true } }))?.replyEmbeds;
  }
}

async function write(module: Module, guildId: string, map: Record<string, string>, typeId?: string) {
  const replyEmbeds = map as Prisma.InputJsonObject;
  const by = { where: { guildId }, create: { guildId, replyEmbeds }, update: { replyEmbeds } };
  switch (module) {
    case "verification":
      return prisma.verificationConfig.upsert(by);
    case "rules":
      return prisma.rulesGateSettings.upsert(by);
    case "reports":
      return prisma.playerReportSettings.upsert(by);
    case "support":
      return prisma.supportSettings.upsert(by);
    case "application": {
      const r = await prisma.applicationType.updateMany({ where: { id: typeId ?? "", guildId }, data: { replyEmbeds } });
      if (!r.count) throw new Error("That application type wasn't found.");
    }
  }
}

const P = "/guilds/:guildId/reply-embeds/:module";
const moduleOf = (m: string): Module | null => (m in REPLY_KEYS ? (m as Module) : null);
const typeOf = (q: unknown) => (typeof q === "string" && q ? q : undefined);

router.get(P, requireAuth, requireGuildPermission, async (req, res) => {
  const module = moduleOf(req.params.module);
  if (!module) return res.status(404).json({ error: "Unknown module." });
  res.json(asMap(await read(module, req.params.guildId, typeOf(req.query.typeId))));
});

// Body: { key, id } — id null puts that reply back to plain text.
router.put(P, requireAuth, requireGuildPermission, async (req, res) => {
  const module = moduleOf(req.params.module);
  if (!module) return res.status(404).json({ error: "Unknown module." });
  const { key, id } = (req.body ?? {}) as { key?: unknown; id?: unknown };
  if (typeof key !== "string" || !(REPLY_KEYS[module] as readonly string[]).includes(key)) return res.status(400).json({ error: "Unknown reply." });
  const guildId = req.params.guildId;
  const typeId = typeOf(req.query.typeId);
  if (typeof id === "string" && id) {
    const preset = await prisma.embedCreatorPreset.findFirst({ where: { id, guildId }, select: { id: true } });
    if (!preset) return res.status(400).json({ error: "That saved embed wasn't found." });
  }
  const map = asMap(await read(module, guildId, typeId));
  if (typeof id === "string" && id) map[key] = id;
  else delete map[key];
  try {
    await write(module, guildId, map, typeId);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "Couldn't save." });
  }
  res.json(map);
});

export default router;
