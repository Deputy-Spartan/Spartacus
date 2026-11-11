import { prisma } from "./prisma";

// Applications, Support DM and Modmail all listen to every DM. Whichever one
// is already talking with the person answers, so a reply to an application
// question doesn't also start a support request. Applications come first,
// then Support DM, then Modmail.
export type DmConversation = "application" | "support" | "modmail" | null;

export async function activeDmConversation(userId: string): Promise<DmConversation> {
  if (await prisma.applicationDraft.findUnique({ where: { userId } })) return "application";
  if (await prisma.supportTicket.findFirst({ where: { userId, status: { in: ["DRAFT", "OPEN", "CLAIMED"] } } })) return "support";
  if (await prisma.modmailThread.findFirst({ where: { userId, open: true } })) return "modmail";
  return null;
}
