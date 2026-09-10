import { Router } from "express";
import { prisma } from "@spartacus/db";
import { requireAuthOnly, isOwner, type AuthedRequest } from "../middleware/requireAuth";
import { requireOwner } from "../middleware/requireOwner";
import { sendDirectMessage } from "../lib/discordRest";

const router = Router();

// ---- Self-service (any logged-in user, approved or not) ----

router.get("/access-status", requireAuthOnly, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  if (isOwner(userId)) return res.json({ status: "owner", plan: null });

  const access = await prisma.dashboardAccess.findUnique({ where: { discordUserId: userId } });
  if (access) return res.json({ status: "approved", plan: access.plan });

  const pending = await prisma.accessRequest.findUnique({ where: { discordUserId: userId } });
  if (pending) return res.json({ status: "pending", plan: null });

  res.json({ status: "none", plan: null });
});

router.post("/access-requests", requireAuthOnly, async (req: AuthedRequest, res) => {
  const { id, username } = req.user!;
  if (isOwner(id)) return res.status(400).json({ error: "You're already the owner" });

  const existingAccess = await prisma.dashboardAccess.findUnique({ where: { discordUserId: id } });
  if (existingAccess) return res.status(400).json({ error: "You already have access" });

  const row = await prisma.accessRequest.upsert({
    where: { discordUserId: id },
    create: { discordUserId: id, username },
    update: { username }, // refresh in case they changed their Discord username since first requesting
  });

  if (process.env.OWNER_DISCORD_ID) {
    sendDirectMessage(process.env.OWNER_DISCORD_ID, {
      embeds: [
        {
          color: 0xf5a524,
          title: "🔑 New dashboard access request",
          description: `**${username}** (\`${id}\`) wants access to the Spartacus dashboard.`,
          footer: { text: "Approve or deny it on the Access Control page" },
          timestamp: new Date().toISOString(),
        },
      ],
    }).catch(() => null); // best-effort — a missed DM shouldn't fail the request itself
  }

  res.status(201).json(row);
});

// ---- Owner only ----

router.get("/access-requests", requireAuthOnly, requireOwner, async (_req, res) => {
  const rows = await prisma.accessRequest.findMany({ orderBy: { requestedAt: "asc" } });
  res.json(rows);
});

router.post("/access-requests/:id/approve", requireAuthOnly, requireOwner, async (req, res) => {
  const request = await prisma.accessRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: "Request not found" });

  const access = await prisma.$transaction([
    prisma.dashboardAccess.upsert({
      where: { discordUserId: request.discordUserId },
      create: { discordUserId: request.discordUserId, username: request.username, plan: "FREE" },
      update: { username: request.username },
    }),
    prisma.accessRequest.delete({ where: { id: request.id } }),
  ]);
  res.json(access[0]);
});

router.post("/access-requests/:id/deny", requireAuthOnly, requireOwner, async (req, res) => {
  const request = await prisma.accessRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: "Request not found" });
  await prisma.accessRequest.delete({ where: { id: request.id } });
  res.status(204).send();
});

router.get("/dashboard-access", requireAuthOnly, requireOwner, async (_req, res) => {
  const rows = await prisma.dashboardAccess.findMany({ orderBy: { grantedAt: "desc" } });
  res.json(rows);
});

router.post("/dashboard-access", requireAuthOnly, requireOwner, async (req, res) => {
  const { discordUserId, username } = req.body as { discordUserId?: string; username?: string };
  if (!discordUserId || !/^\d{15,25}$/.test(discordUserId)) {
    return res.status(400).json({ error: "Enter a valid Discord user ID (15-25 digit number)" });
  }
  if (!username?.trim()) return res.status(400).json({ error: "Enter a username for your own reference" });
  if (isOwner(discordUserId)) return res.status(400).json({ error: "That's already the owner account" });

  const existing = await prisma.dashboardAccess.findUnique({ where: { discordUserId } });
  if (existing) return res.status(400).json({ error: "That user already has access" });

  const row = await prisma.dashboardAccess.create({ data: { discordUserId, username: username.trim() } });
  await prisma.accessRequest.deleteMany({ where: { discordUserId } }); // clears a pending request, if any
  res.status(201).json(row);
});

router.patch("/dashboard-access/:id", requireAuthOnly, requireOwner, async (req, res) => {
  const { plan } = req.body as { plan?: string };
  if (plan !== "FREE" && plan !== "PAID") return res.status(400).json({ error: "Plan must be FREE or PAID" });

  const row = await prisma.dashboardAccess.update({ where: { id: req.params.id }, data: { plan } }).catch(() => null);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/dashboard-access/:id", requireAuthOnly, requireOwner, async (req, res) => {
  await prisma.dashboardAccess.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).send();
});

export default router;
