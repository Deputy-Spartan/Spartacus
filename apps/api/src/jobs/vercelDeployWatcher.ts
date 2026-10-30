import { prisma } from "@spartacus/db";

const POLL_INTERVAL_MS = 15_000;
const VERCEL_API = "https://api.vercel.com";
// Vercel's in-progress states — READY means published, ERROR/CANCELED mean
// the old version is still live, so both of those count as "not updating".
const IN_PROGRESS = new Set(["QUEUED", "INITIALIZING", "BUILDING"]);

// Mirrors the newest production Vercel deployment into
// BotConfig.dashboardDeployingSince, which getEffectiveBotStatus turns into
// the "updating" phase — so the dashboard badge, the Discord status
// channel, and the bot's own status poster all agree, even when the bot
// runs as a separate process. Stored in the DB rather than memory for
// exactly that reason.
//
// Needs VERCEL_TOKEN (Account Settings → Tokens) and VERCEL_PROJECT (the
// project's name or id). VERCEL_TEAM_ID is optional — if it's unset and the
// project isn't found on the personal scope, every team the token can see
// is tried. Without the token/project this only clears any stale flag.
export function startVercelDeployWatcher() {
  const token = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_PROJECT;
  if (!token || !project) {
    void prisma.botConfig.updateMany({ where: { dashboardDeployingSince: { not: null } }, data: { dashboardDeployingSince: null } }).catch(() => null);
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };
  let resolved: { projectId: string; teamQuery: string } | null = null;
  let current: Date | null | undefined; // undefined = not yet synced to the DB this process
  let warned = false;

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

  async function setDeploying(since: Date | null) {
    if (current !== undefined && (current?.getTime() ?? null) === (since?.getTime() ?? null)) return;
    await prisma.botConfig.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", dashboardDeployingSince: since },
      update: { dashboardDeployingSince: since },
    });
    current = since;
  }

  async function poll() {
    try {
      resolved ??= await resolveProject();
      const { deployments } = await vercelGet<{ deployments: Array<{ state?: string; readyState?: string; created: number }> }>(
        `/v6/deployments?projectId=${resolved.projectId}&target=production&limit=1${resolved.teamQuery}`
      );
      const latest = deployments[0];
      const state = latest?.state ?? latest?.readyState;
      await setDeploying(state && IN_PROGRESS.has(state) ? new Date(latest.created) : null);
      warned = false;
    } catch (err) {
      await setDeploying(null).catch(() => null);
      // Once per failure streak — a bad token shouldn't flood the logs every 15s.
      if (!warned) console.error("[vercelDeployWatcher]", err instanceof Error ? err.message : err);
      warned = true;
    }
  }

  void poll();
  setInterval(poll, POLL_INTERVAL_MS);
}
