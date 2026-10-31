// Time zone helpers for the date/time pickers. All stored times are real
// instants (UTC ISO strings); these convert to and from the clock time
// someone reads in a chosen zone, with daylight saving handled by the
// browser's own zone data (the offset depends on the date, not just the zone).

export interface TimeZoneOption {
  zone: string;
  label: string;
  // Extra words the search should match, e.g. "est" for Eastern Time.
  terms?: string;
}

const COMMON_ZONES: TimeZoneOption[] = [
  { zone: "America/New_York", label: "Eastern Time (New York)", terms: "est edt et usa" },
  { zone: "America/Chicago", label: "Central Time (Chicago)", terms: "cst cdt ct usa" },
  { zone: "America/Denver", label: "Mountain Time (Denver)", terms: "mst mdt mt usa" },
  { zone: "America/Phoenix", label: "Arizona (no daylight saving)", terms: "mst phoenix usa" },
  { zone: "America/Los_Angeles", label: "Pacific Time (Los Angeles)", terms: "pst pdt pt usa" },
  { zone: "America/Anchorage", label: "Alaska", terms: "akst akdt usa" },
  { zone: "Pacific/Honolulu", label: "Hawaii", terms: "hst usa" },
  { zone: "America/Halifax", label: "Atlantic Time (Halifax)", terms: "ast adt canada" },
  { zone: "America/St_Johns", label: "Newfoundland", terms: "nst ndt canada" },
  { zone: "America/Sao_Paulo", label: "Brazil (São Paulo)", terms: "brt" },
  { zone: "UTC", label: "UTC", terms: "gmt coordinated universal" },
  { zone: "Europe/London", label: "UK (London)", terms: "gmt bst britain england ireland" },
  { zone: "Europe/Paris", label: "Central Europe (Paris, Berlin)", terms: "cet cest germany france spain italy" },
  { zone: "Europe/Athens", label: "Eastern Europe (Athens)", terms: "eet eest greece" },
  { zone: "Europe/Moscow", label: "Moscow", terms: "msk russia" },
  { zone: "Asia/Dubai", label: "Dubai", terms: "gst uae" },
  { zone: "Asia/Kolkata", label: "India", terms: "ist kolkata mumbai delhi" },
  { zone: "Asia/Shanghai", label: "China (Shanghai)", terms: "cst beijing" },
  { zone: "Asia/Singapore", label: "Singapore", terms: "sgt" },
  { zone: "Asia/Tokyo", label: "Japan (Tokyo)", terms: "jst" },
  { zone: "Asia/Seoul", label: "Korea (Seoul)", terms: "kst" },
  { zone: "Australia/Perth", label: "Australia (Perth)", terms: "awst" },
  { zone: "Australia/Sydney", label: "Australia (Sydney)", terms: "aest aedt" },
  { zone: "Pacific/Auckland", label: "New Zealand (Auckland)", terms: "nzst nzdt" },
];

function cityName(zone: string): string {
  return zone.slice(zone.lastIndexOf("/") + 1).replace(/_/g, " ");
}

// The common zones first, then every other zone the browser knows by city.
export function allTimeZones(): TimeZoneOption[] {
  const listed = new Set(COMMON_ZONES.map((o) => o.zone));
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  const others = supported
    .filter((zone) => !listed.has(zone))
    .map((zone) => ({ zone, label: cityName(zone), terms: zone.replace(/[_/]/g, " ").toLowerCase() }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...COMMON_ZONES, ...others];
}

export function timeZoneLabel(zone: string): string {
  return COMMON_ZONES.find((o) => o.zone === zone)?.label ?? cityName(zone);
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

// How far ahead of UTC this zone's clock is at that moment, in milliseconds.
function zoneOffsetMs(ms: number, zone: string): number {
  const parts: Record<string, number> = {};
  for (const p of partsFormatter(zone).formatToParts(new Date(ms))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  // Not Date.UTC: it reads years 0-99 as 19xx, and a half-typed year passes
  // through those on its way to 2026.
  const clock = new Date(0);
  clock.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  clock.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return clock.getTime() - Math.floor(ms / 1000) * 1000;
}

// "2026-11-01T20:00" on a clock in `zone` to a UTC ISO string. The offset is
// measured twice because the first guess can land on the wrong side of a
// daylight saving change.
export function wallTimeToUtc(wall: string, zone: string): string {
  const asIfUtc = Date.parse(`${wall}:00Z`);
  if (Number.isNaN(asIfUtc)) return "";
  const firstGuess = asIfUtc - zoneOffsetMs(asIfUtc, zone);
  return new Date(asIfUtc - zoneOffsetMs(firstGuess, zone)).toISOString();
}

// A UTC ISO string to what a datetime-local input should show for `zone`.
export function utcToWallTime(iso: string, zone: string): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  return new Date(ms + zoneOffsetMs(ms, zone)).toISOString().slice(0, 16);
}

export function utcOffsetLabel(ms: number, zone: string): string {
  const minutes = Math.round(zoneOffsetMs(ms, zone) / 60000);
  if (minutes === 0) return "UTC";
  const abs = Math.abs(minutes);
  const mins = abs % 60;
  return `UTC${minutes < 0 ? "-" : "+"}${Math.floor(abs / 60)}${mins ? `:${String(mins).padStart(2, "0")}` : ""}`;
}

// e.g. "Nov 1, 2026, 8:00 PM EST". Leave the zone out for the viewer's own.
export function formatDateTime(iso: string, zone?: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: zone,
  });
}
