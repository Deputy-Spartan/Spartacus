"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { FormError } from "../../../../components/ui/FormError";
import { MatchmakingGuide } from "../../../../components/matchmaking/MatchmakingGuide";
import { DateTimeZoneField } from "../../../../components/ui/DateTimeZoneField";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { MATCH_TEXTS, MATCH_TEXT_GROUPS, VOICE_TOKENS, gameColor, rankListProblem, renderVoiceName, resolveText, textsForGame, type MatchTextEntry, type MatchTextKey, type TextField, type TextOverride } from "@spartacus/shared";
import { api, type DiscordChannels, type MatchPresetInput, type MatchPresetRow, type MatchResultRow, type MatchSetupInput, type MatchSetupRow, type MatchmakingConfigRow, type MatchmakingOverview } from "../../../../lib/api";

const STEPS = ["Game", "Format", "Teams", "Maps", "Schedule", "Match Flow", "Rewards", "Review"];
const NEW_GAME = "__new_game__";
const BLANK_GAME = { game: "", teamSize: 5, useRanks: false, ranks: [] as string[], useMaps: false, maps: [] as string[], mapWord: "Map", scoreName: "Points" };

const BLANK: MatchSetupInput = {
  name: "",
  enabled: true,
  format: "SINGLE",
  tournamentTeams: 4,
  balance: "BALANCED",
  captainRule: "TOP",
  team1Name: "Team Blue",
  team2Name: "Team Orange",
  mapMethod: "VOTE",
  mapChoices: 3,
  voteSeconds: 0,
  skipRecent: 0,
  checkIn: false,
  checkInSeconds: 120,
  autoMove: true,
  reportBy: "BOTH",
  lobbyVoiceId: null,
  rewardsEnabled: false,
  joinMode: "ASSIGN",
  rosterView: "PUBLIC",
  teamNames: [],
  startMode: "MANUAL",
  startAt: null,
  useTimers: false,
  teamNaming: "SET",
  autoStartSeconds: 120,
  reportMinutes: 90,
  noReportAction: "CANCEL",
  signupMinutes: 240,
  autoReopenHours: 24,
  winCoins: 100,
  lossCoins: 25,
  championCoins: 500,
  championRoleId: null,
  pingRoleId: null,
  staffRoleId: null,
  panelChannelId: "",
  resultsChannelId: "",
  ...BLANK_GAME,
};

const PHASES: Record<string, string> = { SIGNUP: "Sign-ups open", CHECKIN: "Check-in running", DRAFT: "Captains drafting", TEAMS: "Teams set", MAP: "Picking the map", LIVE: "Match live", CONFIRM: "Waiting for confirmation", DONE: "Finished" };

function formatSummary(s: MatchSetupInput): string {
  const players = s.teamSize * (s.format === "SINGLE" ? 2 : s.tournamentTeams);
  const format = s.format === "SINGLE" ? (s.teamSize === 1 ? "1v1" : "Team Match") : `Tournament, ${s.tournamentTeams} ${s.teamSize === 1 ? "players" : "teams"}`;
  return `${s.teamSize}v${s.teamSize} · ${format} · ${players} players`;
}

function mapSummary(s: MatchSetupInput): string {
  if (!s.useMaps) return "Not used";
  if (s.mapMethod === "RANDOM") return `Bot picks 1 at random from ${s.maps.length}`;
  if (s.mapMethod === "BANS") return `Bot picks ${s.mapChoices} of ${s.maps.length}, captains ban down to 1`;
  return `Bot picks ${s.mapChoices} of ${s.maps.length}, players vote for ${s.voteSeconds} seconds`;
}

function stepError(step: number, d: MatchSetupInput): string | null {
  if (step === 0) {
    if (!d.name.trim()) return "Give this setup a name, like Friday Night 5v5.";
    if (!d.game.trim()) return "Pick the game this setup is for.";
    if (d.useRanks && d.ranks.length < 2) return "Add at least 2 ranks, or turn ranks off.";
    if (d.useRanks && rankListProblem(d.ranks)) return rankListProblem(d.ranks);
  }
  if (step === 2 && (!Number.isInteger(d.teamSize) || d.teamSize < 1 || d.teamSize > 10)) return "Team size must be from 1 to 10.";
  if (step === 3 && d.useMaps) {
    if (d.maps.length < 1) return "Add at least 1 option to the list.";
    if (d.mapMethod !== "RANDOM") {
      const most = Math.min(20, d.maps.length);
      if (d.maps.length < 2) return "Voting and bans need at least 2 options in the list.";
      if (d.mapChoices < 2 || d.mapChoices > most) return `Options to pick must be from 2 to ${most}.`;
      if (d.voteSeconds !== 0 && (d.voteSeconds < 10 || d.voteSeconds > 300)) return "Voting time must be 0 or from 10 to 300 seconds.";
    }
    if (d.skipRecent < 0 || d.skipRecent > d.maps.length - 1) return `Skip recent must be from 0 to ${d.maps.length - 1}.`;
  }
  if (step === 4) {
    if (d.startMode === "SCHEDULED" && !d.startAt) return "Pick a start date and time.";
    if (!d.panelChannelId || !d.resultsChannelId) return "Pick a panel channel and a results channel.";
    if (d.panelChannelId === d.resultsChannelId) return "The panel and results need different channels.";
  }
  if (step === 5) {
    if (d.autoMove && !d.lobbyVoiceId) return "Pick the main voice channel, or turn off team voice channels.";
    if (d.useTimers) {
      const offOr = (v: number, min: number, max: number) => v === 0 || (Number.isInteger(v) && v >= min && v <= max);
      if (d.checkIn && d.format === "SINGLE" && (d.checkInSeconds < 15 || d.checkInSeconds > 600)) return "Check-in time must be from 15 to 600 seconds.";
      if (!offOr(d.signupMinutes, 5, 10080)) return "Sign-up time must be 0 or from 5 to 10080 minutes.";
      if (!offOr(d.autoStartSeconds, 15, 600)) return "Auto-start must be 0 or from 15 to 600 seconds.";
      if (!offOr(d.reportMinutes, 5, 720)) return "Score deadline must be 0 or from 5 to 720 minutes.";
      if (!Number.isInteger(d.autoReopenHours) || d.autoReopenHours < 0 || d.autoReopenHours > 720) return "Reopen time must be from 0 to 720 hours.";
    }
  }
  if (step === 6 && d.rewardsEnabled && [d.winCoins, d.lossCoins, d.championCoins].some((c) => !Number.isInteger(c) || c < 0)) return "Coin rewards must be whole numbers of 0 or more.";
  return null;
}

const inputClass = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";

const SCORE_TYPES = ["Rounds", "Maps", "Games", "Goals", "Points", "Kills", "Wins", "Stocks", "Sets"];

