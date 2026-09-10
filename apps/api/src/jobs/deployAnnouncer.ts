import { prisma } from "@spartacus/db";
import { postChannelMessage } from "../lib/discordRest";

// Render sets RENDER_GIT_COMMIT automatically on every deploy — no extra
// config needed. Comparing it to the last commit we saw (stored on the
// BotConfig singleton) is how a "new deploy" is detected, since the
// process restarts on every deploy anyway.
export async function announceDeployIfNew() {
  const commit = process.env.RENDER_GIT_COMMIT ?? null;
  if (!commit) return; // local dev / non-Render hosts — nothing to compare against

  const config = await prisma.botConfig.findUnique({ where: { id: "singleton" } });
  const previousCommit = config?.lastDeployCommit ?? null;

  await prisma.botConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", lastDeployCommit: commit, lastDeployAt: new Date() },
    update: { lastDeployCommit: commit, lastDeployAt: new Date() },
  });

  // First-ever boot (no prior commit recorded) isn't a "new" deploy from the
  // server admins' point of view — skip the announcement so turning this
  // feature on doesn't immediately spam every configured channel.
  if (!previousCommit || previousCommit === commit) return;

  const settings = await prisma.alertSettings.findMany({ where: { deployChannelId: { not: null } } });

  for (const s of settings) {
    await postChannelMessage(s.deployChannelId as string, {
      embeds: [
        {
          color: 0x3b82f6,
          title: "🚀 Spartacus was updated",
          description: `A new version just deployed (\`${commit.slice(0, 7)}\`).`,
          timestamp: new Date().toISOString(),
        },
      ],
    }).catch(() => null);
  }
}
