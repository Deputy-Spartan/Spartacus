import { prisma } from "@spartacus/db";
import { refreshStatusNow } from "./statusChannelWatchdog";

const POLL_INTERVAL_MS = 10_000;
const VERCEL_API = "https://api.vercel.com";
// Vercel's in-progress states — READY means published, ERROR/CANCELED mean
// the old version is still live, so both of those count as "finished".
const IN_PROGRESS = new Set(["QUEUED", "INITIALIZING", "BUILDING"]);

interface VercelDeployment {
  state?: string;
  readyState?: string;
  created: number;
  meta?: { githubCommitSha?: string };
}

// Owns BotConfig.dashboardDeployingSince — the "an update is rolling out"
// flag that getEffectiveBotStatus turns into the "updating" phase, so the
// dashboard badge, the Discord status channel, and the bot's own status
// poster all agree. Stored in the DB (not memory) so it survives the API
// restarting mid-deploy, which it does on every Render deploy.
//
// It gets SET by:
//   - markDeployStarted(), called by the GitHub push webhook — the instant
//     a push to main lands, before either host has even started building
//   - this poller, if Vercel shows a build nobody announced (a manual
//     "Redeploy" in Vercel's UI)
// and CLEARED only once the pushed commit is live on both hosts: Vercel's
// newest production deploy has finished for that commit, and this API
// process itself is running it (RENDER_GIT_COMMIT). The 30-minute cutoff in
// lib/botStatus.ts is the backstop if either never happens.
//
// Vercel checks need VERCEL_TOKEN + VERCEL_PROJECT (VERCEL_TEAM_ID
// optional — every team the token can see is searched otherwise). Without
// them only the Render half is tracked.

export async function markDeployStarted(commit: string) {
  const config = await prisma.botConfig.findUnique({ where: { id: "singleton" } });
  await prisma.botConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", dashboardDeployingSince: new Date(), pendingDeployCommit: commit },
    // Keep the original start time across back-to-back pushes; the newest
    // commit is the one that has to land.
    update: { dashboardDeployingSince: config?.dashboardDeployingSince ?? new Date(), pendingDeployCommit: commit },
  });
  await refreshStatusNow().catch(() => null);
}

export function startDeployTracker() {
  const token = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_PROJECT;
  const runningCommit = process.env.RENDER_GIT_COMMIT ?? null;
  const headers = { Authorization: `Bearer ${token}` };
  let resolved: { projectId: string; teamQuery: string } | null = null;
  let warned = false;

  if (token && project) console.log(`[deployTracker] tracking Vercel project "${project}" + Render commit ${runningCommit?.slice(0, 7) ?? "(local)"}`);
  else console.log("[deployTracker] Vercel off (VERCEL_TOKEN / VERCEL_PROJECT not set) — tracking Render only");

  async function vercelGet<T>(path: string): Promise<T> {
    const res = await fetch(`${VERCEL_API}${path}`, { headers });
    if (!res.ok) throw new Error(`${path.split("?")[0]} → ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  async function resolveProject() {
    const teamIds = process.env.VERCEL_TEAM_ID
      ? [process.env.VERCEL_TEAM_ID]
      : [null, ...(await vercelGet<{ teams: { id: string }[] }>("/v2/teams").catch(() => ({ teams: [] }))).teams.map((t) => t.id)];
    for (const teamId of teamIds) {
      const teamQuery = teamId ? `&teamId=${encodeURIComponent(teamId)}` : "";
      const found = await vercelGet<{ id: string }>(`/v9/projects/${encodeURIComponent(project as string)}?${teamQuery.slice(1)}`).catch(() => null);
      if (found) return { projectId: found.id, teamQuery };
    }
    throw new Error(`project "${project}" not found — check VERCEL_PROJECT and that the token's scope includes it`);
  }

  async function latestVercelDeploy(): Promise<VercelDeployment | null> {
    if (!token || !project) return null;
    if (!resolved) {
      resolved = await resolveProject();
      console.log(`[deployTracker] found Vercel project ${resolved.projectId}`);
    }
    const { deployments } = await vercelGet<{ deployments: VercelDeployment[] }>(
      `/v6/deployments?projectId=${resolved.projectId}&target=production&limit=1${resolved.teamQuery}`
    );
    return deployments[0] ?? null;
  }

  async function poll() {
    try {
      const config = await prisma.botConfig.findUnique({ where: { id: "singleton" } });
      const since = config?.dashboardDeployingSince ?? null;
      const commit = config?.pendingDeployCommit ?? null;

      const latest = await latestVercelDeploy();
      const vercelState = latest?.state ?? latest?.readyState;
      const vercelBuilding = !!vercelState && IN_PROGRESS.has(vercelState);

      if (!since) {
        if (vercelBuilding) {
          await prisma.botConfig.update({ where: { id: "singleton" }, data: { dashboardDeployingSince: new Date(latest!.created) } });
          await refreshStatusNow().catch(() => null);
        }
        return;
      }

      // Vercel is done when its newest production deploy has finished and
      // is for the pushed commit (or, with no commit to match, started
      // after the flag was set — a manual redeploy).
      const vercelDone =
        !token ||
        !project ||
        (!vercelBuilding &&
          !!latest &&
          (commit ? latest.meta?.githubCommitSha === commit : latest.created >= since.getTime() - 60_000));
      const renderDone = !commit || !runningCommit || runningCommit === commit;

      if (vercelDone && renderDone) {
        await prisma.botConfig.update({ where: { id: "singleton" }, data: { dashboardDeployingSince: null, pendingDeployCommit: null } });
        await refreshStatusNow().catch(() => null);
      }
      warned = false;
    } catch (err) {
      // Leave the flag alone — the 30-minute cutoff covers a Vercel outage
      // or bad token. Logged once per failure streak, not every 10s.
      if (!warned) console.error("[deployTracker]", err instanceof Error ? err.message : err);
      warned = true;
    }
  }

  void poll();
  setInterval(poll, POLL_INTERVAL_MS);
}
