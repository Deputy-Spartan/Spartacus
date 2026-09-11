// Shared "is this the bot owner's own Discord account" check — same
// OWNER_DISCORD_ID env var the dashboard's access-control system gates on
// (apps/api/src/middleware/requireAuth.ts), so there's exactly one owner
// identity across the dashboard and any owner-only bot command/button.
export function isOwner(userId: string): boolean {
  return !!process.env.OWNER_DISCORD_ID && userId === process.env.OWNER_DISCORD_ID;
}
