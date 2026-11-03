"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MATCH_TEXTS, resolveText, type MatchTextEntry, type MatchTextKey } from "@spartacus/shared";
import { NeonCard } from "../ui/NeonCard";
import { api, type MatchPresetRow, type MatchSetupRow, type MatchmakingConfigRow } from "../../lib/api";

export type GuideTab = "setups" | "board" | "queue" | "games" | "voice" | "messages";

const SECTIONS = [
  { id: "start", label: "Start Here" },
  { id: "games", label: "Games" },
  { id: "voice", label: "Voice" },
  { id: "setups", label: "Tournaments and Matches" },
  { id: "board", label: "Leaderboard" },
  { id: "queue", label: "Matchmaking" },
  { id: "messages", label: "Messages" },
  { id: "playing", label: "How Members Play" },
  { id: "fixes", label: "Fixing Problems" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function Heading({ children }: { children: ReactNode }) {
  return <p className="font-medium mt-1">{children}</p>;
}

function Text({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-400 max-w-[70ch]">{children}</p>;
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm text-slate-300">
          <span className="w-6 h-6 shrink-0 rounded-full bg-base-800 text-xs flex items-center justify-center text-neon-blue">{i + 1}</span>
          <span className="min-w-0 pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-slate-300">
          <span className="text-slate-600 shrink-0" aria-hidden>
            •
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{children}</p>;
}

function Table({ rows, heads }: { rows: ReactNode[][]; heads: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h} className="text-left text-[11px] uppercase tracking-wide text-slate-500 font-medium py-1.5 pr-3 border-b border-white/10">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, n) => (
                <td key={n} className={`align-top py-2 pr-3 border-b border-white/5 ${n === 0 ? "text-slate-200" : "text-slate-400"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Discord-style previews, using the same wording the bot posts ----

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="rounded-lg bg-[#313338] p-3 min-w-0">
      <figcaption className="text-[11px] uppercase tracking-wide text-[#949BA4] mb-2">{label}</figcaption>
      <div className="space-y-2">{children}</div>
    </figure>
  );
}

function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>))}
    </>
  );
}

function Embed({ texts, item, fields, children }: { texts: unknown; item: MatchTextKey; fields?: Array<{ name: string; value: string }>; children?: ReactNode }) {
  const entry: MatchTextEntry = MATCH_TEXTS[item];
  const t = resolveText(texts, item, entry.tokens);
  return (
    <div className="rounded border-l-4 bg-[#2B2D31] p-3 text-sm text-[#DBDEE1] space-y-1.5 max-w-[520px]" style={{ borderLeftColor: t.color }}>
      {t.title && <p className="font-semibold text-white break-words">{t.title}</p>}
      {t.description && (
        <p className="whitespace-pre-wrap break-words">
          <Bold text={t.description} />
        </p>
      )}
      {fields && (
        <div className="grid grid-cols-2 gap-2">
          {fields.map((f) => (
            <div key={f.name} className="min-w-0">
              <p className="text-xs font-semibold text-white break-words">{f.name}</p>
              <p className="text-xs whitespace-pre-wrap break-words">{f.value}</p>
            </div>
          ))}
        </div>
      )}
      {children}
      {t.footer && <p className="text-xs text-[#949BA4] break-words">{t.footer}</p>}
    </div>
  );
}

const BUTTON_STYLES = { green: "bg-[#248046]", blue: "bg-[#5865F2]", gray: "bg-[#4E5058]", red: "bg-[#DA373C]" };

function Buttons({ texts, items }: { texts: unknown; items: Array<[MatchTextKey, keyof typeof BUTTON_STYLES]> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([item, style]) => (
        <span key={item} className={`rounded px-3 py-1 text-xs font-medium text-white ${BUTTON_STYLES[style]}`}>
          {resolveText(texts, item).text}
        </span>
      ))}
    </div>
  );
}

function Sidebar() {
  const row = (name: string, live: boolean, cap?: string) => (
    <div key={name} className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm ${live ? "bg-white/5 text-white" : "text-[#949BA4]"}`}>
      <span aria-hidden>🔊</span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {cap && <span className="text-[11px] text-[#949BA4]">{cap}</span>}
    </div>
  );
  return (
    <div className="max-w-[280px]">
      <p className="px-2 text-[11px] font-semibold uppercase text-[#949BA4]">Voice Channels</p>
      {row("Lobby", false)}
      {row("Kuro vs FrostByte", true, "2/2")}
      {row("Night Crew", true, "5/5")}
      {row("Red Line", true, "5/5")}
      {row("General", false)}
    </div>
  );
}

function GoTo({ tab, label, onOpen }: { tab: GuideTab; label: string; onOpen: (tab: GuideTab) => void }) {
  return (
    <button type="button" onClick={() => onOpen(tab)} className="neon-button-sm">
      Open {label}
    </button>
  );
}

function Check({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span aria-hidden className={`mt-0.5 w-4 h-4 shrink-0 rounded-full text-[10px] flex items-center justify-center ${done ? "bg-emerald-500/20 text-emerald-300" : "bg-base-800 text-slate-600"}`}>
        {done ? "✓" : ""}
      </span>
      <span className={done ? "text-slate-400" : "text-slate-200"}>{children}</span>
      <span className="sr-only">{done ? "Done" : "Not done yet"}</span>
    </div>
  );
}

export function MatchmakingGuide({ guildId, onOpen, initial = "start" }: { guildId: string; onOpen: (tab: GuideTab) => void; initial?: SectionId }) {
  const [section, setSection] = useState<SectionId>(initial);
  const [config, setConfig] = useState<MatchmakingConfigRow | null>(null);
  const [setups, setSetups] = useState<MatchSetupRow[]>([]);
  const [games, setGames] = useState<MatchPresetRow[]>([]);

  useEffect(() => {
    api.getMatchmaking(guildId).then((o) => setConfig(o.config));
    api.getMatchSetups(guildId).then(setSetups);
    api.getMatchPresets(guildId).then(setGames);
  }, [guildId]);

  const texts = config?.texts ?? {};
  const index = SECTIONS.findIndex((s) => s.id === section);
  const go = (next: number) => {
    setSection(SECTIONS[next].id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-5 items-start">
      <nav aria-label="Guide sections" className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:sticky lg:top-4">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={s.id === section ? "page" : undefined}
            onClick={() => setSection(s.id)}
            className={`shrink-0 text-left rounded-md px-3 py-2 text-sm transition-colors ${s.id === section ? "bg-base-800 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}
          >
            <span className="text-xs text-slate-600 mr-1.5">{i + 1}</span>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 space-y-5">
        {section === "start" && (
          <>
            <NeonCard>
              <div className="space-y-3">
                <Heading>What this module does</Heading>
                <Text>Matchmaking runs competitive play inside Discord for any game. It has two ways to play, and you can use either one or both.</Text>
                <Table
                  heads={["", "Tournaments and Matches", "Matchmaking board"]}
                  rows={[
                    ["Best for", "Planned events, like a Saturday cup", "Quick games any time"],
                    ["Who starts it", "Staff, a set time, or a full lobby", "Players, by queuing or challenging"],
                    ["Discord event", "Yes, created automatically", "No"],
                    ["Where players go", "A panel in your chosen channel", "An always-open board"],
                    ["Results", "Results channel and Leaderboard", "Match thread and Leaderboard"],
                  ]}
                />
              </div>
            </NeonCard>
            <NeonCard>
              <div className="space-y-3">
                <Heading>Your setup checklist</Heading>
                <Text>This updates from your saved settings, so you can see what's left.</Text>
                <div className="space-y-2">
                  <Check done={games.length > 0}>Add at least one game ({games.length} saved)</Check>
                  <Check done={!!config?.lobbyVoiceId}>Pick your Lobby voice channel</Check>
                  <Check done={setups.length > 0}>Build a tournament or match setup ({setups.length} saved)</Check>
                  <Check done={!!config?.boardChannelId}>Pick your leaderboard channel</Check>
                  <Check done={!!config?.enabled && !!config.channelId}>Turn on the Matchmaking board</Check>
                  <Check done={!!config?.activityChannelId}>Pick a channel for challenges and match threads (optional)</Check>
                </div>
                <Tip>The switch at the top of this page turns the whole module on or off. Keep it on, or nothing posts in Discord.</Tip>
              </div>
            </NeonCard>
            <NeonCard>
              <div className="space-y-3">
                <Heading>Do this in Discord first</Heading>
                <Steps
                  items={[
                    <>
                      Create text channels. A good set is <strong>#matches</strong>, <strong>#match-results</strong>, <strong>#leaderboard</strong>, <strong>#matchmaking</strong> and <strong>#match-activity</strong>.
                    </>,
                    <>
                      In the panel, leaderboard and board channels, turn off <strong>Send Messages</strong> for members and keep <strong>View Channel</strong> on. Buttons still work, and chat can't bury the posts.
                    </>,
                    <>
                      In the channel for match threads, keep <strong>Send Messages in Threads</strong> on so players can talk in their match.
                    </>,
                    <>
                      Create one voice channel called <strong>Lobby</strong>.
                    </>,
                    <>Check that Spartacus has the permissions below, on the server or on those channels and their category.</>,
                  ]}
                />
                <Table
                  heads={["Permission", "What it's for"]}
                  rows={[
                    ["View Channel, Send Messages, Embed Links, Read Message History", "Posting and updating panels"],
                    ["Manage Channels", "Creating and deleting temporary voice channels"],
                    ["Move Members", "Moving players into voice"],
                    ["Manage Events", "Creating Discord events"],
                    ["Create Private Threads, Manage Threads", "Match rooms on the Matchmaking board"],
                    ["Manage Roles", "Private voice channels and champion roles"],
                  ]}
                />
                <Tip>For champion roles, Spartacus's own role must sit above the role it gives. For role pings, turn on "Allow anyone to @mention this role".</Tip>
              </div>
            </NeonCard>
          </>
        )}

        {section === "games" && (
          <NeonCard>
            <div className="space-y-3">
              <Heading>Games tab</Heading>
              <Text>Start here. Adding a game once makes it available in the setup builder, turns on its Leaderboard post, and adds it to the Matchmaking board.</Text>
              <Steps
                items={[
                  <>Tap <strong>+ Add Game</strong>.</>,
                  <>Enter the name, players per team, and what the score counts, like Rounds or Goals.</>,
                  <>Turn on <strong>Use ranks</strong> if the game has them, then list them lowest to highest, separated by commas. With over 25, name them like Gold III and players pick Gold, then Gold III.</>,
                  <>Turn on <strong>Use maps</strong> if the game has maps. You can call them something else, like Stage or Arena.</>,
                  <>Tap <strong>Add Game</strong>.</>,
                ]}
              />
              <Bullets
                items={[
                  <><strong>Edit</strong> updates ranks, maps, team size and scoring for new matches. Saved setups keep their own copies.</>,
                  <>Game names are locked after adding, because results and teams are filed under them. To rename one, remove it and add it again. Its old results stay under the old name.</>,
                  <><strong>Remove</strong> takes the game off the builder and board and deletes its leaderboard post. Past results and saved setups stay. Adding the same name again brings the results back.</>,
                ]}
              />
              <GoTo tab="games" label="Games" onOpen={onOpen} />
            </div>
          </NeonCard>
        )}

        {section === "voice" && (
          <NeonCard>
            <div className="space-y-3">
              <Heading>Voice tab</Heading>
              <Text>Players wait in one Lobby. When a match starts, Spartacus creates temporary channels, moves players in, and cleans up afterward. A 1v1 shares one channel, and each team gets its own.</Text>
              <Frame label="Preview: your voice channels during matches">
                <Sidebar />
              </Frame>
              <Steps
                items={[
                  <>Turn on <strong>Create voice channels for Matchmaking</strong> and pick your <strong>Lobby</strong>.</>,
                  <>Choose <strong>Who gets moved</strong>. Lobby Only moves people in the Lobby and sends everyone else a link. Any Voice Channel pulls players in from anywhere.</>,
                  <>Build the channel names. Type a name, or tap pieces like Team, Game or Number. Tap <strong>+ Text</strong> to add your own words, and use ◀ ▶ to rearrange them.</>,
                  <>Set the number style and user limit, then pick a <strong>1v1 category</strong> and <strong>Team category</strong> to keep them organized.</>,
                  <>Check the preview beside the settings. Switch between 1v1 and Team Match to see both.</>,
                ]}
              />
              <Table
                heads={["Setting", "What it does"]}
                rows={[
                  ["Must be in the Lobby to queue", "Find a Match only works from inside the Lobby"],
                  ["Return players to the Lobby", "Moves everyone back before channels are deleted"],
                  ["Private channels", "Only that match's players can join"],
                  ["User limit", "Match players only, players plus extra spots, or no limit"],
                  ["1v1 and Team categories", "Where each type of channel goes. Left empty, channels appear under the Lobby"],
                  ["Temporary match text channels", "Each tournament match or team match gets a text channel for votes, scores and pings, deleted after the result"],
                  ["Who can see it", "Players and staff only, or everyone can read while only players and staff type"],
                  ["Close the room after", "How long the room stays up after the result. The next tournament match opens once it closes"],
                ]}
              />
              <Tip>A bot can only move someone already connected to voice. Anyone who isn't gets pinged a link instead.</Tip>
              <Text>This Lobby is used everywhere, including tournaments and team matches. Each setup picks its own category in Step 6 of the builder. Names, limits and privacy apply to both.</Text>
              <GoTo tab="voice" label="Voice" onOpen={onOpen} />
            </div>
          </NeonCard>
        )}

        {section === "setups" && (
          <>
            <NeonCard>
              <div className="space-y-3">
                <Heading>Tournaments and Matches tab</Heading>
                <Text>A setup holds all the rules for one game and format. Tap <strong>+ New Setup</strong> and work through the 8 steps. The side panel keeps a running summary.</Text>
                <Table
                  heads={["Step", "What you decide"]}
                  rows={[
                    ["1. Game", "Name the setup, pick a saved game from the Game list or add a new one, and set ranks and score type"],
                    ["2. Format", "Tournament, 1v1 Tournament, Team Match or 1v1, plus the most teams (up to 64, or Unlimited) and whether teams adjust to fit sign-ups"],
                    ["3. Teams", "Team size, how players join, how teams split, captains, roster visibility, and team names"],
                    ["4. Maps", "The map list, and whether players vote, the bot picks, or captains ban"],
                    ["5. Schedule", "Staff start it, a set time, or when the lobby fills, plus the panel and results channels"],
                    ["6. Match Flow", "Timers, check-in, the category for temporary voice channels, and who reports scores"],
                    ["7. Rewards", "Coins and the champion role (off by default), plus ping and staff roles"],
                    ["8. Review", "Check everything, then save"],
                  ]}
                />
                <Text>Saving posts the panel in your channel and creates a Discord event within a few seconds.</Text>
                <Frame label="Preview: the sign-up panel">
                  <Embed texts={texts} item="signup" fields={[{ name: "Players", value: "Kuro · Gold\nFrostByte · Silver\nDeimos · Platinum" }]} />
                  <Buttons texts={texts} items={[["btnSignUp", "green"], ["btnLeave", "red"]]} />
                  <Buttons texts={texts} items={[["btnStats", "gray"], ["btnLeaderboard", "gray"], ["btnResults", "gray"], ["btnStaff", "gray"]]} />
                </Frame>
                <GoTo tab="setups" label="Tournaments and Matches" onOpen={onOpen} />
              </div>
            </NeonCard>
            <NeonCard>
              <div className="space-y-3">
                <Heading>Choices that matter most</Heading>
                <Table
                  heads={["Choice", "Options"]}
                  rows={[
                    ["How players join", "Bot Assigns Teams splits people after sign-ups. Players Choose a Team gives each team its own button, and turns off the bot's balancing"],
                    ["Who can see rosters", "Show Everyone, or Hidden Until Closed. Hidden shows only team counts until registration closes, then the bot posts the rosters. Staff can still see them on this page"],
                    ["How teams split", "Balanced uses rank and results. Captains Draft lets captains pick (tournaments use Balanced instead). Random shuffles everyone"],
                    ["How it starts", "Staff Start It waits for staff. Set a Time starts at your date and time with whoever joined. When Full starts as soon as the lobby fills"],
                    ["Adjust teams to fit sign-ups", "Tournaments only. When it starts, the bot picks the team count and size that uses the most players. With 5-player teams and 8 sign-ups, that's 2 teams of 4. Anyone left over is told they're first in line as a sub"],
                    ["Use timers", "Off means a person starts each step. On adds sign-up, auto-start, score and reopen timers"],
                  ]}
                />
                <Frame label="Preview: hidden rosters during registration">
                  <Embed texts={texts} item="registration" fields={[{ name: "Team 1 (3/5)", value: "🔒 Hidden" }, { name: "Team 2 (1/5)", value: "🔒 Hidden" }]} />
                </Frame>
                <Tip>With timers off, a match can wait at a step until someone acts. Turn on Use timers for hands-off play. A tournament match with no score always alerts staff, since canceling it would end the bracket.</Tip>
              </div>
            </NeonCard>
            <NeonCard>
              <div className="space-y-3">
                <Heading>Running a match</Heading>
                <Steps
                  items={[
                    <>Members sign up on the panel. The first sign-up asks for a rank if ranks are on.</>,
                    <>When the lobby fills, Spartacus pings your roles. With Staff Start It, tap <strong>Staff</strong> on the panel, then <strong>Start Now</strong>.</>,
                    <>Teams are shown with captains marked 👑. A captain or staff member taps <strong>Start Match</strong>.</>,
                    <>The map is picked, the Discord event goes live, and voice channels open.</>,
                    <>A captain reports the score, and the other captain confirms or disputes it.</>,
                    <>The result posts, the leaderboard updates, and voice channels close. Tap <strong>Run It Back</strong> or <strong>New Sign-Ups</strong> for another.</>,
                  ]}
                />
                <Frame label="Preview: a live match">
                  <Embed texts={texts} item="live" fields={[{ name: "🔵 Team Blue", value: "👑 Kuro\nDeimos" }, { name: "🟠 Team Orange", value: "👑 FrostByte\nWraith" }]} />
                </Frame>
                <Heading>Staff controls</Heading>
                <Table
                  heads={["Where", "What you can do"]}
                  rows={[
                    ["Staff button on the panel", "Start Now, Start With Fewer, Skip Check-In, Reroll Teams, End Vote Now, Cancel Match"],
                    ["Live Control on this page", "Cancel the current match"],
                    ["Match History on this page", "Void a result to reverse its wins, rating and coins"],
                    ["/match sub", "Replace a player"],
                    ["/match setrank", "Correct a player's rank"],
                  ]}
                />
                <Text>Staff means anyone with Manage Server, or the staff role from Step 7.</Text>
              </div>
            </NeonCard>
          </>
        )}

        {section === "board" && (
          <NeonCard>
            <div className="space-y-3">
              <Heading>Leaderboard tab</Heading>
              <Text>Each game you switch on gets its own post in one channel, showing the top 10 players and teams. Spartacus edits it after every match, using each player's server name.</Text>
              <Steps
                items={[
                  <>Pick the <strong>category and text channel</strong>.</>,
                  <>Pick a <strong>Post style</strong>. One Clean Post shows a game's Players and Teams side by side. Separate Embeds splits them.</>,
                  <>Under <strong>Games to post</strong>, turn on <strong>All Games</strong>, any single games, or both.</>,
                  <>Check the channel. Posts appear within a few seconds.</>,
                ]}
              />
              <Frame label="Preview: one game's post">
                <Embed texts={texts} item="boardCombined" fields={MATCH_TEXTS.boardCombined.previewFields} />
              </Frame>
              <Bullets
                items={[
                  <>Players are ranked by wins, then win rate.</>,
                  <>Teams count once they have a real name: Matchmaking teams, players' chosen teams, and captain-named teams. Default names like Team Blue and Team 1 are skipped.</>,
                  <>Voiding a result takes it off the leaderboard.</>,
                  <><strong>Start New Season</strong> resets the leaderboard to zero and keeps past results. Ranks and ratings stay.</>,
                  <>Turning a game off deletes its post.</>,
                  <>Each game gets its own color automatically. To change a game's color, wording or logo, open Messages, pick the game, then choose Leaderboard.</>,
                ]}
              />
              <GoTo tab="board" label="Leaderboard" onOpen={onOpen} />
            </div>
          </NeonCard>
        )}

        {section === "queue" && (
          <NeonCard>
            <div className="space-y-3">
              <Heading>Matchmaking tab</Heading>
              <Text>An always-open board where players start matches themselves. There's no event and staff aren't needed.</Text>
              <Steps
                items={[
                  <>Pick the <strong>category and text channel</strong> for the board.</>,
                  <>Pick a <strong>Challenges and match threads channel</strong>. This keeps the board clean. If you leave it empty, they use the board's channel.</>,
                  <>Tap the <strong>games</strong> you want on the board.</>,
                  <>Turn on the switch at the top of the card. The board posts within a few seconds.</>,
                ]}
              />
              <Frame label="Preview: the board">
                <Embed texts={texts} item="boardSolo" fields={[{ name: "Waiting (1)", value: "Kuro · Rainbow Six Siege" }]} />
                <Embed texts={texts} item="boardTeam" fields={[{ name: "Teams waiting (0)", value: "Nobody yet" }]} />
                <Embed texts={texts} item="boardTeamList" fields={[{ name: "Night Crew · Rainbow Six Siege (2/5)", value: "👑 @Kuro\n👤 @FrostByte" }, { name: "Looking for a team (1)", value: "@Ember · Rainbow Six Siege" }]} />
                <Buttons texts={texts} items={[["btnFindSolo", "green"], ["btnChallengeSolo", "blue"], ["btnLeaveSolo", "red"]]} />
                <Buttons texts={texts} items={[["btnFindTeam", "green"], ["btnChallengeTeam", "blue"], ["btnLeaveTeam", "red"]]} />
                <Buttons texts={texts} items={[["btnCreateTeam", "gray"], ["btnMyTeams", "gray"], ["btnLookingForTeam", "gray"], ["btnPickup", "green"]]} />
              </Frame>
              <Table
                heads={["Setting", "Default", "What it does"]}
                rows={[
                  ["Count on the leaderboard", "On", "Turn off to keep matches casual"],
                  ["Challenge expires", "5 minutes", "Drops a challenge nobody answers"],
                  ["Leave queue after", "60 minutes", "Clears anyone who wandered off"],
                  ["Close unreported", "3 hours", "Cancels a match with no result and cleans up"],
                ]}
              />
              <Tip>These timers stay on because there's no staff to clear things. You can change each one.</Tip>
              <Frame label="Preview: a match room">
                <Embed texts={texts} item="room" fields={[{ name: "Kuro", value: "@Kuro" }, { name: "FrostByte", value: "@FrostByte" }]} />
              </Frame>
              <Text>Live Matches, Teams and Match History on this tab let staff cancel a match, disband a team, or void a result. Nothing needs them day to day.</Text>
              <GoTo tab="queue" label="Matchmaking" onOpen={onOpen} />
            </div>
          </NeonCard>
        )}

        {section === "messages" && (
          <NeonCard>
            <div className="space-y-3">
              <Heading>Messages tab</Heading>
              <Text>Change what Spartacus says. Anything you don't touch keeps its default, so you only need to edit what you want different.</Text>
              <Steps
                items={[
                  <><strong>Pick what to change.</strong> Choose <strong>All Games</strong> or one saved game, then a group and an item. A dot marks anything you've customized.</>,
                  <><strong>Edit it.</strong> Embeds have a title, description, footer and color. Tap <strong>Show links, images, author and fields</strong> for everything else. Pings and buttons have wording.</>,
                  <><strong>Check the preview.</strong> It updates as you type and saves by itself, and live panels refresh.</>,
                ]}
              />
              <Table
                heads={["Group", "What's in it"]}
                rows={[
                  ["Matchmaking", "The board, match room, challenge ping, and closing lines"],
                  ["Leaderboard", "Top 10 players and teams"],
                  ["Sign-Ups", "Sign-up panels, start notes, the hidden rosters note, and the lobby full ping"],
                  ["Match Steps", "Check-in, draft, teams, map vote, bans, live, finished, and champion"],
                  ["Results", "Match results, revealed rosters, bracket, and My Stats"],
                  ["Pings", "Check-in, rosters revealed, and join voice"],
                  ["Buttons", "The label on every main button"],
                  ["Labels and Notes", "Headings, round names, deadline sentences and reward notes"],
                ]}
              />
              <Heading>All Games or one game</Heading>
              <Text>All Games is the default for everything. Picking a game lets you change only what's different for it, and the rest keeps using All Games. The shared Matchmaking board and its buttons are edited under All Games, because every game uses them.</Text>
              <Heading>Fill-ins</Heading>
              <Text>Words in curly brackets are swapped for real values. Tap one to add it. Each item shows the ones it supports, and {"{game}"} becomes the game's name, for example.</Text>
              <Bullets
                items={[
                  <>Use <strong>**two stars**</strong> around a word for bold.</>,
                  <>Leave an embed's title, description or footer empty to hide that part.</>,
                  <>Button and ping wording can't be empty, so an empty box uses the default.</>,
                  <><strong>Reset to Default</strong> undoes your changes to that item.</>,
                ]}
              />
              <Tip>Short private replies and error messages can't be changed yet. Keep embeds under about 5,000 characters, because Discord limits a whole embed and player lists need room too.</Tip>
              <GoTo tab="messages" label="Messages" onOpen={onOpen} />
            </div>
          </NeonCard>
        )}

        {section === "playing" && (
          <>
            <NeonCard>
              <div className="space-y-3">
                <Heading>Tournaments and matches</Heading>
                <Steps
                  items={[
                    <>Go to the panel channel and tap <strong>{resolveText(texts, "btnSignUp").text}</strong>, <strong>{resolveText(texts, "btnRegister").text}</strong>, or a team's button.</>,
                    <>Pick your rank the first time, if asked.</>,
                    <>If hidden rosters are on, tap <strong>{resolveText(texts, "btnMyTeam").text}</strong> to see your team. Teammates are revealed when registration closes.</>,
                    <>Join voice before the match so the bot can move you.</>,
                    <>Vote on the map, or ban maps if you're a captain.</>,
                    <>After the match, a captain reports the score and the other captain confirms it.</>,
                  ]}
                />
                <Text>If you can't play once teams are set, tap <strong>{resolveText(texts, "btnSubs").text}</strong> and then I Can't Play. You stay in until someone taps Sub In. If you're a captain, your sub takes over.</Text>
              </div>
            </NeonCard>
            <NeonCard>
              <div className="space-y-3">
                <Heading>Matchmaking board</Heading>
                <Table
                  heads={["To do this", "Tap"]}
                  rows={[
                    ["Find a 1v1", `${resolveText(texts, "btnFindSolo").text}, then pick a game. You're matched at once if someone's waiting, or tagged when they join`],
                    ["Challenge someone", `${resolveText(texts, "btnChallengeSolo").text}, then pick a game and a player`],
                    ["Answer a challenge", `${resolveText(texts, "btnAccept").text} or ${resolveText(texts, "btnDecline").text} on the ping`],
                    ["Create a team", `${resolveText(texts, "btnCreateTeam").text}, name it, then pick teammates. You can leave spots open. Captains create one team per game`],
                    ["Find a team", `${resolveText(texts, "btnLookingForTeam").text} lists you for a game so captains can add you. Tap it again to come off. The list clears after 24 hours`],
                    ["Play now without full teams", `${resolveText(texts, "btnPickup").text} then pick the game. Everyone in your voice channel (or the lobby) and on the Looking for a Team list is filled in, so add or take out players, choose random teams or pick Team 1 yourself, then tap Start Match. Uneven teams like 3v2 are fine. Results count for each player, not for a team`],
                    ["Queue your team", `${resolveText(texts, "btnFindTeam").text}. Only the captain can do this`],
                    ["Manage your team", `${resolveText(texts, "btnMyTeams").text} shows your teams. Captains can rename, change players, invite players (they get a message to accept or decline), add people who are looking, or disband. Players can leave a team there`],
                  ]}
                />
                <Text>Once matched, you get a private thread with the map, players and voice link. Either side reports the winner, and the other side confirms. An unanswered report is accepted after 5 minutes. After two disputes, only staff can report it.</Text>
              </div>
            </NeonCard>
            <NeonCard>
              <div className="space-y-3">
                <Heading>Slash commands</Heading>
                <Table
                  heads={["Command", "What it does"]}
                  rows={[
                    ["/match join", "Signs up for the open match"],
                    ["/match leave", "Leaves the sign-ups"],
                    ["/match stats", "Shows your record and rating"],
                    ["/match leaderboard", "Shows the leaderboard privately"],
                    ["/match sub", "Staff: replaces a player"],
                    ["/match setrank", "Staff: corrects a player's rank"],
                    ["/match setup", "Admins: creates the Matchmaking roles and locks a category to them, after you confirm"],
                  ]}
                />
                <Text>Use these in a match channel. If only one setup exists, they work anywhere. When players choose a team, they join from the panel's team buttons.</Text>
              </div>
            </NeonCard>
          </>
        )}

        {section === "fixes" && (
          <NeonCard>
            <div className="space-y-3">
              <Heading>Fixing problems</Heading>
              <Table
                heads={["Problem", "What to check"]}
                rows={[
                  ["Dashboard looks out of date", "Press Ctrl+Shift+R, or fully close and reopen the page on a phone"],
                  ["Nothing posts", "The module switch at the top of this page, then that Spartacus can see and post in the channel"],
                  ["Matchmaking board missing", "The switch on the Matchmaking card, and that a text channel is picked"],
                  ["No Discord event", "Spartacus needs Manage Events. Panels still work without it"],
                  ["Event shows the wrong time", "Discord needs a start time, so matches staff start are listed an hour ahead and go live when they begin"],
                  ["Nobody gets moved to voice", "Spartacus needs Move Members, and players must be connected. With Lobby Only, they must be in the Lobby"],
                  ["Voice channels aren't created", "Spartacus needs Manage Channels on the category, and Manage Roles if private channels are on"],
                  ["Match text channel isn't created", "Spartacus needs View Channel and Manage Channels on the category, plus Send Messages, Embed Links and Read Message History. The match runs on the panel until that's fixed"],
                  ["A sub can't see the match room", "Spartacus needs Manage Roles to add a sub to a private room"],
                  ["Match threads are public", "Spartacus falls back to public threads if it can't create private ones"],
                  ["Role ping doesn't notify", "Turn on \"Allow anyone to @mention this role\" for that role"],
                  ["Champion role isn't given", "Rewards must be on, and Spartacus's role must sit above the champion role"],
                  ["Coins aren't paid", "Rewards must be on, and the Economy module must be on"],
                  ["A game isn't on the board", "Tap it under Games on the board in the Matchmaking tab"],
                  ["A team isn't on the leaderboard", "Default names like Team Blue are skipped. Use saved or captain-named teams"],
                  ["A match is stuck", "With timers off, it waits for a person. Use the Staff button, or Cancel Current Match in Live Control"],
                  ["Wrong result", "Void it in Match History"],
                ]}
              />
              <Text>Anything else that goes wrong is logged on the Errors page, so check there first.</Text>
            </div>
          </NeonCard>
        )}

        <div className="flex justify-between gap-2">
          {index > 0 ? (
            <button type="button" onClick={() => go(index - 1)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              Back: {SECTIONS[index - 1].label}
            </button>
          ) : (
            <span />
          )}
          {index < SECTIONS.length - 1 && (
            <button type="button" onClick={() => go(index + 1)} className="neon-button">
              Next: {SECTIONS[index + 1].label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
