import type { ModuleKey } from "./moduleKeys";

// How to try each module in a test server once !setup-test-modules has run.
// `prepared` is what that command sets up, and `tryIt` is what to do next.
// Keyed by the page's path, matching navItems.ts and pageGuides.ts.
export interface TestGuide {
  prepared: string;
  tryIt: string[];
  // Something the command can't do for you.
  needs?: string;
}

// Roles !setup-test-modules creates. They carry no permissions.
export const TEST_ROLES = {
  staff: "Test Staff",
  verified: "Test Verified",
  rules: "Test Rules Agreed",
  member: "Test Member",
  red: "Test Red",
  blue: "Test Blue",
  level: "Test Level 1",
  ping: "Test Ping",
} as const;

// Private channels made while testing (tickets, reports) go in this category.
export const TEST_TICKETS_CATEGORY = "🧪 test tickets";
export const TEST_AUTOMOD_WORD = "spartacustestword";

export const TEST_GUIDES: Record<string, TestGuide> = {
  "/moderation": {
    prepared: `Audit logs post in this channel. The banned word "${TEST_AUTOMOD_WORD}" is added to Automod.`,
    tryIt: [
      `From an account without a staff role, type ${TEST_AUTOMOD_WORD} in any channel. It's deleted.`,
      "Edit or delete any message. A log entry appears here.",
      "Run /warn, /mute, /kick or /ban on a test account.",
      "Run /purge 5 in a channel with a few messages.",
    ],
    needs: "A second account without staff roles to act on.",
  },
  "/cases": {
    prepared: "Nothing to post. Cases are created by the moderation commands.",
    tryIt: ["Run /warn on a test account with a reason.", "Open Cases & Warnings on the dashboard and find it.", "Tap Export CSV, then delete the case."],
    needs: "A second account to warn.",
  },
  "/reports": {
    prepared: `A Report a Player panel is posted here. Reports open under "${TEST_TICKETS_CATEGORY}" for the ${TEST_ROLES.staff} role.`,
    tryIt: ["Tap Report a Player and fill in the form, or run /report.", "Open the new report channel and tap Claim.", "Send a message in it, then close the report.", "Check the reporter's DMs, and the report on the dashboard."],
  },
  "/mod-digest": {
    prepared: "This is the digest channel, and one digest is requested right away. It posts within a minute.",
    tryIt: ["Wait for the digest to post here.", "Run /warn on a test account, then tap Send Now on the dashboard to see it counted."],
  },
  "/warn-escalation": {
    prepared: "Turned on with the defaults: 3 warnings in 30 days gives a 60 minute timeout.",
    tryIt: ["Run /warn on the same test account 3 times.", "After the third, the account is timed out automatically.", "Check Cases & Warnings for the extra case."],
    needs: "A second account that isn't an admin.",
  },
  "/appeals": {
    prepared: "This is the appeal review channel.",
    tryIt: ["Run /mute on a test account that has DMs open.", "On that account, tap Appeal in the DM and write a reason.", "Approve or deny the appeal when it appears here."],
    needs: "A second account with DMs open.",
  },

  "/ai-moderation": {
    prepared: "Turned on. There's nothing to post.",
    tryIt: ["From a non-staff account, post something clearly against the rules that has no banned words in it.", "It's removed within a few seconds."],
    needs: "An Anthropic API key on the bot. Without one, nothing is removed.",
  },
  "/anti-raid": {
    prepared: "Raid alerts post in this channel. Auto-lockdown is left off.",
    tryIt: ["Lower the Join Rate Limit to 2 on the dashboard.", "Have 2 accounts join within the window.", "An alert appears here. Put the limit back afterwards."],
    needs: "Two or more accounts that can join the server.",
  },
  "/anti-nuke": {
    prepared: "Alerts post in this channel.",
    tryIt: ["Give a test account a role that can delete channels.", "From that account, delete 3 spare channels within a minute.", "An alert appears here and the account's roles are removed."],
    needs: "A second account.",
  },
  "/server-backup": {
    prepared: "Turned on. Backups are made from the dashboard.",
    tryIt: ["On the dashboard, tap + Create New and name a backup.", "Delete a spare role or channel in Discord.", "Restore the backup and confirm. The missing role or channel comes back."],
  },
  "/verification": {
    prepared: `A Verify panel is posted here. Passing gives the ${TEST_ROLES.verified} role.`,
    tryIt: ["Tap Verify, or run /verify.", `Check that you now have the ${TEST_ROLES.verified} role.`, "Remove the role and try again to repeat the test."],
  },
  "/rules-gate": {
    prepared: `A rules message with an I Agree button is posted here. Agreeing gives the ${TEST_ROLES.rules} role.`,
    tryIt: ["Tap I Agree.", `Check that you now have the ${TEST_ROLES.rules} role.`, "Tap it again to see the already agreed reply.", "Open the Activity tab on the dashboard to see your agreement."],
  },
  "/honeypot": {
    prepared: "This is the trap channel. The warning message with its counter and Honeypot Stats button is posted here.",
    tryIt: [
      "Tap Honeypot Stats on the message. Only you see the reply.",
      "Post here as staff. Nothing happens, because Manage Messages is exempt.",
      "From a test account with no staff permissions, post here. It's removed and the counter goes up.",
      "Change the action on the dashboard (Ban, Soft ban, Kick, Timeout) and try again.",
    ],
    needs: "A throwaway second account. Whoever posts here really is removed.",
  },
  "/perm-watch": {
    prepared: "Alerts post in this channel.",
    tryIt: [`Edit the ${TEST_ROLES.red} role and turn on a permission such as Manage Messages.`, "An alert appears here.", "Turn the permission back off."],
  },

  "/welcome": {
    prepared: "This is the welcome channel, with a welcome and goodbye message set. A test welcome is posted.",
    tryIt: ["Check the test welcome above.", "Have a second account join, then leave.", "Tap Send Test on the dashboard after changing the message."],
  },
  "/reaction-roles": {
    prepared: `Two panels are posted here: one with reactions and one with buttons. Both give ${TEST_ROLES.red} and ${TEST_ROLES.blue}. New members get ${TEST_ROLES.member}.`,
    tryIt: ["React 🔴 on the first panel and check your roles.", "Remove the reaction. The role is taken away.", "Tap a button on the second panel, then tap it again."],
  },
  "/sticky-messages": {
    prepared: "A sticky message is set in this channel.",
    tryIt: ["Send a message here.", "The sticky reposts itself below your message.", "Run /sticky preview to see it, or /sticky list."],
  },
  "/starboard": {
    prepared: "This is the starboard channel. The threshold is set to 1 so you can test alone.",
    tryIt: ["Post a message in any other channel.", "React to it with ⭐.", "It's copied here. Raise the threshold on the dashboard when you're done."],
  },
  "/temp-channels": {
    prepared: "This voice channel is the lobby. New rooms are named after whoever joins.",
    tryIt: ["Join this voice channel.", "You're moved into a new room named after you.", "Leave it. The room deletes itself."],
  },
  "/ai-chat": {
    prepared: "AI Chat is limited to this channel.",
    tryIt: ["Mention the bot here and ask it something.", "Mention it in another channel. It stays quiet there."],
    needs: "An Anthropic API key on the bot.",
  },
  "/birthdays": {
    prepared: "Birthday posts go here, and a Set My Birthday button is posted.",
    tryIt: ["Tap Set My Birthday and enter today's date.", "Tap Send Test on the dashboard to see the post.", "Run /birthday view, then /birthday remove."],
  },
  "/member-milestones": {
    prepared: "This is the milestones channel.",
    tryIt: ["Nothing can be forced here. It posts once a day for members whose join date is exactly 1 or more years ago."],
    needs: "A member with a join anniversary today.",
  },
  "/confessions": {
    prepared: "This is the anonymous channel.",
    tryIt: ["Run /confess with a message, from any channel.", "It appears here with a number and no name."],
  },

  "/matches": {
    prepared: "Turned on. Matchmaking has its own setup on the dashboard.",
    tryIt: ["Open Matchmaking on the dashboard and follow its Guide tab.", "Add a game on the Games tab.", "On the Matchmaking tab, pick this channel and turn the board on.", "Use the board's buttons here to find a 1v1."],
    needs: "A second account to play against.",
  },
  "/events": {
    prepared: "This is the default event channel. A test event starting in 2 hours is posted.",
    tryIt: ["Tap an RSVP button on the event.", "Tap a different one to switch.", "Edit the event on the dashboard and watch the post update.", "Run /event list."],
  },
  "/lfg": {
    prepared: "The !lfg and /lfg command is locked to this channel.",
    tryIt: ["Join any voice channel.", "Type !lfg need 2 more here, or run /lfg.", "Try it without being in voice to see the error message."],
  },
  "/playing-now": {
    prepared: "Turned on, but not set up. It needs its channel and two roles picked on the dashboard.",
    tryIt: [
      "On the dashboard, open Playing Now, pick this channel and tap Make the roles for me, then Save.",
      "Wait for the panel to appear here, then tap I'm on now and post.",
      "From a second account, tap Join on the post, then tap Notify me.",
      "Tap I'm done and check the post clears.",
    ],
    needs: "A second account to join the post.",
  },
  "/giveaways": {
    prepared: "A test giveaway that ends in 10 minutes is posted here.",
    tryIt: ["Tap Enter.", "Wait for it to end and announce a winner.", "Run /giveaway-reroll with the giveaway's message ID."],
  },
  "/polls": {
    prepared: "A test poll with 3 options is posted here.",
    tryIt: ["React to vote, then switch your vote.", "Tap Stop Now under Active Polls on the dashboard to see the final results."],
  },
  "/counting-game": {
    prepared: "This is the counting channel.",
    tryIt: ["Type 1.", "Type 2 from a second account, because nobody can count twice in a row.", "Type a wrong number to see the reset."],
    needs: "A second account to take turns.",
  },

  "/embed-creator": {
    prepared: 'A saved embed named "Test Embed" is created and sent here.',
    tryIt: ["Open Embed Creator on the dashboard and edit Test Embed.", "Add a button row, save it, and send it to this channel again.", "Pick Test Embed as the saved embed on another module's page."],
  },
  "/announcements": {
    prepared: "One announcement is published here, and a second one is waiting in the queue.",
    tryIt: ["Open Announcements on the dashboard.", "Tap Publish Now on the queued one.", "Use Resend under Recently Sent to post a copy."],
  },
  "/quote-of-the-day": {
    prepared: "Quotes post in this channel and questions post in #question-of-the-day, both daily. Today's quote and question are posted now.",
    tryIt: [
      "Check today's quote here and today's question in #question-of-the-day. The question opens a thread for answers.",
      "On the dashboard, change the embed and tap Send Test.",
      "Add a quote of your own, set the order to In order, and tap Post Now.",
      "Set both tabs to the same channel to see them post together.",
    ],
  },
  "/stream-alerts": {
    prepared: "Turned on. A creator has to be added on the dashboard.",
    tryIt: ["Tap + Create New on the dashboard.", "Add a Twitch channel that's live right now, with this channel's ID.", "The alert posts here within a few minutes."],
    needs: "A creator who is live, and Twitch or YouTube keys on the bot.",
  },
  "/commands": {
    prepared: "A custom command !hello is created.",
    tryIt: ["Type !hello in any channel.", "Add another command on the dashboard and try it."],
  },
  "/bump-reminder": {
    prepared: "This is the reminder channel.",
    tryIt: ["Run Disboard's /bump here.", "A reminder posts here 2 hours later."],
    needs: "Disboard in the server.",
  },
  "/partnerships": {
    prepared: "Nothing to post. This is a list kept on the dashboard.",
    tryIt: ["Add a partner server on the dashboard.", "Check that it shows in the list."],
  },

  "/economy-hub": {
    prepared: `Levels, Prestige, Voice Activity, Achievements, Profile Cards and Coins are all turned on. Level-up and achievement posts go in this channel, reaching level 1 gives the ${TEST_ROLES.level} role, and the prestige max level is 2 if it hadn't been set.`,
    tryIt: [
      "Chat in any channel. XP is given at most once a minute, and your level-up card appears here.",
      `At level 1, check that you have the ${TEST_ROLES.level} role.`,
      "Run /rank, /leaderboard and /profile.",
      "Run /balance and /daily, then /pay to send coins to another account.",
      "Reach the max level and run /prestige.",
      "On the dashboard, open Economy Hub → Shop, add the starter items and turn the shop on, then run /shop and /crates.",
      "Sit in a voice channel for a few minutes, then check the Boosts and Leaderboards tabs.",
    ],
    needs: "A second account for /pay.",
  },

  "/weekly-recap": {
    prepared: "This is the recap channel, and a test recap is posted.",
    tryIt: ["Check the test recap above.", "Earn some XP and coins, then tap Send Test on the dashboard."],
  },
  "/growth-analytics": {
    prepared: "Turned on. Snapshots are taken once a day at midnight UTC.",
    tryIt: ["Send a few messages today.", "Check the charts on the dashboard tomorrow."],
  },
  "/suggestion-analytics": {
    prepared: "This is the digest channel. Suggestions is turned on too.",
    tryIt: ["Run /suggest here.", "React 👍 on the suggestion.", "Run /approve-suggestion with the ID from its footer."],
  },

  "/tickets": {
    prepared: `A ticket panel with one type, Test Support, is posted here. Tickets open under "${TEST_TICKETS_CATEGORY}".`,
    tryIt: ["Tap Test Support on the panel.", "Open the new ticket channel and send a message.", "Tap Claim, then Close.", "Find the transcript on the dashboard."],
  },
  "/applications": {
    prepared: "An application panel with one type, Test Application, is posted here. Finished applications are reviewed in this channel.",
    tryIt: ["Tap Test Application.", "Answer the 2 questions the bot DMs you.", "Accept or deny the application when it appears here."],
    needs: "DMs open on the account applying.",
  },
  "/support-intake": {
    prepared: `A support category named Test Support is created with 2 questions. Its tickets open under "${TEST_TICKETS_CATEGORY}".`,
    tryIt: ["DM the bot anything.", "Tap Test Support and answer both questions.", "Reply in the ticket channel that opens. The reply reaches your DMs.", "Close the ticket."],
    needs: "DMs open with the bot.",
  },

  "/role-manager": {
    prepared: "Turned on. Nothing to post; it works from the dashboard and /role.",
    tryIt: [
      `Run /role give on a second account with the ${TEST_ROLES.member} role and a time of 2m.`,
      "Run /role list for that account.",
      "Wait two minutes and check the role is taken off again.",
      "Open Role Manager on the dashboard and check History shows both changes.",
    ],
    needs: "A second account to give the role to.",
  },
  "/channel-locks": {
    prepared: 'This channel is locked: messages containing the word "blocked" are removed, with a notice.',
    tryIt: ['From a non-staff account, send a message containing "blocked" here.', "It's deleted and a notice button appears.", "Change what's allowed on the dashboard and try again."],
  },
  "/slow-mode": {
    prepared: "Slow mode is set to 10 seconds in this channel.",
    tryIt: ["From a non-staff account, send 2 messages in a row.", "Turn it off under Active Slow Mode Channels on the dashboard."],
    needs: "A non-staff account. Staff aren't slowed.",
  },
  "/stat-channels": {
    prepared: "A locked voice channel showing the member count is created at the top of the server.",
    tryIt: ["Find the Members voice channel at the top of the channel list.", "It updates every 10 minutes."],
  },
  "/status-channel": {
    prepared: "The live status embed posts here within a minute.",
    tryIt: ["Wait for the status embed.", "Set a manual status in the Command Center and watch it change."],
  },
  "/server-templates": {
    prepared: "Turned on. Copying is done from the dashboard.",
    tryIt: ["Only test this with a second server you manage, because it overwrites which modules are on here."],
    needs: "A second server.",
  },
};

