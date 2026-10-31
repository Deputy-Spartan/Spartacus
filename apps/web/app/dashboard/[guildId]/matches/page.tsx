"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { FormError } from "../../../../components/ui/FormError";
import { api, type MatchPresetRow, type MatchResultRow, type MatchSetupInput, type MatchSetupRow } from "../../../../lib/api";

const STEPS = ["Game", "Format", "Teams", "Maps", "Match Flow", "Rewards", "Review"];
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
  voteSeconds: 60,
  skipRecent: 0,
  checkIn: true,
  checkInSeconds: 120,
  autoMove: true,
  reportBy: "BOTH",
  lobbyVoiceId: null,
  team1VoiceId: null,
  team2VoiceId: null,
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
  const format = s.format === "SINGLE" ? "Single Match" : `Tournament, ${s.tournamentTeams} ${s.teamSize === 1 ? "players" : "teams"}`;
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
      if (d.voteSeconds < 10 || d.voteSeconds > 300) return "Voting time must be from 10 to 300 seconds.";
    }
    if (d.skipRecent < 0 || d.skipRecent > d.maps.length - 1) return `Skip recent must be from 0 to ${d.maps.length - 1}.`;
  }
  if (step === 4) {
    if (d.checkIn && d.format === "SINGLE" && (d.checkInSeconds < 15 || d.checkInSeconds > 600)) return "Check-in time must be from 15 to 600 seconds.";
    if (d.autoMove && !!d.team1VoiceId !== !!d.team2VoiceId) return "Pick a voice channel for both teams, or neither.";
  }
  if (step === 5) {
    if (!d.panelChannelId || !d.resultsChannelId) return "Pick a panel channel and a results channel.";
    if (d.panelChannelId === d.resultsChannelId) return "The panel and results need different channels.";
    if ([d.winCoins, d.lossCoins, d.championCoins].some((c) => !Number.isInteger(c) || c < 0)) return "Coin rewards must be whole numbers of 0 or more.";
  }
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Choice on={!tournament} title="Single Match" hint="One match. Teams are made fresh each time." onClick={() => set({ format: "SINGLE" })} />
                <Choice on={tournament} title="Tournament" hint="A bracket that ends with one champion." onClick={() => set({ format: "TOURNAMENT" })} />
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
              <div>
                <Label>How teams are split</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Choice on={d.balance === "BALANCED"} title="Balanced" hint={d.useRanks ? "Uses rank and match results." : "Uses match results."} onClick={() => set({ balance: "BALANCED" })} />
                  <Choice on={d.balance === "CAPTAINS"} title="Captains Draft" hint={tournament ? "Tournaments use Balanced instead." : "Two captains take turns picking."} onClick={() => set({ balance: "CAPTAINS" })} />
                  <Choice on={d.balance === "RANDOM"} title="Random" hint="The bot shuffles everyone." onClick={() => set({ balance: "RANDOM" })} />
                </div>
              </div>
              <div>
                <Label>Who are the captains?</Label>
                <select className={inputClass} value={d.captainRule} onChange={(e) => set({ captainRule: e.target.value as MatchSetupInput["captainRule"] })}>
                  <option value="TOP">Highest rated player on each team</option>
                  <option value="RANDOM">Random player on each team</option>
                </select>
              </div>
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
                        <input {...num("voteSeconds")} min={10} max={300} />
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
              {!tournament && <Toggle on={d.checkIn} label="Check-in" hint="Everyone readies up before teams are made, so no-shows don't ruin a match." onChange={(checkIn) => set({ checkIn })} />}
              {!tournament && d.checkIn && (
                <div>
                  <Label>Check-in seconds</Label>
                  <input {...num("checkInSeconds")} min={15} max={600} />
                </div>
              )}
              <Toggle on={d.autoMove} label="Move players to voice" hint="Moves teams into voice and back. Players must already be in a voice channel." onChange={(autoMove) => set({ autoMove })} />
              {d.autoMove && (
                <div className="grid grid-cols-1 gap-1">
                  <div>
                    <Label>First team voice channel</Label>
                    <ChannelSelect guildId={guildId} kind="voice" value={d.team1VoiceId} onChange={(id) => set({ team1VoiceId: id || null })} />
                  </div>
                  <div>
                    <Label>Second team voice channel</Label>
                    <ChannelSelect guildId={guildId} kind="voice" value={d.team2VoiceId} onChange={(id) => set({ team2VoiceId: id || null })} />
                  </div>
                  <div>
                    <Label>Lobby voice channel (players return here)</Label>
                    <ChannelSelect guildId={guildId} kind="voice" value={d.lobbyVoiceId} onChange={(id) => set({ lobbyVoiceId: id || null })} />
                  </div>
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

          {step === 5 && (
            <>
              <div>
                <Label>Panel channel</Label>
                <ChannelSelect guildId={guildId} value={d.panelChannelId || null} onChange={(panelChannelId) => set({ panelChannelId })} />
                <Hint>Members play here. Use a new channel and turn off Send Messages for members so chat can't bury the panel.</Hint>
              </div>
              <div>
                <Label>Results channel</Label>
                <ChannelSelect guildId={guildId} value={d.resultsChannelId || null} onChange={(resultsChannelId) => set({ resultsChannelId })} />
                <Hint>Holds the leaderboard, every result and the bracket.</Hint>
              </div>
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
              <Hint>Coins are paid while the Economy module is on.</Hint>
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

          {step === 6 && <p className="text-sm text-slate-400">Everything look right? Saving posts the panel in Discord within a few seconds.</p>}

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
            ["Ranks", d.useRanks ? `${d.ranks.length} ranks` : "Off"],
            ["Rewards", `${d.winCoins} coins for a win, ${d.lossCoins} for a loss`],
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

export default function MatchesPage({ params }: { params: { guildId: string } }) {
  const guildId = params.guildId;
  const confirm = useConfirm();
  const [setups, setSetups] = useState<MatchSetupRow[] | null>(null);
  const [builder, setBuilder] = useState<{ editing: MatchSetupRow | null } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  async function newSeason(s: MatchSetupRow) {
    if (!(await confirm(`Start a new season for ${s.name}? The leaderboard resets to zero. Ranks and ratings stay.`, { confirmLabel: "Start Season" }))) return;
    await run(() => api.startMatchSeason(guildId, s.id), "New season started.");
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
        title="Matches"
        description="Run single matches and tournaments for any game. Members play from one panel in Discord, and you control the rules here."
      />

      {builder ? (
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
                  <button type="button" onClick={() => newSeason(selected)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:border-white/25">
                    Start New Season
                  </button>
                </div>
              </NeonCard>

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
