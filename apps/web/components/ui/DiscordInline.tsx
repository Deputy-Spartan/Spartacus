import type { DiscordRoleOption } from "../../lib/api";

const CUSTOM_EMOJI = /^<(a?):(\w+):(\d+)>$/;

// Renders an emoji the way Discord does: a server's custom emoji
// (<:name:id> / <a:name:id>) as its image from Discord's CDN, anything else
// (a normal unicode emoji) as plain text.
export function DiscordEmoji({ value, size = 22 }: { value: string; size?: number }) {
  const m = value.match(CUSTOM_EMOJI);
  if (!m) return <span>{value}</span>;
  const [, animated, name, id] = m;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=48`}
      alt={`:${name}:`}
      title={`:${name}:`}
      width={size}
      height={size}
      className="inline-block align-middle object-contain"
    />
  );
}

// A role mention as Discord shows it: "@Name" tinted in the role's color.
// A role that's been deleted shows as "@deleted-role", same as Discord.
export function DiscordRoleMention({ roleId, roles }: { roleId: string; roles: DiscordRoleOption[] }) {
  const role = roles.find((r) => r.id === roleId);
  if (!role) return <span className="rounded px-0.5 bg-[#4e5058]/40 text-[#949ba4] font-medium">@deleted-role</span>;
  const hex = role.color ? `#${role.color.toString(16).padStart(6, "0")}` : null;
  return (
    <span
      className="rounded px-0.5 font-medium"
      style={hex ? { color: hex, backgroundColor: `${hex}1a` } : { color: "#c9cdfb", backgroundColor: "#5865f24d" }}
    >
      @{role.name}
    </span>
  );
}
