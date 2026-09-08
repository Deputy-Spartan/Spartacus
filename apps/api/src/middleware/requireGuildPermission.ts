import { NextFunction, Response } from "express";
import { AuthedRequest } from "./requireAuth";

const MANAGE_GUILD = 0x20;
const ADMINISTRATOR = 0x8;

// Discord permission bitfields arrive as strings; guard the guild param
// against any user who lacks Manage Server / Administrator on that guild.
// The guild list (with per-guild permissions) was captured into the JWT
// session at OAuth callback time (see routes/auth.ts), so no extra
// Discord API call is needed per request.
export function requireGuildPermission(req: AuthedRequest, res: Response, next: NextFunction) {
  const { guildId } = req.params;
  const guild = req.session?.guilds.find((g) => g.id === guildId);

  if (!guild) return res.status(403).json({ error: "No access to this server" });

  const perms = BigInt(guild.permissions);
  const allowed = (perms & BigInt(MANAGE_GUILD)) !== 0n || (perms & BigInt(ADMINISTRATOR)) !== 0n;

  if (!allowed) return res.status(403).json({ error: "Insufficient permissions" });
  next();
}
