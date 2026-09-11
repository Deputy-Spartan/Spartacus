export interface ChangelogEntry {
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
}

// Newest first. Bump LATEST_CHANGELOG_ID (below) whenever an entry is
// added so the dismissible card on Overview reappears for it — dismissal
// is stored per-browser (localStorage) keyed to that id.
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-09-11",
    title: "Dashboard access control",
    description:
      "The dashboard is now invite-only. Requesting access DMs the owner with Approve/Deny buttons, includes an optional message, and notifies you either way.",
  },
  {
    date: "2026-09-10",
    title: "Growth analytics, server templates & more",
    description:
      "New: growth trend charts, cloning module settings between servers, CSV export, ticket transcripts, giveaway reroll, bump reminders, and suggestion analytics.",
  },
  {
    date: "2026-09-10",
    title: "Warn escalation, appeals & voice activity",
    description: "Auto-escalating repeat warnings, a ban/mute appeal flow, a mod accountability digest, voice-time tracking, and achievements.",
  },
];

export const LATEST_CHANGELOG_ID = CHANGELOG[0]?.date ?? "";
