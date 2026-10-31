// Two people clicking at once would otherwise both load the same state and
// the second save would wipe the first, so actions on one thing run in turn.
const queues = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).then(run, run);
  queues.set(key, next.catch(() => null));
  return next;
}