// Modules with no dashboard page. !setup-test-server gives each a channel
// under this category so they have somewhere to be tested.
export const EXTRAS_CATEGORY = "🧪 commands & extras";

export const EXTRA_GUIDES: Partial<Record<ModuleKey, { title: string; purpose: string } & TestGuide>> = {
  RANK_CARDS: {
    title: "Rank Cards",
    purpose: "Members see their level and XP as an image.",
    prepared: "Turned on.",
    tryIt: ["Run /rank.", "Run /rank on another member."],
  },
  REMINDERS: {
    title: "Reminders",
    purpose: "Members set a personal reminder.",
    prepared: "Turned on.",
    tryIt: ["Run /remindme 1m test.", "A DM arrives a minute later."],
  },
  SUGGESTIONS: {
    title: "Suggestions",
    purpose: "Members post suggestions for others to vote on.",
    prepared: "Turned on.",
    tryIt: ["Run /suggest here.", "Run /approve-suggestion or /deny-suggestion with the ID from its footer."],
  },
  QUARANTINE: {
    title: "Quarantine",
    purpose: "Staff strip a member's roles until they're released.",
    prepared: "Turned on.",
    tryIt: ["Run /quarantine on a test account.", "Check that its roles are gone.", "Run /release to give them back."],
    needs: "A second account with a role or two.",
  },
  TRIVIA: {
    title: "Trivia",
    purpose: "A trivia question to answer in chat.",
    prepared: "Turned on, along with Economy.",
    tryIt: ["Run /trivia and answer."],
  },
  CASINO: {
    title: "Casino",
    purpose: "Coin flip and slots, wagering server currency.",
    prepared: "Turned on, along with Economy.",
    tryIt: ["Run /daily to get coins.", "Run /coinflip 10 heads.", "Run /slots 10."],
  },
  ROLE_PERSISTENCE: {
    title: "Role Persistence",
    purpose: "Members get their roles back when they rejoin.",
    prepared: "Turned on.",
    tryIt: ["Give a test account a role.", "Have it leave and rejoin.", "The role comes back."],
    needs: "A second account.",
  },
  INVITE_TRACKING: {
    title: "Invite Tracking",
    purpose: "Counts who invited each new member.",
    prepared: "Turned on.",
    tryIt: ["Create an invite link.", "Have a second account join with it."],
    needs: "A second account.",
  },
};
