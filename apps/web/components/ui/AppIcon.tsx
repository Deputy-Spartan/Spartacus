import { ICON_PATHS } from "./iconPaths.gen";

// Section colors for the icon tiles, muted so they sit next to the steel blues.
const COLORS = {
  core: "#5e7fa6",
  warn: "#c98a2e",
  mod: "#c45a55",
  sec: "#3f9a6b",
  com: "#4f7fc4",
  eng: "#7d68c4",
  eco: "#c29a32",
  sup: "#3a9aa0",
  util: "#5f7f9a",
  own: "#6b7280",
} as const;
type Tone = keyof typeof COLORS;

// Every emoji the dashboard uses as a page icon, with the line icon and tile
// color that replace it. Anything not listed (like a custom emoji someone
// picked on the Front Page) still shows as the emoji itself.
const EMOJI: Record<string, [string, Tone]> = {
  "📊": ["layout-dashboard", "core"],
  "🧩": ["blocks", "core"],
  "⚠️": ["triangle-alert", "warn"],
  "🛡️": ["shield", "mod"],
  "📁": ["folder-open", "mod"],
  "🚩": ["flag", "mod"],
  "📋": ["clipboard-list", "mod"],
  "📈": ["trending-up", "mod"],
  "🙏": ["scale", "mod"],
  "🤖": ["bot", "mod"],
  "🚨": ["siren", "sec"],
  "💣": ["bomb", "sec"],
  "🗄️": ["archive", "sec"],
  "✅": ["badge-check", "sec"],
  "📜": ["scroll-text", "sec"],
  "🍯": ["radar", "sec"],
  "🔑": ["key-round", "sec"],
  "🔒": ["lock", "sec"],
  "👋": ["hand", "com"],
  "🎭": ["smile-plus", "com"],
  "📌": ["pin", "com"],
  "⭐": ["star", "com"],
  "🔊": ["headphones", "com"],
  "💬": ["message-square", "com"],
  "🎂": ["cake", "com"],
  "🏅": ["medal", "com"],
  "🤫": ["venetian-mask", "com"],
  "⚔️": ["swords", "eng"],
  "🎮": ["gamepad-2", "eng"],
  "🎁": ["gift", "eng"],
  "🗳️": ["vote", "eng"],
  "🔴": ["radio", "eng"],
  "📢": ["megaphone", "eng"],
  "📝": ["file-pen-line", "eng"],
  "⏰": ["alarm-clock", "eng"],
  "💡": ["lightbulb", "eng"],
  "🤝": ["handshake", "eng"],
  "🔍": ["search", "eng"],
  "💰": ["coins", "eco"],
  "🔢": ["hash", "eco"],
  "🎟️": ["ticket", "sup"],
  "📨": ["mail", "sup"],
  "🔔": ["bell", "util"],
  "🐢": ["snail", "util"],
  "🟢": ["activity", "util"],
  "📉": ["chart-column", "util"],
  "🏠": ["house", "util"],
  "🎛️": ["sliders-horizontal", "own"],
  "🔗": ["link", "own"],
  "👤": ["user", "core"],
  "⚙️": ["settings", "core"],
  "🚪": ["log-out", "mod"],
  "👑": ["crown", "eco"],
};

export function Icon({ name, size = 16, strokeWidth = 2, className = "" }: { name: string; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] ?? "" }}
    />
  );
}

// A glossy colored tile with a white line icon, like an app icon.
export function AppIcon({ emoji, size = 22, className = "" }: { emoji: string; size?: number; className?: string }) {
  const hit = EMOJI[emoji];
  if (!hit) {
    return (
      <span className={`inline-grid place-items-center shrink-0 leading-none ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.68) }} aria-hidden="true">
        {emoji}
      </span>
    );
  }
  const [name, tone] = hit;
  return (
    <span className={`app-tile ${className}`} style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), ["--tc" as string]: COLORS[tone] }} aria-hidden="true">
      <Icon name={name} size={Math.round(size * 0.58)} strokeWidth={2.2} />
    </span>
  );
}
