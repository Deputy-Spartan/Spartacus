// Simple human-readable duration parser: "10m", "2h", "1d", "1w".
// Returns milliseconds, or null if the string can't be parsed or exceeds
// the cap.
const UNIT_MS: Record<string, number> = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

const MAX_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function parseDuration(input: string): number | null {
  const match = /^(\d+)\s*(m|h|d|w)$/i.exec(input.trim());
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const ms = amount * UNIT_MS[unit];
  if (ms <= 0 || ms > MAX_DURATION_MS) return null;

  return ms;
}
