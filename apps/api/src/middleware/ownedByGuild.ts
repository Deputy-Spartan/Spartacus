import { NextFunction, Request, Response } from "express";
import { prisma } from "@spartacus/db";

type GuildScopedModel = {
  findFirst(args: { where: { id: string; guildId: string }; select: { id: true } }): Promise<{ id: string } | null>;
};

// requireGuildPermission checks the server in the URL, not the record. Stack
// this after it on any route that changes a row by id, or someone who manages
// one server could edit another server's data by swapping the id.
export function ownedByGuild(model: string, idParam = "id") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const table = (prisma as unknown as Record<string, GuildScopedModel>)[model];
    const row = await table.findFirst({ where: { id: req.params[idParam], guildId: req.params.guildId }, select: { id: true } });
    if (!row) return res.status(404).json({ error: "Not found" });
    next();
  };
}
