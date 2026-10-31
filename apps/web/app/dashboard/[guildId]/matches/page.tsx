"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { FormError } from "../../../../components/ui/FormError";
import { DateTimeZoneField } from "../../../../components/ui/DateTimeZoneField";
import { SaveStatus } from "../../../../components/ui/SaveStatus";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { api, type MatchPresetInput, type MatchPresetRow, type MatchResultRow, type MatchSetupInput, type MatchSetupRow, type MatchmakingConfigRow, type MatchmakingOverview } from "../../../../lib/api";

const STEPS = ["Game", "Format", "Teams", "Maps", "Schedule", "Match Flow", "Rewards", "Review"];
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
    if (!d.game.trim()) return "Enter the game this setup is for.";
    if (d.useRanks && d.ranks.length < 2) return "Add at least 2 ranks, or turn ranks off.";
    if (d.useRanks && d.ranks.length > 25) return "Discord menus hold up to 25 ranks.";
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

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">{children}</label>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-600 mt-1">{children}</p>;
}

function Choice({ on, title, hint, onClick, onRemove }: { on: boolean; title: string; hint: string; onClick: () => void; onRemove?: () => void }) {
  return (
    <div className="relative">
      <button type="button" onClick={onClick} className={`w-full h-full text-left rounded-lg border p-3 ${onRemove ? "pr-16" : ""} transition-colors ${on ? "border-neon-blue bg-base-800" : "border-white/10 bg-base-950 hover:border-white/25"}`}>
        <span className="block text-sm font-medium break-words">{title}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>
      </button>
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
                  <Label>Game name</Label>
                  <input className={inputClass} value={d.game} maxLength={80} onChange={(e) => set({ game: e.target.value })} placeholder="Any game" />
                </div>
              </div>
              <div>
                <Label>What does the score count?</Label>
                <input className={inputClass} value={d.scoreName} maxLength={30} onChange={(e) => set({ scoreName: e.target.value })} />
                <Hint>Rounds, Goals, Kills, Points, or anything else.</Hint>
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
                  <Hint>Separate them with commas. Up to 25.</Hint>
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
            <input className={inputClass} value={d.scoreName} maxLength={30} onChange={(e) => set({ scoreName: e.target.value })} />
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
            <Hint>Separate them with commas. Up to 25.</Hint>
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
        <Label>Games on the board</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 mb-1">
          {presets.map((p) => (
            <Choice key={p.id} on={config.games.includes(p.game)} title={p.game} hint={`${Math.max(2, p.teamSize)} per team`} onClick={() => set({ games: config.games.includes(p.game) ? config.games.filter((g) => g !== p.game) : [...config.games, p.game] })} />
          ))}
        </div>
        <Hint>Maps and team size come from each game's preset.</Hint>
        <div className="space-y-4 mt-4">
          <Toggle on={config.createVoice} label="Create voice channels" hint="One shared channel for a 1v1, one per team for team matches. Deleted when the match ends." onChange={(createVoice) => set({ createVoice })} />
          {config.createVoice && (
            <div>
              <Label>Voice channel category</Label>
              <ChannelSelect guildId={guildId} kind="category" value={config.voiceCategoryId} onChange={(voiceCategoryId) => set({ voiceCategoryId: voiceCategoryId || null })} placeholder="Same as the text channel" />
            </div>
          )}
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
  const [tab, setTab] = useState<"setups" | "board" | "queue" | "settings">("setups");
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
        {([["setups", "Tournaments and Matches"], ["board", "Leaderboard"], ["queue", "Matchmaking"], ["settings", "Settings"]] as const).map(([key, label]) => (
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

      {tab === "settings" ? (
        <SettingsTab guildId={guildId} />
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
