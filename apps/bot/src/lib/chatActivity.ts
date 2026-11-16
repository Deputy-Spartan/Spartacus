// Who's been chatting in live stream chats, kept in memory. Twitch chat comes
// in over the anonymous chat connection (modules/stream/twitchChat.ts) and Kick
// chat through Kick's webhooks (modules/stream/kickEvents.ts). Three readers:
//   - viewer rewards ask "who chatted in the last few minutes"
//   - the stream recap asks "who chatted most this stream"
//   - Viewer of the Week drains "messages since you last asked"
// Lost on a restart, which only costs a few minutes of counting.

type Key = string; // "twitch:login" or "kick:slug"
const key = (platform: string, channel: string): Key => `${platform}:${channel.toLowerCase()}`;

const lastSeen = new Map<Key, Map<string, number>>(); // user -> when they last wrote
const thisStream = new Map<Key, Map<string, number>>(); // user -> messages since the stream started
const pending = new Map<Key, Map<string, number>>(); // user -> messages not yet counted for the week

function bump(m: Map<Key, Map<string, number>>, k: Key, user: string, by: number) {
  let inner = m.get(k);
  if (!inner) m.set(k, (inner = new Map()));
  inner.set(user, (inner.get(user) ?? 0) + by);
}

export function recordChat(platform: string, channel: string, user: string) {
  const k = key(platform, channel);
  const u = user.toLowerCase();
  let seen = lastSeen.get(k);
  if (!seen) lastSeen.set(k, (seen = new Map()));
  seen.set(u, Date.now());
  bump(thisStream, k, u, 1);
  bump(pending, k, u, 1);
}

export function chattersSince(platform: string, channel: string, sinceMs: number): string[] {
  const m = lastSeen.get(key(platform, channel));
  if (!m) return [];
  const cutoff = Date.now() - sinceMs;
  return [...m].filter(([, at]) => at >= cutoff).map(([user]) => user);
}

// A new stream starts the per-stream count again.
export function resetStream(platform: string, channel: string) {
  thisStream.delete(key(platform, channel));
}

export function topChatters(platform: string, channel: string, n = 3): Array<{ user: string; messages: number }> {
  const m = thisStream.get(key(platform, channel));
  if (!m) return [];
  return [...m]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([user, messages]) => ({ user, messages }));
}

export function streamMessageCount(platform: string, channel: string): number {
  let total = 0;
  for (const n of thisStream.get(key(platform, channel))?.values() ?? []) total += n;
  return total;
}

// Hands over (and forgets) the messages counted since the last call.
export function drainPending(): Array<{ platform: string; channel: string; user: string; messages: number }> {
  const out: Array<{ platform: string; channel: string; user: string; messages: number }> = [];
  for (const [k, users] of pending) {
    const at = k.indexOf(":");
    for (const [user, messages] of users) out.push({ platform: k.slice(0, at), channel: k.slice(at + 1), user, messages });
  }
  pending.clear();
  return out;
}

// Channels nobody is listening to any more.
export function forgetChannel(platform: string, channel: string) {
  const k = key(platform, channel);
  lastSeen.delete(k);
}

export function forgetOldChatters(olderThanMs: number) {
  const old = Date.now() - olderThanMs;
  for (const m of lastSeen.values()) for (const [u, at] of m) if (at < old) m.delete(u);
}
