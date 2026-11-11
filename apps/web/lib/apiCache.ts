// Remembers what the API sent so pages you've already opened show their
// saved values straight away, then quietly checks for anything newer.
//
// Rules:
// - Right after you open a page (the first 2 seconds), a remembered answer is
//   served at once and refreshed in the background.
// - After that (polls, refresh after an action) it always asks the API.
// - Any save, create or delete forgets the remembered answers for that part
//   of the dashboard, so nothing old shows after a change.
// - If the background check finds something newer before you've touched the
//   page, the page reloads its values once, so it's never left showing old data.

const MAX_AGE = 10 * 60 * 1000; // never serve anything older than 10 minutes
const BURST = 2000; // how long after opening a page its loads count as "opening"
const RECHECK_AFTER = 1500; // answers newer than this aren't rechecked
const NO_CACHE = [/^\/access-status/, /^\/auth/, /^\/logout/, /^\/me\/prefs/, /\/setup-status$/];

interface Entry {
  json: string;
  at: number;
  checkedNav: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string>>();
let navId = 0;
let navStart = 0;
let pending = 0;
let background = false;
const idleWaiters = new Set<() => void>();
const changeListeners = new Set<(nav: number) => void>();

const clone = <T>(json: string): T => (json === "" ? undefined : JSON.parse(json)) as T;

// Logging in or out starts with nothing remembered.
export function clearApiCache() {
  cache.clear();
}
const settle = () => {
  if (pending === 0) for (const done of [...idleWaiters]) done();
};

export function cacheable(path: string) {
  return !NO_CACHE.some((r) => r.test(path));
}

// The part of the dashboard a path belongs to, like /guilds/123/tickets.
function area(path: string) {
  const clean = path.split("?")[0];
  const parts = clean.split("/").filter(Boolean);
  return parts[0] === "guilds" ? `/guilds/${parts[1]}/${parts[2] ?? ""}` : `/${parts[0] ?? ""}`;
}

export function forgetArea(path: string) {
  const a = area(path);
  for (const key of [...cache.keys()]) if (area(key) === a) cache.delete(key);
  // After a change, this page always asks the API, whatever it loads next.
  navStart = 0;
}

// Called by the page gate each time a page opens.
export function beginNavigation() {
  navId += 1;
  navStart = Date.now();
  return navId;
}

export function currentNavigation() {
  return navId;
}

export function pendingLoads() {
  return pending;
}

// Wait until every load a page started has finished.
export function whenIdle(): Promise<void> {
  if (pending === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      idleWaiters.delete(done);
      resolve();
    };
    idleWaiters.add(done);
  });
}

export function onFresherData(cb: (nav: number) => void) {
  changeListeners.add(cb);
  return () => void changeListeners.delete(cb);
}

// Loads started inside `fn` (preloads, hover) never hold up the page gate.
export function inBackground<T>(fn: () => T): T {
  background = true;
  try {
    return fn();
  } finally {
    background = false;
  }
}

function track<T>(p: Promise<T>, counted: boolean): Promise<T> {
  if (!counted) return p;
  pending += 1;
  return p.finally(() => {
    pending -= 1;
    // A page often starts its next load when one finishes, so wait a tick.
    setTimeout(settle, 30);
  });
}

function load(path: string, fetchText: () => Promise<string>): Promise<string> {
  let p = inflight.get(path);
  if (!p) {
    p = fetchText().then((json) => {
      cache.set(path, { json, at: Date.now(), checkedNav: navId });
      return json;
    });
    p.finally(() => inflight.delete(path)).catch(() => null);
    inflight.set(path, p);
  }
  return p;
}

export function cachedGet<T>(path: string, fetchText: () => Promise<string>): Promise<T> {
  const counted = !background;
  const now = Date.now();
  const e = cache.get(path);
  if (e && now - e.at < MAX_AGE && now - navStart < BURST) {
    if (e.checkedNav !== navId && now - e.at > RECHECK_AFTER) {
      e.checkedNav = navId;
      const nav = navId;
      const before = e.json;
      load(path, fetchText)
        .then((json) => {
          if (json !== before) for (const cb of changeListeners) cb(nav);
        })
        .catch(() => null);
    }
    return Promise.resolve(clone<T>(e.json));
  }
  return track(load(path, fetchText), counted).then((json) => clone<T>(json));
}
