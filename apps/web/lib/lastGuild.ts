// The server you last opened on this browser, so signing in can take you
// straight back to it and the server list can mark it "Last used".
const KEY = "spartacus_last_guild";

export function rememberLastGuild(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // private window: nothing remembered
  }
}

export function readLastGuild(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
