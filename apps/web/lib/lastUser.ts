// The last Discord account that signed in on this browser, so the login page
// can say "Welcome back" with their avatar. Only the name and avatar link are
// kept, never the token, and "Not you?" clears it.
export interface LastUser {
  name: string;
  avatarUrl: string | null;
}

const KEY = "spartacus_last_user";

export function rememberLastUser(user: { id: string; username: string; avatar: string | null }) {
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
  try {
    localStorage.setItem(KEY, JSON.stringify({ name: user.username, avatarUrl }));
  } catch {
    // private window: just no welcome back
  }
}

export function readLastUser(): LastUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LastUser;
    return typeof v?.name === "string" ? v : null;
  } catch {
    return null;
  }
}

export function forgetLastUser() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
