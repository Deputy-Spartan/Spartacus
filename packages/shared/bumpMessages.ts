// The one Spartacus message in the bump channel, in its three stages.
// Shared so the bot posts exactly what the dashboard previews.

export type BumpStage = "bumped" | "ready" | "missed";
export const BUMP_STAGES: BumpStage[] = ["bumped", "ready", "missed"];

// Disboard's /bump, shown as a clickable command.
export const BUMP_COMMAND = "</bump:947088344167366698>";

export interface BumpEmbedExtra {
  authorName?: string;
  authorIconUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerText?: string;
  footerIconUrl?: string;
  timestamp?: boolean;
  fields?: Array<{ name: string; value: string; inline: boolean }>;
}

export interface BumpStageMessage {
  enabled: boolean; // only "bumped" can be switched off; the others follow their own settings
  content: string;
  embedEnabled: boolean;
  title: string;
  description: string;
  color: string;
  extra: BumpEmbedExtra;
}

export type BumpMessages = Record<BumpStage, BumpStageMessage>;

export const BUMP_DEFAULTS: BumpMessages = {
  bumped: {
    enabled: true,
    content: "",
    embedEnabled: true,
    title: "✅ Bump done!",
    description: "Thanks {user} for bumping the server!\n\n**Next bump:** {next}\n-# Ready at {next_time}",
    color: "#22c55e",
    extra: { footerText: "Bumps counted: {count}" },
  },
  ready: {
    enabled: true,
    content: "{role}",
    embedEnabled: true,
    title: "⏰ Ready to bump!",
    description: "The server can be bumped again.\nUse {bump} on Disboard.\n\n-# Ready since {ready}",
    color: "#f59e0b",
    extra: {},
  },
  missed: {
    enabled: true,
    content: "{role}",
    embedEnabled: true,
    title: "⚠️ Bump missed!",
    description: "The server has been ready to bump since {ready} and nobody has bumped yet.\nUse {bump} now.\n\n**Missed in a row:** {missed}",
    color: "#ef4444",
    extra: {},
  },
};

export const BUMP_PLACEHOLDERS: Array<{ token: string; description: string; stages?: BumpStage[] }> = [
  { token: "{user}", description: "Whoever bumped last" },
  { token: "{role}", description: "Your mention role (pings it in the message text)" },
  { token: "{bump}", description: "A clickable /bump" },
  { token: "{next}", description: "Live countdown to the next bump, e.g. “in 1 hour”", stages: ["bumped"] },
  { token: "{next_time}", description: "When the next bump is ready, e.g. 5:10 PM", stages: ["bumped"] },
  { token: "{ready}", description: "Live time since it's been ready, e.g. “12 minutes ago”", stages: ["ready", "missed"] },
  { token: "{missed}", description: "How many bumps were missed in a row", stages: ["missed"] },
  { token: "{count}", description: "How many bumps Spartacus has counted" },
  { token: "{server}", description: "The server's name" },
];

const str = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.slice(0, max) : fallback);

function cleanExtra(v: unknown): BumpEmbedExtra {
  if (!v || typeof v !== "object") return {};
  const e = v as Record<string, unknown>;
  const out: BumpEmbedExtra = {};
  for (const k of ["authorName", "authorIconUrl", "thumbnailUrl", "imageUrl", "footerText", "footerIconUrl"] as const) {
    if (typeof e[k] === "string" && e[k]) out[k] = (e[k] as string).slice(0, k === "footerText" ? 2048 : 512);
  }
  if (e.timestamp === true) out.timestamp = true;
  if (Array.isArray(e.fields)) {
    out.fields = e.fields
      .filter((f) => f && typeof f === "object")
      .slice(0, 25)
      .map((f) => ({ name: str((f as Record<string, unknown>).name, 256), value: str((f as Record<string, unknown>).value, 1024), inline: !!(f as Record<string, unknown>).inline }));
  }
  return out;
}

export function cleanBumpMessages(raw: unknown): BumpMessages {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as BumpMessages;
  for (const stage of BUMP_STAGES) {
    const d = BUMP_DEFAULTS[stage];
    const v = r[stage] && typeof r[stage] === "object" ? (r[stage] as Record<string, unknown>) : null;
    out[stage] = v
      ? {
          enabled: stage === "bumped" ? v.enabled !== false : true,
          content: str(v.content, 2000),
          embedEnabled: v.embedEnabled !== false,
          title: str(v.title, 256),
          description: str(v.description, 4096),
          color: typeof v.color === "string" && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : d.color,
          extra: cleanExtra(v.extra),
        }
      : { ...d, extra: { ...d.extra } };
  }
  return out;
}

export interface BumpVars {
  userId?: string | null;
  roleId?: string | null;
  nextAt?: Date | null; // when the next bump is ready
  serverName?: string;
  missed?: number;
  count?: number;
}

export function fillBumpText(text: string, v: BumpVars): string {
  const ts = v.nextAt ? Math.floor(v.nextAt.getTime() / 1000) : null;
  return text
    .replace(/\{user\}/g, v.userId ? `<@${v.userId}>` : "someone")
    .replace(/\{role\}/g, v.roleId ? `<@&${v.roleId}>` : "")
    .replace(/\{bump\}/g, BUMP_COMMAND)
    .replace(/\{next\}/g, ts ? `<t:${ts}:R>` : "soon")
    .replace(/\{next_time\}/g, ts ? `<t:${ts}:t>` : "soon")
    .replace(/\{ready\}/g, ts ? `<t:${ts}:R>` : "now")
    .replace(/\{missed\}/g, String(v.missed ?? 0))
    .replace(/\{count\}/g, String(v.count ?? 0))
    .replace(/\{server\}/g, v.serverName ?? "the server");
}

// Fills every text in a stage, embed extras included.
export function fillBumpStage(m: BumpStageMessage, v: BumpVars): BumpStageMessage {
  const f = (s?: string) => (s ? fillBumpText(s, v) : s);
  const extra: BumpEmbedExtra = { ...m.extra, authorName: f(m.extra.authorName), footerText: f(m.extra.footerText) };
  if (m.extra.fields) extra.fields = m.extra.fields.map((x) => ({ ...x, name: fillBumpText(x.name, v), value: fillBumpText(x.value, v) }));
  return { ...m, content: fillBumpText(m.content, v).trim(), title: fillBumpText(m.title, v), description: fillBumpText(m.description, v), extra };
}
