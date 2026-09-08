import { prisma } from "./prisma";
import type { CaseAction } from "@spartacus/db";

// Case numbers are per-guild sequential — computed from the current max
// rather than a separate counter table, which is fine at moderation-log
// volume and keeps the schema simpler.
export async function logCase(params: {
  guildId: string;
  userId: string;
  action: CaseAction;
  reason?: string | null;
  moderatorId: string;
}) {
  const last = await prisma.moderationCase.findFirst({
    where: { guildId: params.guildId },
    orderBy: { caseNumber: "desc" },
  });

  return prisma.moderationCase.create({
    data: {
      guildId: params.guildId,
      caseNumber: (last?.caseNumber ?? 0) + 1,
      userId: params.userId,
      action: params.action,
      reason: params.reason,
      moderatorId: params.moderatorId,
    },
  });
}
