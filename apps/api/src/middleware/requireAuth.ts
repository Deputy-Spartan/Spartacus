import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

interface SessionPayload {
  id: string;
  username: string;
  avatar: string | null;
  guilds: Array<{ id: string; name: string; icon: string | null; permissions: string }>;
}

export interface AuthedRequest extends Request {
  user?: { id: string; username: string; avatar: string | null };
  session?: SessionPayload;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.spartacus_session;
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const payload = jwt.verify(token, process.env.NEXTAUTH_SECRET as string) as SessionPayload;
    req.session = payload;
    req.user = { id: payload.id, username: payload.username, avatar: payload.avatar };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}
