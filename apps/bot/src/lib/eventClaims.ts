import { prisma } from "./prisma";

// During a deploy the old and new bot both run for a minute and both get
// every Discord event. Whichever records the key first does the work, so a
// join is welcomed once, not once per running copy.
export async function claimEvent(key: string): Promise<boolean> {
  try {
    await prisma.eventClaim.create({ data: { key } });
    return true;
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") return false;
    throw err;
  }
}

// Claims are only needed for a few minutes, so old ones are cleared now and then.
let lastSweep = 0;
export async function sweepEventClaims() {
  if (Date.now() - lastSweep < 3_600_000) return;
  lastSweep = Date.now();
  await prisma.eventClaim.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } }).catch(() => null);
}
