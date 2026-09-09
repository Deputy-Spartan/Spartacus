import { NextFunction, Response } from "express";
import { prisma } from "@spartacus/db";
import { AuthedRequest } from "./requireAuth";

const MANAGE_GUILD = 0x20;
const ADMINISTRATOR = 0x8;

// Discord permission bitfields arrive as strings; guard the guild param
// against any user who lacks Manage Server / Administrator on that guild.
// The guild list (with per-guild permissions) was captured into the JWT
// session at OAuth callback time (see routes/auth.ts), so no extra
// Discord API call is needed per request.
export async function requireGuildPermission(req: AuthedRequest, res: Response, next: NextFunction) {
  const { guildId } = req.params;
  const guild = req.session?.guilds.find((g) => g.id === guildId);

  if (!guild) return res.status(403).json({ error: "No access to this server" });

  const perms = BigInt(guild.permissions);
  const allowed = (perms & BigInt(MANAGE_GUILD)) !== 0n || (perms & BigInt(ADMINISTRATOR)) !== 0n;

  if (!allowed) return res.status(403).json({ error: "Insufficient permissions" });

  // Every module table has a foreign key back to Guild. This is the one
  // choke point all guild-scoped routes pass through, so ensuring the row
  // exists here means no route needs to remember to do it — brand-new
  // servers (never seen by the dashboard before) stopped 500ing (and, in
  // production where the API and bot share a process, crashing the whole
  // bot) the moment any module tried to write a child row for them.
  await prisma.guild.upsert({
    where: { id: guildId },
    create: { id: guildId, name: guild.name },
    update: {},
  });

  // Same choke point doubles as the dashboard activity log — every
  // successful mutating request against a guild gets one row, with no
  // individual route needing to remember to log anything itself.
  const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  if (MUTATING_METHODS.has(req.method) && req.session) {
    const userId = req.session.id;
    const username = req.session.username;
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      prisma.dashboardAuditEntry
        .create({ data: { guildId, userId, username, method: req.method, path: req.route ? req.baseUrl + req.route.path : req.path } })
        .catch(() => null);
    });
  }

  next();
}
