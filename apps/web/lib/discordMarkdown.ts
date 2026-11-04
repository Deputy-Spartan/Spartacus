// Discord's message formatting, turned into HTML for dashboard previews.
// What members see is Discord's own rendering of the raw text Spartacus
// sends; this mirrors it so a preview shows the same thing: bold, italic,
// underline, strike, spoilers, code, quotes, headings, -# subtext, lists,
// links, custom emojis, mentions and timestamps.

export interface DiscordNames {
  roles: Record<string, { name: string; color: number }>;
  channels: Record<string, { name: string; voice: boolean }>;
  users?: Record<string, string>;
}

export interface MarkdownOptions {
  // Titles, field names and button labels: Discord renders inline formatting
  // there but no headings, lists or quotes.
  inline?: boolean;
}

const MENTION = "background:rgba(88,101,242,.3);color:#c9cdfb;border-radius:3px;padding:0 2px;font-weight:500;";
const CODE = "background:#1e1f22;border:1px solid #232428;padding:0 3px;border-radius:4px;font-family:Consolas,'Courier New',monospace;font-size:.85em;";
const BLOCK = "background:#1e1f22;border:1px solid #232428;padding:7px 9px;border-radius:4px;white-space:pre-wrap;font-family:Consolas,'Courier New',monospace;font-size:.85em;margin:2px 0;display:block;";
const QUOTE = "display:flex;gap:0;";
const QUOTE_BAR = "width:4px;border-radius:4px;background:#4e5058;flex:none;margin-right:10px;";
const LINK = "color:#00a8fc;";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function timestamp(unix: string, style: string) {
  const d = new Date(Number(unix) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const date = (o: Intl.DateTimeFormatOptions) => d.toLocaleString(undefined, o);
  switch (style) {
    case "t": return date({ hour: "numeric", minute: "2-digit" });
    case "T": return date({ hour: "numeric", minute: "2-digit", second: "2-digit" });
    case "d": return date({ month: "2-digit", day: "2-digit", year: "numeric" });
    case "D": return date({ month: "long", day: "numeric", year: "numeric" });
    case "F": return date({ weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    case "R": {
      const diff = Math.round((d.getTime() - Date.now()) / 1000);
      const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
      const [unit, size] = units.find(([, s]) => Math.abs(diff) >= s) ?? ["second", 1];
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(diff / size), unit);
    }
    default: return date({ month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }
}

// Bold, italic, underline, strike and spoilers, in the order Discord applies them.
function inlineFormat(s: string) {
  return s
    .replace(/\*\*\*([^*][\s\S]*?)\*\*\*/g, "<b><i>$1</i></b>")
    .replace(/\*\*([^*][\s\S]*?)\*\*/g, "<b>$1</b>")
    .replace(/__([^_][\s\S]*?)__/g, "<u>$1</u>")
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?![*\w])/g, "$1<i>$2</i>")
    .replace(/(^|[^_\w])_(?!\s)([^_]+?)_(?![_\w])/g, "$1<i>$2</i>")
    .replace(/~~([\s\S]+?)~~/g, "<s>$1</s>")
    .replace(/\|\|([\s\S]+?)\|\|/g, '<span style="background:#1e1f22;color:transparent;border-radius:3px;" title="Spoiler">$1</span>');
}

export function discordMarkdownToHtml(text: string | null | undefined, names?: DiscordNames, options: MarkdownOptions = {}): string {
  if (!text) return "";
  // Anything that must not be formatted further (code, mentions, links) is
  // swapped for a placeholder and put back at the end.
  const held: string[] = [];
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`;

  let s = escape(text);
  if (!options.inline) s = s.replace(/```(?:[a-z0-9+-]*\n)?([\s\S]*?)```/gi, (_m, code: string) => hold(`<span style="${BLOCK}">${code.replace(/\n$/, "")}</span>`));
  s = s
    .replace(/``([^`]+?)``|`([^`\n]+?)`/g, (_m, a, b) => hold(`<code style="${CODE}">${a ?? b}</code>`))
    .replace(/&lt;(a?):(\w{2,32}):(\d{15,25})&gt;/g, (_m, a, n, id) => hold(`<img src="https://cdn.discordapp.com/emojis/${id}.${a ? "gif" : "png"}?size=48" alt=":${n}:" title=":${n}:" style="display:inline;height:1.375em;width:1.375em;object-fit:contain;vertical-align:-.3em;margin:0 1px;" />`))
    .replace(/&lt;@&amp;(\d+)&gt;/g, (_m, id) => {
      const role = names?.roles[id];
      if (!role) return hold(`<span style="${MENTION}">@unknown-role</span>`);
      const hex = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : null;
      return hold(hex ? `<span style="color:${hex};background:${hex}1a;border-radius:3px;padding:0 2px;font-weight:500;">@${escape(role.name)}</span>` : `<span style="${MENTION}">@${escape(role.name)}</span>`);
    })
    .replace(/&lt;#(\d+)&gt;/g, (_m, id) => {
      const ch = names?.channels[id];
      return hold(`<span style="${MENTION}">${ch?.voice ? "🔊 " : "#"}${escape(ch?.name ?? "unknown")}</span>`);
    })
    .replace(/&lt;@!?(\d+)&gt;/g, (_m, id) => hold(`<span style="${MENTION}">@${escape(names?.users?.[id] ?? "Member")}</span>`))
    .replace(/@(everyone|here)\b/g, (_m, w) => hold(`<span style="${MENTION}">@${w}</span>`))
    .replace(/&lt;t:(-?\d+)(?::([tTdDfFR]))?&gt;/g, (m, unix, style) => {
      const t = timestamp(unix, style ?? "f");
      return t ? hold(`<span style="background:rgba(255,255,255,.06);border-radius:3px;padding:0 2px;">${t}</span>`) : m;
    })
    // [label](url) masked links; the label still gets bold and the rest.
    .replace(/\[([^\]\n]+)\]\(&lt;?(https?:\/\/[^\s)]+?)(?:&gt;)?\)/g, (_m, label, url) => `${hold(`<a href="${url}" target="_blank" rel="noreferrer" style="${LINK}">`)}${label}${hold("</a>")}`)
    .replace(/&lt;(https?:\/\/[^\s]+?)&gt;|(https?:\/\/[^\s<\u0000]+[^\s<.,;:!?)'"\u0000])/g, (_m, a, b) => hold(`<a href="${a ?? b}" target="_blank" rel="noreferrer" style="${LINK}">${a ?? b}</a>`));

  if (options.inline) return restore(inlineFormat(s.replace(/\n/g, " ")), held);

  // Line by line for the block parts: quotes, headings, subtext and lists.
  const lines = s.split("\n");
  const out: Array<{ html: string; block: boolean }> = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // ">>> " quotes the rest of the message.
    const multi = line.match(/^&gt;&gt;&gt; ([\s\S]*)$/);
    if (multi) {
      const rest = [multi[1], ...lines.slice(i + 1)].map((l) => blockLine(l)).map((b) => b.html + (b.block ? "" : "<br>")).join("");
      out.push({ html: `<div style="${QUOTE}"><span style="${QUOTE_BAR}"></span><div style="min-width:0">${rest.replace(/<br>$/, "")}</div></div>`, block: true });
      break;
    }
    const quote = line.match(/^&gt; ?(.*)$/);
    if (quote && line.startsWith("&gt; ")) {
      const inner = blockLine(quote[1]);
      out.push({ html: `<div style="${QUOTE}"><span style="${QUOTE_BAR}"></span><div style="min-width:0">${inner.html}</div></div>`, block: true });
      continue;
    }
    out.push(blockLine(line));
  }
  let html = "";
  out.forEach((b, i) => {
    html += b.html;
    if (i < out.length - 1 && !b.block) html += "\n";
  });
  return restore(html, held);
}

function blockLine(line: string): { html: string; block: boolean } {
  const h = line.match(/^(#{1,3}) (.+)$/);
  if (h) {
    const size = h[1].length === 1 ? "1.5em" : h[1].length === 2 ? "1.25em" : "1em";
    return { html: `<div style="font-weight:700;font-size:${size};line-height:1.375;margin:8px 0 4px;color:#f2f3f5;">${inlineFormat(h[2])}</div>`, block: true };
  }
  const sub = line.match(/^-# (.+)$/);
  if (sub) return { html: `<div style="font-size:.8125em;color:#949ba4;line-height:1.3;">${inlineFormat(sub[1])}</div>`, block: true };
  const bullet = line.match(/^(\s*)[-*] (.+)$/);
  if (bullet) {
    const depth = Math.min(3, Math.floor(bullet[1].length / 2));
    const dot = depth === 0 ? "•" : "◦";
    return { html: `<div style="display:flex;gap:6px;padding-left:${0.5 + depth * 1.25}em;"><span>${dot}</span><span style="min-width:0">${inlineFormat(bullet[2])}</span></div>`, block: true };
  }
  const num = line.match(/^(\s*)(\d{1,3})\. (.+)$/);
  if (num) {
    const depth = Math.min(3, Math.floor(num[1].length / 2));
    return { html: `<div style="display:flex;gap:6px;padding-left:${0.5 + depth * 1.25}em;"><span>${num[2]}.</span><span style="min-width:0">${inlineFormat(num[3])}</span></div>`, block: true };
  }
  return { html: inlineFormat(line), block: false };
}

function restore(html: string, held: string[]) {
  // Held pieces can hold other held pieces (a link label with a mention).
  let out = html;
  for (let pass = 0; pass < 3 && out.includes("\u0000"); pass++) out = out.replace(/\u0000(\d+)\u0000/g, (_m, i) => held[Number(i)] ?? "");
  return out;
}