// Common answers in a list, with a box for anything else.
function ScoreSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [custom, setCustom] = useState(false);
  const typing = custom || !SCORE_TYPES.includes(value);
  return (
    <>
      <select
        className={inputClass}
        aria-label="What the score counts"
        value={typing ? "__custom__" : value}
        onChange={(e) => {
          const next = e.target.value;
          setCustom(next === "__custom__");
          onChange(next === "__custom__" ? "" : next);
        }}
      >
        {SCORE_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
        <option value="__custom__">+ Custom</option>
      </select>
      {typing && <input className={`${inputClass} mt-2`} aria-label="Custom score name" value={value} maxLength={30} onChange={(e) => onChange(e.target.value)} placeholder="What does the score count?" />}
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">{children}</label>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-600 mt-1">{children}</p>;
}

function Choice({ on, title, hint, onClick, onRemove, check }: { on: boolean; title: string; hint: string; onClick: () => void; onRemove?: () => void; check?: boolean }) {
  return (
    <div className="relative">
      <button type="button" onClick={onClick} className={`w-full h-full text-left rounded-lg border p-3 ${onRemove ? "pr-16" : check ? "pr-9" : ""} transition-colors ${on ? "border-neon-blue bg-base-800" : "border-white/10 bg-base-950 hover:border-white/25"}`}>
        <span className="block text-sm font-medium break-words">{title}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>
      </button>
      {check && (
        <span aria-label="Active" className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
          ✓
        </span>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${title}`} className="absolute top-2 right-2 px-1.5 py-1 text-[11px] text-slate-500 hover:text-rose-400">
          Remove
        </button>
      )}
    </div>
  );
}

function Toggle({ on, label, hint, onChange }: { on: boolean; label: string; hint: string; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <ToggleSwitch enabled={on} onChange={onChange} label={label} />
    </div>
  );
}

function SetupBuilder({ guildId, editing, onDone, onCancel }: { guildId: string; editing: MatchSetupRow | null; onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<MatchSetupInput>(editing ?? BLANK);
  const [ranksText, setRanksText] = useState((editing?.ranks ?? []).join(", "));
  const [teamNamesText, setTeamNamesText] = useState((editing?.teamNames ?? []).join(", "));
  const [mapDraft, setMapDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [presets, setPresets] = useState<MatchPresetRow[]>([]);
  const [typingGame, setTypingGame] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    api.getMatchPresets(guildId).then(setPresets);
  }, [guildId]);

  async function removePreset(p: MatchPresetRow) {
    if (!(await confirm(`Remove ${p.game} from this list? Setups you already saved won't change.`, { confirmLabel: "Remove" }))) return;
    try {
      await api.deleteMatchPreset(guildId, p.id);
      setPresets((list) => list.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove this preset.");
    }
  }

  function applyPreset({ game, teamSize, useRanks, ranks, useMaps, maps, mapWord, scoreName }: typeof BLANK_GAME) {
    set({ game, teamSize, useRanks, ranks, useMaps, maps, mapWord, scoreName });
    setRanksText(ranks.join(", "));
    setTypingGame(!game);
  }

  function pickGame(value: string) {
    if (value === NEW_GAME) return applyPreset(BLANK_GAME);
    const preset = presets.find((p) => p.game === value);
    if (preset) applyPreset(preset);
    else set({ game: value });
  }

  const set = (patch: Partial<MatchSetupInput>) => {
    setD((prev) => ({ ...prev, ...patch }));
    setError(null);
  };
  const num = (key: keyof MatchSetupInput) => ({
    type: "number",
    className: inputClass,
    value: String(d[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [key]: Number(e.target.value) } as Partial<MatchSetupInput>),
  });

  function goTo(target: number) {
    for (let i = step; i < target; i++) {
      const problem = stepError(i, d);
      if (problem) {
        setStep(i);
        setError(problem);
        return;
      }
    }
    setError(null);
    setStep(target);
  }

  function addMaps() {
    const names = mapDraft.split(",").map((m) => m.trim()).filter(Boolean);
    set({ maps: [...new Set([...d.maps, ...names])] });
    setMapDraft("");
  }

  async function save() {
    for (let i = 0; i < STEPS.length - 1; i++) {
      const problem = stepError(i, d);
      if (problem) {
        setStep(i);
        setError(problem);
        return;
      }
    }
    setSaving(true);
    try {
      if (editing) await api.updateMatchSetup(guildId, editing.id, d);
      else await api.addMatchSetup(guildId, d);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save this setup.");
    } finally {
      setSaving(false);
    }
  }

  const word = d.mapWord.trim() || "Map";
  const tournament = d.format === "TOURNAMENT";

  return (
    <NeonCard>
      <p className="font-medium mb-3">{editing ? `Edit ${editing.name}` : "New Setup"}</p>
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => goTo(i)}
            className={`shrink-0 rounded-md border px-3 py-1.5 text-xs transition-colors ${i === step ? "border-neon-blue bg-base-800 text-slate-100" : "border-white/10 text-slate-500 hover:text-slate-300"}`}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-5 items-start">
        <div className="min-w-0 space-y-4">
          {step === 0 && (
            <>
              <div>
                <Label>Start from</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {presets.map((p) => (
                    <Choice
                      key={p.id}
                      on={d.game === p.game}
                      title={p.game}
                      hint={p.useMaps && p.maps.length ? `${p.maps.length} ${p.mapWord.toLowerCase()}s to start. You can edit them.` : "No maps. You can add them."}
                      onClick={() => applyPreset(p)}
                      onRemove={() => removePreset(p)}
                    />
                  ))}
                  <Choice on={false} title="Start blank" hint="Fill in everything yourself" onClick={() => applyPreset(BLANK_GAME)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Setup name</Label>
                  <input className={inputClass} value={d.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="Friday Night 5v5" />
                </div>
                <div>
                  <Label>Game</Label>
                  <select className={inputClass} value={typingGame ? NEW_GAME : d.game} onChange={(e) => pickGame(e.target.value)}>
                    <option value="">Pick a game…</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.game}>
                        {p.game}
                      </option>
                    ))}
                    {d.game && !typingGame && !presets.some((p) => p.game === d.game) && <option value={d.game}>{d.game}</option>}
                    <option value={NEW_GAME}>+ Add a new game</option>
                  </select>
                  {typingGame && <input className={`${inputClass} mt-2`} aria-label="New game name" value={d.game} maxLength={80} onChange={(e) => set({ game: e.target.value })} placeholder="New game name" />}
                  {typingGame && <Hint>Saving this setup adds the game to your Games tab.</Hint>}
                </div>
              </div>
              <div>
                <Label>What does the score count?</Label>
                <ScoreSelect value={d.scoreName} onChange={(scoreName) => set({ scoreName })} />
              </div>
              <Toggle on={d.useRanks} label="Use ranks" hint="Members pick a rank when they first sign up. Turn off for games without ranks." onChange={(useRanks) => set({ useRanks })} />
              {d.useRanks && (
                <div>
                  <Label>Ranks, lowest to highest</Label>
                  <textarea
                    className={`${inputClass} min-h-20`}
                    value={ranksText}
                    onChange={(e) => {
                      setRanksText(e.target.value);
                      set({ ranks: e.target.value.split(",").map((r) => r.trim()).filter(Boolean) });
                    }}
                  />
                  <Hint>Separate them with commas, up to 100. With over 25, name them like Gold III and players pick Gold, then Gold III.</Hint>
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Choice on={tournament} title="Tournament" hint="A bracket with one champion." onClick={() => set({ format: "TOURNAMENT" })} />
                <Choice on={!tournament && d.teamSize > 1} title="Team Match" hint="One match between two teams." onClick={() => set({ format: "SINGLE", teamSize: d.teamSize > 1 ? d.teamSize : 5 })} />
                <Choice on={!tournament && d.teamSize === 1} title="1v1" hint="One player against another." onClick={() => set({ format: "SINGLE", teamSize: 1 })} />
              </div>
              {tournament && (
                <div>
                  <Label>{d.teamSize === 1 ? "Players in the bracket" : "Teams in the bracket"}</Label>
                  <select className={inputClass} value={d.tournamentTeams} onChange={(e) => set({ tournamentTeams: Number(e.target.value) })}>
                    {[4, 8, 16].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <Hint>Single elimination. If fewer sign up, staff can start with a smaller bracket.</Hint>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <Label>Players on each team</Label>
                <input {...num("teamSize")} min={1} max={10} />
                <Hint>This needs {d.teamSize * (tournament ? d.tournamentTeams : 2) || 0} players in total.</Hint>
              </div>
              {d.teamSize > 1 && (
                <div>
                  <Label>How players join a team</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Choice on={d.joinMode === "ASSIGN"} title="Bot Assigns Teams" hint="Players register, then the bot splits them." onClick={() => set({ joinMode: "ASSIGN" })} />
                    <Choice on={d.joinMode === "PICK"} title="Players Choose a Team" hint="Players register for a team on the panel." onClick={() => set({ joinMode: "PICK" })} />
                  </div>
                </div>
              )}
              {d.joinMode === "PICK" && d.teamSize > 1 && tournament && (
                <div>
                  <Label>Team names (optional)</Label>
                  <textarea className={`${inputClass} min-h-16`} value={teamNamesText} placeholder="Team 1, Team 2, Team 3" onChange={(e) => { setTeamNamesText(e.target.value); set({ teamNames: e.target.value.split(",").map((t) => t.trim()) }); }} />
                  <Hint>Separate them with commas. Blank slots use Team 1, Team 2 and so on.</Hint>
                </div>
              )}
              {(d.joinMode === "ASSIGN" || d.teamSize === 1) && (
                <div>
                  <Label>How teams are split</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Choice on={d.balance === "BALANCED"} title="Balanced" hint={d.useRanks ? "Uses rank and match results." : "Uses match results."} onClick={() => set({ balance: "BALANCED" })} />
                    <Choice on={d.balance === "CAPTAINS"} title="Captains Draft" hint={tournament ? "Tournaments use Balanced instead." : "Two captains take turns picking."} onClick={() => set({ balance: "CAPTAINS" })} />
                    <Choice on={d.balance === "RANDOM"} title="Random" hint="The bot shuffles everyone." onClick={() => set({ balance: "RANDOM" })} />
                  </div>
                </div>
              )}
              <div>
                <Label>Who are the captains?</Label>
                <select className={inputClass} value={d.captainRule} onChange={(e) => set({ captainRule: e.target.value as MatchSetupInput["captainRule"] })}>
                  <option value="TOP">Highest rated player on each team</option>
                  <option value="RANDOM">Random player on each team</option>
                </select>
              </div>
              <div>
                <Label>Who can see rosters</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Choice on={d.rosterView === "PUBLIC"} title="Show Everyone" hint="Names appear as people register." onClick={() => set({ rosterView: "PUBLIC" })} />
                  <Choice on={d.rosterView === "HIDDEN"} title="Hidden Until Closed" hint="Only team counts show until registration closes." onClick={() => set({ rosterView: "HIDDEN" })} />
                </div>
                <Hint>Staff can still see rosters on this page.</Hint>
              </div>
              {d.teamSize > 1 && (
                <div>
                  <Label>Team names</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Choice on={d.teamNaming === "SET"} title={tournament ? "Numbered" : "Set Names"} hint={tournament ? "Team 1, Team 2 and so on." : "Uses the names below."} onClick={() => set({ teamNaming: "SET" })} />
                    <Choice on={d.teamNaming === "CAPTAIN"} title="Captains Name Them" hint="Captains pick a name on the panel before the match." onClick={() => set({ teamNaming: "CAPTAIN" })} />
                  </div>
                </div>
              )}
              {!tournament && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>First team name</Label>
                    <input className={inputClass} value={d.team1Name} maxLength={60} onChange={(e) => set({ team1Name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Second team name</Label>
                    <input className={inputClass} value={d.team2Name} maxLength={60} onChange={(e) => set({ team2Name: e.target.value })} />
                  </div>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Toggle on={d.useMaps} label="Use maps" hint="Turn off for games with no maps or stages." onChange={(useMaps) => set({ useMaps })} />
              {d.useMaps && (
                <>
                  <div>
                    <Label>What do you call them?</Label>
                    <input className={inputClass} value={d.mapWord} maxLength={30} onChange={(e) => set({ mapWord: e.target.value })} />
                    <Hint>Map, Stage, Arena, Mode or anything else. Use one word, not plural.</Hint>
                  </div>
                  <div>
                    <Label>
                      {word} list ({d.maps.length})
                    </Label>
                    <div className="flex gap-2 mb-2">
                      <input
                        className={`${inputClass} min-w-0 flex-1`}
                        value={mapDraft}
                        placeholder="Type a name, or several with commas"
                        onChange={(e) => setMapDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addMaps();
                          }
                        }}
                      />
                      <button type="button" onClick={addMaps} className="neon-button-sm shrink-0">
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {d.maps.map((m) => (
                        <span key={m} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-base-800 pl-3 pr-1 py-0.5 text-xs">
                          {m}
                          <button type="button" aria-label={`Remove ${m}`} onClick={() => set({ maps: d.maps.filter((x) => x !== m) })} className="w-5 h-5 rounded-full text-slate-500 hover:text-rose-400">
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>How it's picked</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Choice on={d.mapMethod === "VOTE"} title="Player Vote" hint={`The bot picks some ${word.toLowerCase()}s at random. Everyone votes.`} onClick={() => set({ mapMethod: "VOTE" })} />
                      <Choice on={d.mapMethod === "RANDOM"} title="Bot Picks" hint={`The bot picks one ${word.toLowerCase()} at random.`} onClick={() => set({ mapMethod: "RANDOM" })} />
                      <Choice on={d.mapMethod === "BANS"} title="Captain Bans" hint="Captains take turns banning until one is left." onClick={() => set({ mapMethod: "BANS" })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {d.mapMethod !== "RANDOM" && (
                      <div>
                        <Label>{word}s the bot picks</Label>
                        <input {...num("mapChoices")} min={2} max={20} />
                      </div>
                    )}
                    {d.mapMethod !== "RANDOM" && (
                      <div>
                        <Label>{d.mapMethod === "BANS" ? "Seconds per ban" : "Voting seconds"}</Label>
                        <input {...num("voteSeconds")} min={0} max={300} />
                        <Hint>0 has no limit.</Hint>
                      </div>
                    )}
                    <div>
                      <Label>Skip last played</Label>
                      <input {...num("skipRecent")} min={0} />
                      <Hint>0 lets repeats happen.</Hint>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <div>
                <Label>How it starts</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Choice on={d.startMode === "MANUAL"} title="Staff Start It" hint="Stays open until staff tap Start Now." onClick={() => set({ startMode: "MANUAL" })} />
                  <Choice on={d.startMode === "SCHEDULED"} title="Set a Time" hint="Starts at the date and time you pick." onClick={() => set({ startMode: "SCHEDULED" })} />
                  <Choice on={d.startMode === "FULL"} title="When Full" hint="Starts as soon as the lobby fills." onClick={() => set({ startMode: "FULL" })} />
                </div>
              </div>
              {d.startMode === "SCHEDULED" && (
                <div>
                  <Label>Start date and time</Label>
                  <DateTimeZoneField value={d.startAt ?? ""} onChange={(iso) => set({ startAt: iso || null })} />
                </div>
              )}
              <div>
                <Label>Panel channel</Label>
                <ChannelSelect guildId={guildId} value={d.panelChannelId || null} onChange={(panelChannelId) => set({ panelChannelId })} />
                <Hint>Members play here. Use a new channel and turn off Send Messages for members so chat can't bury the panel.</Hint>
              </div>
              <div>
                <Label>Results channel</Label>
                <ChannelSelect guildId={guildId} value={d.resultsChannelId || null} onChange={(resultsChannelId) => set({ resultsChannelId })} />
                <Hint>Every result and the bracket post here.</Hint>
              </div>
              <Hint>Saving also creates a Discord event everyone can see. Spartacus needs Manage Events.</Hint>
            </>
          )}

          {step === 5 && (
            <>
              <Toggle on={d.useTimers} label="Use timers" hint="Off means a person starts each step. Turn on to run steps automatically." onChange={(useTimers) => set({ useTimers })} />
              {d.useTimers && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>{tournament ? "Sign-up minutes" : "Clear sign-ups after (minutes)"}</Label>
                    <input {...num("signupMinutes")} min={0} />
                    <Hint>Counts from the first sign-up. 0 turns it off.</Hint>
                  </div>
                  <div>
                    <Label>Auto-start seconds</Label>
                    <input {...num("autoStartSeconds")} min={0} />
                    <Hint>Starts after teams are set. 0 turns it off.</Hint>
                  </div>
                  <div>
                    <Label>Score deadline (minutes)</Label>
                    <input {...num("reportMinutes")} min={0} />
                    <Hint>A reminder, then 15 more minutes. 0 turns it off.</Hint>
                  </div>
                  {tournament ? (
                    <div>
                      <Label>Reopen sign-ups after (hours)</Label>
                      <input {...num("autoReopenHours")} min={0} />
                      <Hint>Counts from the final. 0 waits for staff.</Hint>
                    </div>
                  ) : (
                    <div>
                      <Label>If no score comes in</Label>
                      <select className={inputClass} value={d.noReportAction} onChange={(e) => set({ noReportAction: e.target.value as MatchSetupInput["noReportAction"] })}>
                        <option value="CANCEL">Cancel the match</option>
                        <option value="ALERT">Alert staff</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
              {!tournament && <Toggle on={d.checkIn} label="Check-in" hint="Everyone readies up before teams are made." onChange={(checkIn) => set({ checkIn })} />}
              {!tournament && d.checkIn && d.useTimers && (
                <div>
                  <Label>Check-in seconds</Label>
                  <input {...num("checkInSeconds")} min={15} max={600} />
                </div>
              )}
              <Toggle on={d.autoMove} label="Team voice channels" hint="Creates a voice channel for each team, capped at the team size, and deletes them after the match." onChange={(autoMove) => set({ autoMove })} />
              {d.autoMove && (
                <div>
                  <Label>Main voice channel</Label>
                  <ChannelSelect guildId={guildId} kind="voice" value={d.lobbyVoiceId} onChange={(id) => set({ lobbyVoiceId: id || null })} />
                  <Hint>Players wait here, and the Discord event points here. Spartacus needs Manage Channels and Move Members.</Hint>
                </div>
              )}
              <div>
                <Label>Who reports the score</Label>
                <select className={inputClass} value={d.reportBy} onChange={(e) => set({ reportBy: e.target.value as MatchSetupInput["reportBy"] })}>
                  <option value="BOTH">One captain reports, the other confirms</option>
                  <option value="CAPTAIN">Either captain</option>
                  <option value="STAFF">Staff only</option>
                </select>
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <Toggle on={d.rewardsEnabled} label="Rewards" hint="Off by default. Wins and the leaderboard always count." onChange={(rewardsEnabled) => set({ rewardsEnabled })} />
              {d.rewardsEnabled && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Coins for a win</Label>
                      <input {...num("winCoins")} min={0} />
                    </div>
                    <div>
                      <Label>Coins for a loss</Label>
                      <input {...num("lossCoins")} min={0} />
                    </div>
                  </div>
                  {tournament && (
                    <>
                      <div>
                        <Label>Champion bonus coins</Label>
                        <input {...num("championCoins")} min={0} />
                      </div>
                      <div>
                        <Label>Champion role (optional)</Label>
                        <RoleSelect guildId={guildId} value={d.championRoleId} onChange={(id) => set({ championRoleId: id || null })} placeholder="No role" />
                      </div>
                    </>
                  )}
                </>
              )}
              <div>
                <Label>Role to ping when a lobby fills (optional)</Label>
                <RoleSelect guildId={guildId} value={d.pingRoleId} onChange={(id) => set({ pingRoleId: id || null })} placeholder="No role" />
              </div>
              <div>
                <Label>Staff role (optional)</Label>
                <RoleSelect guildId={guildId} value={d.staffRoleId} onChange={(id) => set({ staffRoleId: id || null })} placeholder="Manage Server permission only" />
              </div>
            </>
          )}

          {step === 7 && <p className="text-sm text-slate-400">Everything look right? Saving posts the panel and creates the Discord event within a few seconds.</p>}

          <FormError message={error} />
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <div className="flex gap-2">
              <button type="button" onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
                Cancel
              </button>
              {step > 0 && (
                <button type="button" onClick={() => setStep(step - 1)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
                  Back
                </button>
              )}
            </div>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => goTo(step + 1)} className="neon-button">
                Next
              </button>
            ) : (
              <button type="button" onClick={save} disabled={saving} className="neon-button disabled:opacity-50">
                {saving ? "Saving…" : "Save Setup"}
              </button>
            )}
          </div>
        </div>

        <aside className="rounded-lg border border-white/10 bg-base-950 p-4 text-sm space-y-3">
          <p className="font-medium break-words">{d.name || "New setup"}</p>
          {[
            ["Game", d.game || "Not set"],
            ["Format", formatSummary(d)],
            ["Teams", { BALANCED: "Balanced", CAPTAINS: tournament ? "Balanced" : "Captains draft", RANDOM: "Random" }[d.balance]],
            [`${word}s`, mapSummary(d)],
            ["Joining", d.joinMode === "PICK" && d.teamSize > 1 ? "Players choose a team" : "Bot assigns teams"],
            ["Rosters", d.rosterView === "HIDDEN" ? "Hidden until closed" : "Show everyone"],
            ["Start", d.startMode === "SCHEDULED" ? (d.startAt ? new Date(d.startAt).toLocaleString() : "Not set") : d.startMode === "FULL" ? "When full" : "Staff start it"],
            ["Timers", d.useTimers ? "On" : "Off"],
            ["Ranks", d.useRanks ? `${d.ranks.length} ranks` : "Off"],
            ["Rewards", d.rewardsEnabled ? `${d.winCoins} coins for a win, ${d.lossCoins} for a loss` : "Off"],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[11px] uppercase tracking-wide text-slate-600">{label}</p>
              <p className="text-slate-300 break-words">{value}</p>
            </div>
          ))}
        </aside>
      </div>
    </NeonCard>
  );
}

function ResultsList({ results, onVoid }: { results: MatchResultRow[]; onVoid: (r: MatchResultRow) => void }) {
  if (results.length === 0) return <p className="text-sm text-slate-500 py-3 text-center">No matches played yet.</p>;
  return (
    <div className="divide-y divide-white/5">
      {results.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className={`break-words ${r.voided ? "line-through text-slate-500" : ""}`}>
              {r.winnerName} beat {r.loserName} {r.winnerScore}-{r.loserScore}
            </p>
            <p className="text-xs text-slate-500">
              {r.map ? `${r.map} · ` : ""}
              {new Date(r.createdAt).toLocaleString()}
            </p>
          </div>
          {r.voided ? (
            <span className="text-xs text-rose-400 shrink-0">Voided</span>
          ) : (
            <button type="button" onClick={() => onVoid(r)} className="text-xs text-slate-500 hover:text-rose-400 shrink-0 py-1">
              Void
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function GameForm({ start, onSave, onCancel }: { start: MatchPresetRow | null; onSave: (game: MatchPresetInput) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState<MatchPresetInput>(start ?? { ...BLANK_GAME, teamSize: 2 });
  const [ranksText, setRanksText] = useState((start?.ranks ?? []).join(", "));
  const [mapDraft, setMapDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<MatchPresetInput>) => {
    setD((prev) => ({ ...prev, ...patch }));
    setError(null);
  };
  const word = d.mapWord.trim() || "Map";

  function addMaps() {
    const names = mapDraft.split(",").map((m) => m.trim()).filter(Boolean);
    set({ maps: [...new Set([...d.maps, ...names])] });
    setMapDraft("");
  }

  async function save() {
    setSaving(true);
    try {
      await onSave({ ...d, maps: [...new Set([...d.maps, ...mapDraft.split(",").map((m) => m.trim()).filter(Boolean)])] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save this game.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <NeonCard>
      <p className="font-medium mb-3">{start ? `Edit ${start.game}` : "Add a Game"}</p>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Game name</Label>
            <input className={inputClass} value={d.game} maxLength={80} disabled={!!start} onChange={(e) => set({ game: e.target.value })} placeholder="Any game" />
            {start && <Hint>Names stay fixed so past results stay together.</Hint>}
          </div>
          <div>
            <Label>Players per team</Label>
            <input type="number" min={1} max={10} className={inputClass} value={d.teamSize} onChange={(e) => set({ teamSize: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Score counts</Label>
            <ScoreSelect value={d.scoreName} onChange={(scoreName) => set({ scoreName })} />
          </div>
        </div>
        <Toggle on={d.useRanks} label="Use ranks" hint="Members pick a rank when they first sign up." onChange={(useRanks) => set({ useRanks })} />
        {d.useRanks && (
          <div>
            <Label>Ranks, lowest to highest</Label>
            <textarea
              className={`${inputClass} min-h-20`}
              value={ranksText}
              onChange={(e) => {
                setRanksText(e.target.value);
                set({ ranks: e.target.value.split(",").map((r) => r.trim()).filter(Boolean) });
              }}
            />
            <Hint>Separate them with commas, up to 100. With over 25, name them like Gold III and players pick Gold, then Gold III.</Hint>
          </div>
        )}
        <Toggle on={d.useMaps} label="Use maps" hint="Turn off for games with no maps or stages." onChange={(useMaps) => set({ useMaps })} />
        {d.useMaps && (
          <>
            <div>
              <Label>What do you call them?</Label>
              <input className={inputClass} value={d.mapWord} maxLength={30} onChange={(e) => set({ mapWord: e.target.value })} />
            </div>
            <div>
              <Label>
                {word} list ({d.maps.length})
              </Label>
              <div className="flex gap-2 mb-2">
                <input
                  className={`${inputClass} min-w-0 flex-1`}
                  value={mapDraft}
                  placeholder="Type a name, or several with commas"
                  onChange={(e) => setMapDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMaps();
                    }
                  }}
                />
                <button type="button" onClick={addMaps} className="neon-button-sm shrink-0">
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {d.maps.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-base-800 pl-3 pr-1 py-0.5 text-xs">
                    {m}
                    <button type="button" aria-label={`Remove ${m}`} onClick={() => set({ maps: d.maps.filter((x) => x !== m) })} className="w-5 h-5 rounded-full text-slate-500 hover:text-rose-400">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
        <FormError message={error} />
        <div className="flex justify-between gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} className="neon-button disabled:opacity-50">
            {saving ? "Saving…" : start ? "Save Changes" : "Add Game"}
          </button>
        </div>
      </div>
    </NeonCard>
  );
}

function NameBuilder({ label, value, onChange, tokens }: { label: string; value: string; onChange: (next: string) => void; tokens: readonly string[] }) {
  const parts = value.split(/(\{[a-z]+\})/).filter(Boolean);
  const move = (index: number, by: number) => {
    const next = [...parts];
    const [part] = next.splice(index, 1);
    next.splice(index + by, 0, part);
    onChange(next.join(""));
  };
  return (
    <div>
      <Label>{label}</Label>
      <input className={inputClass} value={value} maxLength={100} onChange={(e) => onChange(e.target.value)} />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {parts.map((part, i) => (
          <span key={i} className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-base-800 px-1 py-0.5 text-xs">
            <button type="button" aria-label={`Move ${part} left`} disabled={i === 0} onClick={() => move(i, -1)} className="w-5 h-5 text-slate-500 hover:text-slate-200 disabled:opacity-30">
              ◀
            </button>
            {VOICE_TOKENS.some((t) => t.token === part) ? (
              <span className="px-1">{VOICE_TOKENS.find((t) => t.token === part)?.label}</span>
            ) : (
              <input
                aria-label="Text piece"
                className="bg-base-950 rounded px-1 text-xs min-w-0"
                style={{ width: `${Math.max(3, part.length + 1)}ch` }}
                value={part}
                onChange={(e) => onChange(parts.map((p, n) => (n === i ? e.target.value : p)).join(""))}
              />
            )}
            <button type="button" aria-label={`Move ${part} right`} disabled={i === parts.length - 1} onClick={() => move(i, 1)} className="w-5 h-5 text-slate-500 hover:text-slate-200 disabled:opacity-30">
              ▶
            </button>
            <button type="button" aria-label={`Remove ${part}`} onClick={() => onChange(parts.filter((_, n) => n !== i).join(""))} className="w-5 h-5 text-slate-500 hover:text-rose-400">
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <button type="button" onClick={() => onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}Text`)} className="rounded-md border border-dashed border-white/15 px-2 py-0.5 text-xs text-slate-400 hover:text-neon-blue">
          + Text
        </button>
        {VOICE_TOKENS.filter((t) => tokens.includes(t.token)).map((t) => (
          <button key={t.token} type="button" onClick={() => onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${t.token}`)} className="rounded-md border border-dashed border-white/15 px-2 py-0.5 text-xs text-slate-400 hover:text-neon-blue">
            + {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function VoiceSettings({ guildId }: { guildId: string }) {
  const [config, setConfig] = useState<MatchmakingConfigRow | null>(null);
  const [channels, setChannels] = useState<DiscordChannels | null>(null);
  const [sample, setSample] = useState<"duel" | "team">("duel");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getMatchmaking(guildId).then((o) => setConfig(o.config));
    api.getDiscordChannels(guildId).then(setChannels);
  }, [guildId]);

  async function save() {
    if (!config) return;
    setError(null);
    try {
      await api.saveMatchmaking(guildId, config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    }
  }
  const autoSave = useAutoSave(config, save);
  if (!config) return <p className="text-sm text-slate-500">Loading…</p>;
  const set = (patch: Partial<MatchmakingConfigRow>) => setConfig((prev) => (prev ? { ...prev, ...patch } : prev));

  const voice = channels?.voiceChannels ?? [];
  const lobby = voice.find((c) => c.id === config.lobbyVoiceId) ?? null;
  const lobbyName = lobby?.name ?? "Lobby";
  const pickedCategory = channels?.categories.find((c) => c.id === (sample === "duel" ? config.duelCategoryId : config.teamCategoryId))?.name ?? null;
  const category = pickedCategory ?? lobby?.categoryName ?? "Voice Channels";
  const sharesCategory = !lobby || (lobby.categoryName ?? "Voice Channels") === category;
  const others = voice.filter((c) => c.categoryName === category && c.id !== config.lobbyVoiceId).slice(0, 4).map((c) => c.name);
  const values = { a: sample === "duel" ? "Kuro" : "Night Crew", b: sample === "duel" ? "FrostByte" : "Red Line", game: "Your Game", map: "Bank", number: 12, pad: config.voiceNumberPad };
  const players = sample === "duel" ? 2 : 5;
  const limit = config.voiceLimit === "NONE" ? null : Math.min(99, players + (config.voiceLimit === "EXTRA" ? config.voiceExtra : 0));
  const rooms = sample === "duel" ? [renderVoiceName(config.duelVoiceName, values)] : [renderVoiceName(config.teamVoiceName, { ...values, team: values.a }), renderVoiceName(config.teamVoiceName, { ...values, team: values.b })];
  const row = (name: string, live: boolean) => (
    <div key={name + live} className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm ${live ? "bg-white/5 text-slate-100" : "text-slate-500"}`}>
      <span aria-hidden>{live && config.voicePrivate ? "🔒" : "🔊"}</span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {live && <span className="text-[11px] rounded bg-base-950 px-1.5 text-slate-400">{limit === null ? "No limit" : `0/${limit}`}</span>}
    </div>
  );
  const lobbyRow = row(lobbyName, false);
  const roomRows = rooms.map((r) => row(r, true));
  const otherRows = others.map((n) => row(n, false));
  const list = sharesCategory ? [lobbyRow, ...roomRows, ...otherRows] : [...otherRows, ...roomRows];

  return (
    <NeonCard>
      <p className="font-medium mb-1">Voice Channels</p>
      <p className="text-xs text-slate-500 mb-3">Players wait in one Lobby. When a match starts, the bot creates temporary channels and moves everyone in. These settings also apply to tournaments and team matches.</p>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-5 items-start">
        <div className="min-w-0 space-y-4">
          <Toggle on={config.createVoice} label="Create voice channels for Matchmaking" hint="A 1v1 shares one channel, and each team gets its own." onChange={(createVoice) => set({ createVoice })} />
          <div>
            <Label>Lobby voice channel</Label>
            <ChannelSelect guildId={guildId} kind="voice" value={config.lobbyVoiceId} onChange={(id) => set({ lobbyVoiceId: id || null })} />
          </div>
          <div>
            <Label>Who gets moved</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Choice on={config.voiceSource === "LOBBY"} title="Lobby Only" hint="Only players in the Lobby are moved. Others get a link." onClick={() => set({ voiceSource: "LOBBY" })} />
              <Choice on={config.voiceSource === "ANY"} title="Any Voice Channel" hint="Players are pulled in from any voice channel." onClick={() => set({ voiceSource: "ANY" })} />
            </div>
          </div>
          <Toggle on={config.requireLobby} label="Must be in the Lobby to queue" hint="Find a Match only works from inside the Lobby." onChange={(requireLobby) => set({ requireLobby })} />
          <Toggle on={config.voiceReturn} label="Return players to the Lobby" hint="Moves everyone back before the channels are deleted." onChange={(voiceReturn) => set({ voiceReturn })} />
          <Toggle on={config.voicePrivate} label="Private channels" hint="Only the match's players can join. Needs Manage Roles for Spartacus." onChange={(voicePrivate) => set({ voicePrivate })} />
          <NameBuilder label="1v1 channel name" value={config.duelVoiceName} onChange={(duelVoiceName) => set({ duelVoiceName })} tokens={["{a}", "{b}", "{game}", "{map}", "{number}"]} />
          <NameBuilder label="Team channel name" value={config.teamVoiceName} onChange={(teamVoiceName) => set({ teamVoiceName })} tokens={["{team}", "{game}", "{map}", "{number}"]} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Number style</Label>
              <select className={inputClass} value={config.voiceNumberPad} onChange={(e) => set({ voiceNumberPad: Number(e.target.value) })}>
                <option value={1}>Plain (5)</option>
                <option value={2}>2 digits (05)</option>
                <option value={3}>3 digits (005)</option>
                <option value={4}>4 digits (0005)</option>
              </select>
            </div>
            <div>
              <Label>User limit</Label>
              <select className={inputClass} value={config.voiceLimit} onChange={(e) => set({ voiceLimit: e.target.value as MatchmakingConfigRow["voiceLimit"] })}>
                <option value="TEAM">Match players only</option>
                <option value="EXTRA">Players plus extra spots</option>
                <option value="NONE">No limit</option>
              </select>
            </div>
          </div>
          {config.voiceLimit === "EXTRA" && (
            <div>
              <Label>Extra spots</Label>
              <input type="number" min={0} max={20} className={inputClass} value={config.voiceExtra} onChange={(e) => set({ voiceExtra: Number(e.target.value) })} />
              <Hint>Room for coaches or spectators.</Hint>
            </div>
          )}
          <div>
            <Label>1v1 category</Label>
            <ChannelSelect guildId={guildId} kind="category" value={config.duelCategoryId} onChange={(duelCategoryId) => set({ duelCategoryId: duelCategoryId || null })} placeholder="Same as the Lobby" />
            <Label>Team category</Label>
            <ChannelSelect guildId={guildId} kind="category" value={config.teamCategoryId} onChange={(teamCategoryId) => set({ teamCategoryId: teamCategoryId || null })} placeholder="Same as the Lobby" />
            <Hint>Keep 1v1 and team channels in their own categories. New channels go at the bottom of a dedicated category. Left empty, they appear right under the Lobby.</Hint>
          </div>
          <FormError message={error} />
          <SaveStatus status={autoSave} />
        </div>
        <aside className="lg:sticky lg:top-4 rounded-lg border border-white/10 bg-base-950 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Preview</p>
          <div className="flex gap-1 mb-3">
            {(["duel", "team"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setSample(k)} className={`rounded-md border px-2.5 py-1 text-xs ${sample === k ? "border-neon-blue text-slate-100" : "border-white/10 text-slate-500"}`}>
                {k === "duel" ? "1v1" : "Team Match"}
              </button>
            ))}
          </div>
          {!sharesCategory && (
            <div className="mb-2">
              <p className="px-2 text-[11px] font-semibold uppercase text-slate-500">{lobby?.categoryName ?? "Voice Channels"}</p>
              {lobbyRow}
            </div>
          )}
          <p className="px-2 text-[11px] font-semibold uppercase text-slate-500">{category}</p>
          <div className="mt-1 space-y-0.5">{list}</div>
          <p className="text-[11px] text-slate-600 mt-3">Highlighted channels are temporary. The players and teams here are examples.</p>
        </aside>
      </div>
    </NeonCard>
  );
}

// Shows **bold** the way Discord does, so the preview reads like the real post.
function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>))}
    </>
  );
}

function MessagesTab({ guildId }: { guildId: string }) {
  const [saved, setSaved] = useState<Pick<MatchmakingConfigRow, "texts" | "gameTexts"> | null>(null);
  const [games, setGames] = useState<string[]>([]);
  const [scope, setScope] = useState("ALL");
  const [group, setGroup] = useState(MATCH_TEXT_GROUPS[0]);
  const [key, setKey] = useState<MatchTextKey>("boardSolo");
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getMatchmaking(guildId).then((o) => setSaved({ texts: o.config.texts ?? {}, gameTexts: o.config.gameTexts ?? {} }));
    api.getMatchPresets(guildId).then((p) => setGames(p.map((g) => g.game)));
  }, [guildId]);

  async function save() {
    if (!saved) return;
    setError(null);
    try {
      await api.saveMatchmaking(guildId, saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    }
  }
  const autoSave = useAutoSave(saved, save);
  if (!saved) return <p className="text-sm text-slate-500">Loading…</p>;

  const allGames = scope === "ALL";
  const texts = allGames ? saved.texts : saved.gameTexts[scope] ?? {};
  const setTexts = (next: MatchmakingConfigRow["texts"]) => setSaved(allGames ? { ...saved, texts: next } : { ...saved, gameTexts: { ...saved.gameTexts, [scope]: next } });
  const merged = textsForGame(saved.texts, saved.gameTexts, allGames ? null : scope);
  const entries = (Object.entries(MATCH_TEXTS) as Array<[MatchTextKey, MatchTextEntry]>).filter(([, e]) => allGames || !e.global);
  const entry: MatchTextEntry = MATCH_TEXTS[key];
  const custom = texts[key] ?? {};
  const shown = merged[key] ?? {};
  const isEmbed = entry.defaults.text === undefined;
  const edited = Object.keys(custom).length > 0;
  const isBoard = key === "boardCombined" || key === "boardPlayers" || key === "boardTeams";
  const resolved = resolveText(merged, key, entry.tokens);
  const preview = isBoard && !shown.color ? { ...resolved, color: gameColor(scope) } : resolved;
  const value = (field: "title" | "description" | "footer" | "color" | "text" | "url" | "authorName" | "authorIcon" | "thumbnail" | "image" | "footerIcon") => shown[field] ?? entry.defaults[field] ?? "";
  const change = (field: keyof TextOverride, next: string | boolean | TextField[]) => setTexts({ ...texts, [key]: { ...custom, [field]: next } });
  const insert = (token: string) => {
    const field = isEmbed ? "description" : "text";
    change(field, `${value(field)}{${token}}`);
  };
  const reset = () => {
    const { [key]: _removed, ...rest } = texts;
    setTexts(rest);
  };
  const fields = shown.fields ?? [];
  const setField = (index: number, patch: Partial<TextField>) => change("fields", fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const moveField = (index: number, by: number) => {
    const next = [...fields];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    change("fields", next);
  };
  const size = preview.title.length + preview.description.length + preview.footer.length + preview.authorName.length + preview.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  const pickScope = (next: string) => {
    setScope(next);
    if (next !== "ALL" && MATCH_TEXTS[key].global) {
      setGroup("Sign-Ups");
      setKey("signup");
    }
  };
  const choose = (next: MatchTextKey) => {
    setKey(next);
    setError(null);
  };
  const pickGroup = (next: string) => {
    setGroup(next);
    const first = entries.find(([, e]) => e.group === next);
    if (first) choose(first[0]);
  };

  return (
    <div className="space-y-5">
      <NeonCard>
        <p className="font-medium mb-1">Step 1: Pick what to change</p>
        <p className="text-xs text-slate-500 mb-3">Everything Spartacus posts for Matchmaking is here. A dot marks anything customized for the choice below.</p>
        <Label>Game</Label>
        <select className={`${inputClass} mb-1`} value={scope} onChange={(e) => pickScope(e.target.value)}>
          <option value="ALL">All Games (the default for everything)</option>
          {games.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <Hint>{allGames ? "Changes here apply to every game that doesn't have its own version." : `Changes here only apply to ${scope}. Anything you leave alone uses All Games. The shared Matchmaking board is edited under All Games.`}</Hint>
        <div className="h-3" />
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
          {MATCH_TEXT_GROUPS.map((g) => (
            <button key={g} type="button" onClick={() => pickGroup(g)} className={`shrink-0 rounded-md border px-3 py-1.5 text-xs ${g === group ? "border-neon-blue bg-base-800 text-slate-100" : "border-white/10 text-slate-500 hover:text-slate-300"}`}>
              {g}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {entries
            .filter(([, e]) => e.group === group)
            .map(([k, e]) => (
              <Choice key={k} on={k === key} title={`${e.label}${texts[k] ? " •" : ""}`} hint={e.hint} onClick={() => choose(k)} />
            ))}
        </div>
      </NeonCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <NeonCard>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="font-medium">Step 2: {entry.label}</p>
            {edited && (
              <button type="button" onClick={reset} className="text-xs text-slate-500 hover:text-rose-400">
                Reset to Default
              </button>
            )}
          </div>
          <div className="space-y-4">
            {isEmbed ? (
              <>
                <div>
                  <Label>Title</Label>
                  <input className={inputClass} maxLength={256} value={value("title")} onChange={(e) => change("title", e.target.value)} />
                </div>
                <div>
                  <Label>Description</Label>
                  <textarea className={`${inputClass} min-h-24`} maxLength={4000} value={value("description")} onChange={(e) => change("description", e.target.value)} />
                  <Hint>Use **two stars** for bold. Leave a box empty to hide that part.</Hint>
                </div>
                <div>
                  <Label>Footer</Label>
                  <input className={inputClass} maxLength={2000} value={value("footer")} onChange={(e) => change("footer", e.target.value)} />
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" aria-label="Embed color" className="h-10 w-14 rounded border border-white/10 bg-base-950" value={preview.color} onChange={(e) => change("color", e.target.value)} />
                    <span className="text-xs text-slate-500">{preview.color}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="text-xs text-neon-blue hover:underline">
                  {more ? "Hide" : "Show"} links, images, author and fields
                </button>
                {more && (
                  <div className="space-y-3 rounded-lg border border-white/10 p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Title link</Label>
                        <input className={inputClass} placeholder="https://" value={value("url")} onChange={(e) => change("url", e.target.value)} />
                      </div>
                      <div>
                        <Label>Author name</Label>
                        <input className={inputClass} maxLength={256} value={value("authorName")} onChange={(e) => change("authorName", e.target.value)} />
                      </div>
                      <div>
                        <Label>Author icon link</Label>
                        <input className={inputClass} placeholder="https://" value={value("authorIcon")} onChange={(e) => change("authorIcon", e.target.value)} />
                      </div>
                      <div>
                        <Label>Footer icon link</Label>
                        <input className={inputClass} placeholder="https://" value={value("footerIcon")} onChange={(e) => change("footerIcon", e.target.value)} />
                      </div>
                      <div>
                        <Label>Thumbnail link</Label>
                        <input className={inputClass} placeholder="https://" value={value("thumbnail")} onChange={(e) => change("thumbnail", e.target.value)} />
                      </div>
                      <div>
                        <Label>Large image link</Label>
                        <input className={inputClass} placeholder="https://" value={value("image")} onChange={(e) => change("image", e.target.value)} />
                      </div>
                    </div>
                    <Hint>Links must start with http:// or https://. Discord may not show an image link it can't load.</Hint>
                    <Toggle on={shown.timestamp ?? false} label="Show the time" hint="Adds the current time beside the footer." onChange={(on) => change("timestamp", on)} />
                    <div>
                      <Label>Your own fields ({fields.length}/10)</Label>
                      <div className="space-y-2">
                        {fields.map((f, i) => (
                          <div key={i} className="rounded-lg border border-white/10 p-2 space-y-2">
                            <input className={inputClass} aria-label={`Field ${i + 1} heading`} placeholder="Heading" maxLength={256} value={f.name} onChange={(e) => setField(i, { name: e.target.value })} />
                            <textarea className={`${inputClass} min-h-14`} aria-label={`Field ${i + 1} text`} placeholder="Text" maxLength={1024} value={f.value} onChange={(e) => setField(i, { value: e.target.value })} />
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              <label className="flex items-center gap-1.5">
                                <input type="checkbox" checked={f.inline} onChange={(e) => setField(i, { inline: e.target.checked })} />
                                Side by side
                              </label>
                              <button type="button" disabled={i === 0} onClick={() => moveField(i, -1)} className="hover:text-slate-200 disabled:opacity-30">
                                Move up
                              </button>
                              <button type="button" disabled={i === fields.length - 1} onClick={() => moveField(i, 1)} className="hover:text-slate-200 disabled:opacity-30">
                                Move down
                              </button>
                              <button type="button" onClick={() => change("fields", fields.filter((_, n) => n !== i))} className="hover:text-rose-400">
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {fields.length < 10 && (
                        <button type="button" onClick={() => change("fields", [...fields, { name: "", value: "", inline: false }])} className="neon-button-sm mt-2">
                          + Add Field
                        </button>
                      )}
                      <Hint>Your fields appear before the ones Spartacus adds, like player lists.</Hint>
                    </div>
                  </div>
                )}
                <p className={`text-xs ${size > 5000 ? "text-rose-400" : "text-slate-600"}`}>{size}/5000 characters. Discord limits a whole embed, and player lists need room too.</p>
              </>
            ) : (
              <div>
                <Label>{entry.group === "Buttons" ? "Button wording" : "Wording"}</Label>
                <textarea className={`${inputClass} min-h-16`} maxLength={entry.group === "Buttons" ? 60 : 1500} value={value("text")} onChange={(e) => change("text", e.target.value)} />
              </div>
            )}
            {Object.keys(entry.tokens).length > 0 && (
              <div>
                <Label>Fill-ins</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(entry.tokens).map((token) => (
                    <button key={token} type="button" onClick={() => insert(token)} className="rounded-md border border-dashed border-white/15 px-2 py-0.5 text-xs text-slate-400 hover:text-neon-blue">
                      {`{${token}}`}
                    </button>
                  ))}
                </div>
                <Hint>Tap one to add it. Spartacus swaps it for the real value.</Hint>
              </div>
            )}
            <FormError message={error} />
            <SaveStatus status={autoSave} />
          </div>
        </NeonCard>

        <div className="lg:sticky lg:top-4">
          <NeonCard>
            <p className="font-medium mb-1">Step 3: Check the preview</p>
            <p className="text-xs text-slate-500 mb-3">This updates as you type and saves by itself. Example values are shown in place of real names.</p>
            <div className="rounded-lg bg-[#313338] p-3">
              {isEmbed ? (
                <div className="relative rounded border-l-4 bg-[#2B2D31] p-3 text-sm text-[#DBDEE1] space-y-1.5" style={{ borderLeftColor: preview.color }}>
                  {preview.thumbnail && <img src={preview.thumbnail} alt="" className="float-right ml-3 h-16 w-16 rounded object-cover" />}
                  {preview.authorName && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-white break-words">
                      {preview.authorIcon && <img src={preview.authorIcon} alt="" className="h-5 w-5 rounded-full" />}
                      {preview.authorName}
                    </p>
                  )}
                  {preview.title && (
                    <p className={`font-semibold break-words ${preview.url ? "text-[#00A8FC]" : "text-white"}`}>
                      <Formatted text={preview.title} />
                    </p>
                  )}
                  {preview.description && (
                    <p className="whitespace-pre-wrap break-words">
                      <Formatted text={preview.description} />
                    </p>
                  )}
                  {[...preview.fields, ...(entry.previewFields ?? []).map((f) => ({ ...f, inline: true }))].length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {[...preview.fields, ...(entry.previewFields ?? []).map((f) => ({ ...f, inline: true }))].map((f, i) => (
                        <div key={i} className={`min-w-0 ${f.inline ? "" : "col-span-3"}`}>
                          <p className="text-xs font-semibold text-white break-words">{f.name}</p>
                          <p className="text-xs whitespace-pre-wrap break-words">
                            <Formatted text={f.value} />
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {preview.image && <img src={preview.image} alt="" className="clear-both w-full rounded" />}
                  {(preview.footer || preview.timestamp) && (
                    <p className="clear-both flex items-center gap-1.5 text-xs text-[#949BA4] break-words">
                      {preview.footerIcon && <img src={preview.footerIcon} alt="" className="h-4 w-4 rounded-full" />}
                      {[preview.footer, preview.timestamp ? "Today at 8:00 PM" : ""].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ) : entry.group === "Buttons" ? (
                <span className="inline-block rounded bg-[#5865F2] px-3 py-1.5 text-sm font-medium text-white">{preview.text}</span>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm text-[#DBDEE1]">
                  <Formatted text={preview.text} />
                </p>
              )}
            </div>
          </NeonCard>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ guildId }: { guildId: string }) {
  const confirm = useConfirm();
  const [games, setGames] = useState<MatchPresetRow[] | null>(null);
  const [form, setForm] = useState<{ game: MatchPresetRow | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getMatchPresets(guildId).then(setGames);
  }
  useEffect(refresh, [guildId]);

  async function saveGame(game: MatchPresetInput) {
    if (form?.game) await api.updateMatchPreset(guildId, form.game.id, game);
    else await api.addMatchPreset(guildId, game);
    setNotice(form?.game ? `${game.game} updated.` : `${game.game} added to the setup builder, Leaderboard and Matchmaking.`);
    setForm(null);
    refresh();
  }

  async function remove(game: MatchPresetRow) {
    if (!(await confirm(`Remove ${game.game}? It comes off the setup builder and Matchmaking, and its leaderboard post is deleted. Past results and saved setups stay.`, { confirmLabel: "Remove" }))) return;
    setError(null);
    try {
      await api.deleteMatchPreset(guildId, game.id);
      setNotice(`${game.game} removed.`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove this game.");
    }
  }

  if (form) return <GameForm key={form.game?.id ?? "new"} start={form.game} onSave={saveGame} onCancel={() => setForm(null)} />;

  return (
    <NeonCard>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <p className="font-medium">Games</p>
        <button type="button" onClick={() => setForm({ game: null })} className="neon-button-sm">
          + Add Game
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-2">Add a game once and it's ready in the setup builder, on the Leaderboard and on the Matchmaking board.</p>
      {notice && <p className="text-xs text-emerald-400 mb-2">{notice}</p>}
      <FormError message={error} />
      {games === null && <p className="text-sm text-slate-500 py-4">Loading…</p>}
      {games?.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">No games yet. Add your first one.</p>}
      <div className="divide-y divide-white/5">
        {games?.map((g) => (
          <div key={g.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
            <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
              <p className="text-sm break-words">{g.game}</p>
              <p className="text-xs text-slate-500">
                {g.teamSize} per team · {g.useMaps ? `${g.maps.length} ${g.mapWord.toLowerCase()}s` : "No maps"} · {g.useRanks ? `${g.ranks.length} ranks` : "No ranks"} · Scored in {g.scoreName}
              </p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setForm({ game: g })} className="text-xs text-slate-400 hover:text-neon-blue py-1">
                Edit
              </button>
              <button type="button" onClick={() => remove(g)} className="text-xs text-slate-500 hover:text-rose-400 py-1">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </NeonCard>
  );
}

function ConfigTabs({ guildId, tab }: { guildId: string; tab: "board" | "queue" }) {
  const confirm = useConfirm();
  const [data, setData] = useState<MatchmakingOverview | null>(null);
  const [config, setConfig] = useState<MatchmakingConfigRow | null>(null);
  const [presets, setPresets] = useState<MatchPresetRow[]>([]);
  const [setups, setSetups] = useState<MatchSetupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function refresh() {
    api.getMatchmaking(guildId).then((overview) => {
      setData(overview);
      setConfig(overview.config);
    });
  }
  useEffect(refresh, [guildId]);
  useEffect(() => {
    api.getMatchPresets(guildId).then(setPresets);
    api.getMatchSetups(guildId).then(setSetups);
  }, [guildId]);

  async function save() {
    if (!config) return;
    setError(null);
    try {
      await api.saveMatchmaking(guildId, config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    }
  }
  const autoSave = useAutoSave(config, save);
  const set = (patch: Partial<MatchmakingConfigRow>) => setConfig((prev) => (prev ? { ...prev, ...patch } : prev));

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await action();
      setNotice(done);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
  }

  if (!config || !data) return <p className="text-sm text-slate-500">Loading…</p>;
  const games = [...new Set([...presets.map((p) => p.game), ...setups.map((s) => s.game), ...config.boardGames.filter((g) => g !== "ALL")])];
  const toggleBoard = (key: string, on: boolean) => set({ boardGames: on ? [...config.boardGames, key] : config.boardGames.filter((g) => g !== key) });
  const num = (key: "challengeMinutes" | "queueMinutes" | "reportHours", label: string, hint: string) => (
    <div>
      <Label>{label}</Label>
      <input type="number" min={1} className={inputClass} value={config[key]} onChange={(e) => set({ [key]: Number(e.target.value) })} />
      <Hint>{hint}</Hint>
    </div>
  );

  if (tab === "board") {
    return (
      <div className="space-y-5">
        <NeonCard>
          <p className="font-medium mb-1">Leaderboard</p>
          <p className="text-xs text-slate-500 mb-3">Each game you switch on gets its own post in one text channel, with a top 10 players embed and a top 10 teams embed. Spartacus edits them after every match, using each player's server name.</p>
          <Label>Category and text channel</Label>
          <ChannelSelect guildId={guildId} value={config.boardChannelId} onChange={(boardChannelId) => set({ boardChannelId: boardChannelId || null })} />
          <Label>Post style</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            <Choice on={config.boardStyle === "COMBINED"} title="One Clean Post" hint="One embed per game, with its name on top and Players and Teams side by side." onClick={() => set({ boardStyle: "COMBINED" })} />
            <Choice on={config.boardStyle === "SEPARATE"} title="Separate Embeds" hint="A Players embed and a Teams embed for each game." onClick={() => set({ boardStyle: "SEPARATE" })} />
          </div>
          <Hint>Each game gets its own color automatically. To change a game's color, wording or logo, open Messages, pick the game, then choose Leaderboard.</Hint>
          <div className="h-3" />
          <Label>Games to post</Label>
          <div className="space-y-3 mb-3">
            <Toggle on={config.boardGames.includes("ALL")} label="All Games" hint="Combines every game into one leaderboard." onChange={(on) => toggleBoard("ALL", on)} />
            {games.map((g) => (
              <Toggle key={g} on={config.boardGames.includes(g)} label={g} hint="Its own leaderboard post." onChange={(on) => toggleBoard(g, on)} />
            ))}
          </div>
          <Hint>Teams count once they have a saved name: Matchmaking teams, players' chosen teams, and captain-named teams. Default names like Team Blue are skipped.</Hint>
          <FormError message={error} />
          <SaveStatus status={autoSave} />
        </NeonCard>
        <NeonCard>
          <p className="font-medium mb-2">Records</p>
          {notice && <p className="text-xs text-emerald-400 mb-2">{notice}</p>}
          <button
            type="button"
            onClick={async () => {
              if (await confirm("Start a new season? The leaderboard resets to zero, and past results are kept.", { confirmLabel: "Start Season" })) await run(() => api.startMatchSeason(guildId), "New season started.");
            }}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:border-white/25"
          >
            Start New Season
          </button>
        </NeonCard>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <NeonCard>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <p className="font-medium">Matchmaking</p>
            <p className="text-xs text-slate-500">An always-open board where players queue or challenge each other. Matches start right away, with no event and no staff.</p>
          </div>
          <ToggleSwitch enabled={config.enabled} onChange={(enabled) => set({ enabled })} label="Matchmaking board" />
        </div>
        <Label>Category and text channel</Label>
        <ChannelSelect guildId={guildId} value={config.channelId} onChange={(channelId) => set({ channelId: channelId || null })} />
        <Label>Challenges and match threads channel</Label>
        <ChannelSelect guildId={guildId} value={config.activityChannelId} onChange={(activityChannelId) => set({ activityChannelId: activityChannelId || null })} />
        <Hint>Challenges and private match threads post here, so the board stays clean. If you leave this empty they use the board's channel.</Hint>
        <div className="h-3" />
        <Label>Games on the board</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 mb-1">
          {[...presets.map((p) => ({ game: p.game, hint: `${Math.max(2, p.teamSize)} per team` })), ...config.games.filter((g) => !presets.some((p) => p.game === g)).map((game) => ({ game, hint: "Not in your Games tab. Tap to remove it." }))].map((g) => (
            <Choice key={g.game} on={config.games.includes(g.game)} check={config.games.includes(g.game)} title={g.game} hint={g.hint} onClick={() => set({ games: config.games.includes(g.game) ? config.games.filter((x) => x !== g.game) : [...config.games, g.game] })} />
          ))}
        </div>
        <Hint>A green check means the game is on the board. Tap a game to turn it on or off. Maps and team size come from its preset.</Hint>
        <div className="space-y-4 mt-4">
          <Toggle on={config.ranked} label="Count on the leaderboard" hint="Turn off to keep these matches casual." onChange={(ranked) => set({ ranked })} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {num("challengeMinutes", "Challenge expires (minutes)", "Dropped if nobody answers.")}
            {num("queueMinutes", "Leave queue after (minutes)", "Clears anyone who wandered off.")}
            {num("reportHours", "Close unreported (hours)", "Cleans up if nobody reports.")}
          </div>
          <div>
            <Label>Staff role (optional)</Label>
            <RoleSelect guildId={guildId} value={config.staffRoleId} onChange={(id) => set({ staffRoleId: id || null })} placeholder="Manage Server permission only" />
          </div>
        </div>
        <FormError message={error} />
        <SaveStatus status={autoSave} />
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-1">Live Matches</p>
        <p className="text-xs text-slate-500 mb-2">Staff can step in here. Nothing needs them.</p>
        {notice && <p className="text-xs text-emerald-400 mb-2">{notice}</p>}
        {data.rooms.length === 0 && <p className="text-sm text-slate-500 py-3 text-center">No matches running.</p>}
        <div className="divide-y divide-white/5">
          {data.rooms.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <p className="min-w-0 break-words">
                {r.aName} vs {r.bName} <span className="text-xs text-slate-500">· {r.game}</span>
              </p>
              <button type="button" onClick={() => run(() => api.cancelMatchRoom(guildId, r.id), "Match canceled.")} className="text-xs text-slate-500 hover:text-rose-400 shrink-0 py-1">
                Cancel
              </button>
            </div>
          ))}
        </div>
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-2">Teams</p>
        {data.teams.length === 0 && <p className="text-sm text-slate-500 py-3 text-center">No teams yet. Players create them from the Matchmaking board.</p>}
        <div className="divide-y divide-white/5">
          {data.teams.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <p className="min-w-0 break-words">
                {t.name} <span className="text-xs text-slate-500">· {t.game} · {t.players.length} players</span>
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (await confirm(`Disband ${t.name}? Its leaderboard record stays.`, { confirmLabel: "Disband" })) await run(() => api.deleteMatchTeam(guildId, t.id), `${t.name} disbanded.`);
                }}
                className="text-xs text-slate-500 hover:text-rose-400 shrink-0 py-1"
              >
                Disband
              </button>
            </div>
          ))}
        </div>
      </NeonCard>

      <NeonCard>
        <p className="font-medium mb-1">Match History</p>
        <p className="text-xs text-slate-500 mb-3">Void a result to take it off the leaderboard.</p>
        <ResultsList
          results={data.results}
          onVoid={async (r) => {
            if (await confirm(`Void ${r.winnerName} vs ${r.loserName}?`, { confirmLabel: "Void" })) await run(() => api.voidMatchResult(guildId, r.id), "Result voided.");
          }}
        />
      </NeonCard>
    </div>
  );
}

export default function MatchesPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [setups, setSetups] = useState<MatchSetupRow[] | null>(null);
  const [builder, setBuilder] = useState<{ editing: MatchSetupRow | null } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"setups" | "board" | "queue" | "games" | "voice" | "messages" | "guide">("setups");
  const [roster, setRoster] = useState<Array<{ team: string; players: string[] }>>([]);
  const [results, setResults] = useState<MatchResultRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getMatchSetups(guildId).then(setSetups);
  }
  useEffect(refresh, [guildId]);

  const selected = setups?.find((s) => s.id === selectedId) ?? setups?.[0] ?? null;
  useEffect(() => {
    if (selected) api.getMatchResults(guildId, selected.id).then(setResults);
    else setResults([]);
    if (selected?.rosterView === "HIDDEN" && selected.livePhase === "SIGNUP") api.getMatchRoster(guildId, selected.id).then(setRoster).catch(() => setRoster([]));
    else setRoster([]);
  }, [guildId, selected?.id]);

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await action();
      setNotice(done);
      refresh();
      if (selected) setResults(await api.getMatchResults(guildId, selected.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
  }

  async function remove(s: MatchSetupRow) {
    if (!(await confirm(`Delete ${s.name}? Its panel, leaderboard and match history will be removed.`))) return;
    await run(() => api.deleteMatchSetup(guildId, s.id), `${s.name} deleted.`);
  }

  async function cancelLive(s: MatchSetupRow) {
    if (!(await confirm(`Cancel the current match for ${s.name}? Sign-ups reopen and nothing is recorded.`, { confirmLabel: "Cancel Match" }))) return;
    await run(() => api.cancelMatch(guildId, s.id), "Match canceled.");
  }

  async function voidResult(r: MatchResultRow) {
    if (!(await confirm(`Void match #${r.number}? This reverses its wins, rating and coins.`, { confirmLabel: "Void" }))) return;
    await run(() => api.voidMatchResult(guildId, r.id), `Match #${r.number} voided.`);
  }

  return (
    <div>
      <ModuleHeader
        guildId={guildId}
        moduleKey="MATCHES"
        title="Matchmaking"
        description="Tournaments, team matches, 1v1s, a live leaderboard and always-open matchmaking for any game."
      />

      <div className="flex gap-1 mb-5 border-b border-white/5 overflow-x-auto">
        {([["setups", "Tournaments and Matches"], ["board", "Leaderboard"], ["queue", "Matchmaking"], ["games", "Games"], ["voice", "Voice"], ["messages", "Messages"], ["guide", "Guide"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap shrink-0 ${tab === key ? "border-neon-blue text-neon-blue" : "border-transparent text-slate-500 hover:text-slate-300"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "guide" ? (
        <MatchmakingGuide
          guildId={guildId}
          onOpen={(next) => {
            setTab(next);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : tab === "games" ? (
        <SettingsTab guildId={guildId} />
      ) : tab === "voice" ? (
        <VoiceSettings guildId={guildId} />
      ) : tab === "messages" ? (
        <MessagesTab guildId={guildId} />
      ) : tab !== "setups" ? (
        <ConfigTabs key={tab} guildId={guildId} tab={tab} />
      ) : builder ? (
        <SetupBuilder
          guildId={guildId}
          editing={builder.editing}
          onCancel={() => setBuilder(null)}
          onDone={() => {
            setBuilder(null);
            setNotice("Saved. The panel updates in Discord within a few seconds.");
            refresh();
          }}
        />
      ) : (
        <div className="space-y-5">
          <NeonCard>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <p className="font-medium">Match Setups</p>
              <button type="button" onClick={() => setBuilder({ editing: null })} className="neon-button-sm">
                + New Setup
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-2">A setup holds all the rules for one game and format, with its own panel and leaderboard.</p>
            {notice && <p className="text-xs text-emerald-400 mb-2">{notice}</p>}
            <FormError message={error} />
            {setups === null && <p className="text-sm text-slate-500 py-4">Loading…</p>}
            {setups?.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">No setups yet. Build your first one to post a panel in Discord.</p>}
            <div className="divide-y divide-white/5">
              {setups?.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                  <button type="button" onClick={() => setSelectedId(s.id)} className="min-w-0 basis-full sm:basis-0 sm:flex-1 text-left">
                    <p className={`text-sm break-words ${selected?.id === s.id ? "text-neon-blue" : ""}`}>{s.name}</p>
                    <p className="text-xs text-slate-500 break-words">
                      {s.game} · {formatSummary(s)}
                    </p>
                    <p className="text-xs text-slate-600 break-words">
                      {s.mapWord}s: {mapSummary(s)}
                      {s.livePhase ? ` · ${PHASES[s.livePhase] ?? s.livePhase}` : ""}
                    </p>
                  </button>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setBuilder({ editing: s })} className="text-xs text-slate-400 hover:text-neon-blue py-1">
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(s)} className="text-xs text-slate-500 hover:text-rose-400 py-1">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </NeonCard>

          {selected && (
            <>
              <NeonCard>
                <p className="font-medium">Live Control: {selected.name}</p>
                <p className="text-xs text-slate-500 mb-3">
                  Season {selected.season} · {selected.livePhase ? PHASES[selected.livePhase] ?? selected.livePhase : "Starting up"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => cancelLive(selected)} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10">
                    Cancel Current Match
                  </button>
                </div>
              </NeonCard>

              {roster.length > 0 && (
                <NeonCard>
                  <p className="font-medium mb-1">Hidden Rosters</p>
                  <p className="text-xs text-slate-500 mb-3">Only staff can see this until registration closes.</p>
                  <div className="divide-y divide-white/5">
                    {roster.map((r) => (
                      <div key={r.team} className="py-2 text-sm">
                        <p>{r.team}</p>
                        <p className="text-xs text-slate-500 break-words">{r.players.join(", ") || "Open"}</p>
                      </div>
                    ))}
                  </div>
                </NeonCard>
              )}

              <NeonCard>
                <p className="font-medium mb-1">Match History</p>
                <p className="text-xs text-slate-500 mb-3">Void a result to reverse the wins, rating and coins it gave out.</p>
                {results.length === 0 && <p className="text-sm text-slate-500 py-3 text-center">No matches played with this setup yet.</p>}
                <div className="divide-y divide-white/5">
                  {results.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className={`break-words ${r.voided ? "line-through text-slate-500" : ""}`}>
                          #{r.number}: {r.winnerName} beat {r.loserName} {r.winnerScore}-{r.loserScore}
                        </p>
                        <p className="text-xs text-slate-500">
                          {r.map ? `${r.map} · ` : ""}
                          {new Date(r.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {r.voided ? (
                        <span className="text-xs text-rose-400 shrink-0">Voided</span>
                      ) : (
                        <button type="button" onClick={() => voidResult(r)} className="text-xs text-slate-500 hover:text-rose-400 shrink-0 py-1">
                          Void
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </NeonCard>
            </>
          )}
        </div>
      )}
    </div>
  );
}
