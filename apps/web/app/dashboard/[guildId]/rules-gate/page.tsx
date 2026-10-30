"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type RulesGateSettingsRow, type RulesGateAgreementRow, type RulesGateSectionRow, type EmbedCreatorPresetRow } from "../../../../lib/api";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { EmbedCreatorPreview } from "../../../../components/embedCreator/EmbedCreatorPreview";
import { checkDiscordLimits } from "../../../../lib/discordLimits";
import Link from "next/link";

type Tab = "settings" | "activity";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "settings", label: "Settings", icon: "⚙️" },
  { key: "activity", label: "Activity", icon: "📊" },
];

const STEPS = [
  { label: "Channel & Role", hint: "Where it posts, what it grants" },
  { label: "Rules Message", hint: "Pick or write the embed" },
  { label: "Onboarding Extras", hint: "Role swap, log, DM, account age" },
  { label: "Sections", hint: "Optional per-topic buttons" },
  { label: "Decline Option", hint: "Optional \"I Don't Agree\"" },
  { label: "Reminders", hint: "Optional nudge DM" },
  { label: "Button Messages", hint: "Customize what it says" },
  { label: "Maintenance", hint: "Re-verify after rule changes" },
] as const;

const DEFAULT_AGREE_REPLY = "✅ Thanks — you now have access!";
const DEFAULT_ALREADY_AGREED = "You've already agreed!";
const DEFAULT_NO_ROLE_CONFIGURED = "This server hasn't configured a role to grant yet — ask an admin to set one up.";
const DEFAULT_DM_CONFIRM = "✅ Thanks for agreeing to the rules in **{server}** — you now have access!";
const DEFAULT_EMBED_TITLE = "📜 Server Rules";
const DEFAULT_EMBED_DESCRIPTION = "Click the button below to confirm you've read and agree to the rules.";
const DEFAULT_ACCOUNT_TOO_NEW = "Your Discord account is too new to agree to the rules in **{server}** yet — try again in a few days.";
const DEFAULT_DECLINE_REPLY_CHANNEL = "No worries — head to {channel} if you have questions about the rules before agreeing.";
const DEFAULT_DECLINE_REPLY_KICK = "Understood — you'll be removed from **{server}** since you don't agree to the rules.";
const DEFAULT_REMINDER =
  '👋 Just a reminder — you still need to agree to the rules in **{server}** to get full access. Head back to the server and click "I Agree".';

export default function RulesGatePage({ params }: { params: { guildId: string } }) {
  const [tab, setTab] = useState<Tab>("settings");
  const [settings, setSettings] = useState<RulesGateSettingsRow | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getRulesGateSettings(params.guildId).then(setSettings);
  }, [params.guildId]);

  async function update(patch: Partial<RulesGateSettingsRow>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    await api.updateRulesGateSettings(params.guildId, patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="RULES_GATE"
        title="Rules"
        description="Posts your rules embed with an '✅ I Agree' button in a channel — clicking it grants a role, confirming the member has read the rules."
      />

      <div className="flex gap-2 mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
              tab === t.key ? "bg-neon-blue/15 border-neon-blue/40 text-white" : "border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
        {saved && <p className="text-xs text-emerald-400 self-center ml-1">Saved ✓</p>}
      </div>

      {tab === "settings" && <SettingsTab guildId={params.guildId} settings={settings} update={update} />}
      {tab === "activity" && <ActivityTab guildId={params.guildId} />}
    </div>
  );
}

function SettingsTab({
  guildId,
  settings,
  update,
}: {
  guildId: string;
  settings: RulesGateSettingsRow | null;
  update: (patch: Partial<RulesGateSettingsRow>) => void;
}) {
  const [step, setStep] = useState(0);
  const lastStep = STEPS.length - 1;
  const stepNav = <StepNav step={step} lastStep={lastStep} setStep={setStep} />;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Desktop: full step list, clickable, in a left column. */}
      <div className="hidden lg:flex lg:flex-col lg:gap-1 lg:w-[220px] lg:flex-none">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStep(i)}
            className={`flex items-center gap-2.5 text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
              i === step
                ? "bg-neon-blue/15 border-neon-blue/40 text-white"
                : i < step
                ? "border-white/5 text-slate-400 hover:text-white hover:border-white/15"
                : "border-white/5 text-slate-500 hover:text-white hover:border-white/15"
            }`}
          >
            <span
              className={`flex-none w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                i < step ? "bg-emerald-500/20 text-emerald-400" : i === step ? "bg-neon-blue/30 text-white" : "bg-white/5 text-slate-500"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span>
              <span className="block font-medium">{s.label}</span>
              <span className="block text-[10px] text-slate-500 font-normal">{s.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Mobile: compact wrapping dot progress, no horizontal scroll to lose track of. */}
      <div className="flex flex-wrap gap-1.5 lg:hidden w-full">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStep(i)}
            aria-label={`Step ${i + 1}: ${s.label}`}
            className={`flex-none w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold border transition-colors ${
              i === step
                ? "bg-neon-blue/25 border-neon-blue/60 text-white"
                : i < step
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                : "border-white/10 text-slate-500"
            }`}
          >
            {i < step ? "✓" : i + 1}
          </button>
        ))}
      </div>

      <div className="flex-1 w-full min-w-0">
        <p className="text-xs text-slate-500 mb-3">
          Step {step + 1} of {STEPS.length} — {STEPS[step].label}
        </p>

        {step === 0 && (
          <NeonCard className="max-w-xl">
            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Rules Channel</label>
            <ChannelSelect
              guildId={guildId}
              value={settings?.channelId ?? null}
              onChange={(id) => update({ channelId: id || null })}
              kind="text"
              placeholder="Off — no panel posted"
            />

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Role to Grant</label>
            <RoleSelect
              guildId={guildId}
              value={settings?.roleId ?? null}
              onChange={(id) => update({ roleId: id || null })}
              placeholder="No role configured yet"
            />
          </NeonCard>
        )}

        {step === 1 && (
          // Side by side only from xl up — below that the step list + app
          // sidebar leave too little room, so the preview stacks underneath
          // at full width instead of squeezing into a narrow column.
          // Back/Next live in the left column with the settings card so they
          // stay next to the step instead of dropping below a tall preview.
          <div className="flex flex-col xl:flex-row gap-5 items-start">
            <div className="w-full max-w-xl xl:w-[420px] xl:flex-none">
              <NeonCard>
                <p className="text-xs text-slate-500 mb-4">
                  Build the full rules message (title, images, links, multiple fields — even multiple embeds) in the{" "}
                  <Link href={`/dashboard/${guildId}/embed-creator`} className="text-neon-blue hover:underline">
                    Embed Creator
                  </Link>
                  , then pick it here. Saving posts (or reposts) it right away.
                </p>
                <SavedEmbedPicker guildId={guildId} value={settings?.savedEmbedId ?? null} onChange={(id) => update({ savedEmbedId: id })} />

                {!settings?.savedEmbedId && (
                  <div className="mt-5 pt-5 border-t border-white/5">
                    <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Default Embed Title</label>
                    <input
                      type="text"
                      value={settings?.defaultEmbedTitle ?? ""}
                      onChange={(e) => update({ defaultEmbedTitle: e.target.value || null })}
                      placeholder={DEFAULT_EMBED_TITLE}
                      className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50"
                    />
                    <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-3">Default Embed Description</label>
                    <textarea
                      value={settings?.defaultEmbedDescription ?? ""}
                      onChange={(e) => update({ defaultEmbedDescription: e.target.value || null })}
                      placeholder={DEFAULT_EMBED_DESCRIPTION}
                      rows={2}
                      className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50 resize-none"
                    />
                    <p className="text-xs text-slate-600 mt-1">
                      What gets posted when no saved embed is selected above — pick a saved embed instead for full control (images, links,
                      fields).
                    </p>
                  </div>
                )}
              </NeonCard>
              {stepNav}
            </div>
            <div className="w-full max-w-xl xl:max-w-[640px] xl:flex-1 xl:min-w-0 xl:sticky xl:top-5">
              <EmbedPreviewBlock guildId={guildId} savedEmbedId={settings?.savedEmbedId ?? null} />
            </div>
          </div>
        )}

        {step === 2 && (
          <NeonCard className="max-w-xl">
            <p className="text-xs text-slate-500 mb-4">
              Optional add-ons that make the rules gate double as the last step of verification instead of a standalone embed.
            </p>

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Role to Remove on Agree</label>
            <p className="text-xs text-slate-500 mb-2">
              Strip a pending/unverified role (e.g. @Unverified) the moment someone agrees — pairs well with Verification or the Rules Gate
              acting as your final gate.
            </p>
            <RoleSelect
              guildId={guildId}
              value={settings?.roleToRemoveId ?? null}
              onChange={(id) => update({ roleToRemoveId: id || null })}
              placeholder="None — don't remove any role"
            />

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Agreement Log Channel</label>
            <p className="text-xs text-slate-500 mb-2">Posts a line here every time a member agrees — a lightweight audit trail for staff.</p>
            <ChannelSelect
              guildId={guildId}
              value={settings?.logChannelId ?? null}
              onChange={(id) => update({ logChannelId: id || null })}
              kind="text"
              placeholder="Off — no log posted"
            />

            <div className="flex items-center justify-between mt-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">DM Confirmation</p>
                <p className="text-xs text-slate-500 mt-0.5">Send the member a DM when they agree, in addition to the in-channel reply.</p>
              </div>
              <ToggleSwitch enabled={settings?.dmConfirmEnabled ?? false} onChange={(v) => update({ dmConfirmEnabled: v })} />
            </div>

            <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Minimum Account Age (days)</label>
            <p className="text-xs text-slate-500 mb-2">
              Rejects the agree click if the member's Discord account is younger than this — helps against alt/raid accounts.
            </p>
            <input
              type="number"
              min={0}
              value={settings?.minAccountAgeDays ?? ""}
              onChange={(e) => update({ minAccountAgeDays: e.target.value ? Number(e.target.value) : null })}
              placeholder="Off — no minimum"
              className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50"
            />
            {settings?.minAccountAgeDays != null && (
              <>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-3">Account-Too-New Reply</label>
                <textarea
                  value={settings.accountTooNewMessage ?? ""}
                  onChange={(e) => update({ accountTooNewMessage: e.target.value || null })}
                  placeholder={DEFAULT_ACCOUNT_TOO_NEW}
                  rows={2}
                  className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50 resize-none"
                />
              </>
            )}
          </NeonCard>
        )}

        {step === 3 && <SectionsCard guildId={guildId} />}
        {step === 4 && <DeclineCard guildId={guildId} settings={settings} update={update} />}
        {step === 5 && <ReminderCard settings={settings} update={update} />}
        {step === 6 && <MessagesCard settings={settings} update={update} />}
        {step === 7 && <VersionCard guildId={guildId} settings={settings} />}

        {step !== 1 && stepNav}
      </div>
    </div>
  );
}

function StepNav({ step, lastStep, setStep }: { step: number; lastStep: number; setStep: React.Dispatch<React.SetStateAction<number>> }) {
  return (
    <div className="flex items-center justify-between max-w-xl mt-5 gap-3">
      <button
        type="button"
        onClick={() => setStep((s) => Math.max(0, s - 1))}
        disabled={step === 0}
        className="text-xs font-medium px-4 py-2.5 lg:py-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-30"
      >
        ← Back
      </button>
      {step < lastStep ? (
        <button
          type="button"
          onClick={() => setStep((s) => Math.min(lastStep, s + 1))}
          className="flex-1 lg:flex-none text-xs font-medium px-4 py-2.5 lg:py-1.5 rounded-lg bg-neon-blue/15 border border-neon-blue/40 text-white hover:bg-neon-blue/25 transition-colors text-center"
        >
          Next →
        </button>
      ) : (
        <span className="text-xs text-emerald-400">✓ That's every step — you're all set.</span>
      )}
    </div>
  );
}

function EmbedPreviewBlock({ guildId, savedEmbedId }: { guildId: string; savedEmbedId: string | null }) {
  const [presets, setPresets] = useState<EmbedCreatorPresetRow[]>([]);

  useEffect(() => {
    api.getEmbedCreatorPresets(guildId).then(setPresets);
  }, [guildId]);

  if (!savedEmbedId) {
    return (
      <NeonCard>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 block mb-2">Preview</label>
        <p className="text-xs text-slate-500">Pick a saved embed on the left to see a live preview of what gets posted here.</p>
      </NeonCard>
    );
  }
  const preset = presets.find((p) => p.id === savedEmbedId);
  if (!preset) return null;
  const limits = checkDiscordLimits(preset.data);
  // The gate appends its own Agree row (plus a Sections row), so the saved
  // embed's rows need to leave room under Discord's 5-row cap.
  const savedRows = preset.data.components.filter((r) => r.type).length;
  const rowProblem = savedRows + 2 > 5 ? `This embed has ${savedRows} button rows — the Rules panel needs up to 2 more for its own buttons, and Discord allows 5 total.` : null;

  return (
    <NeonCard>
      {(limits.hasErrors || rowProblem) && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
          <p className="text-xs font-semibold text-rose-300 mb-1">⛔ Discord will reject this — the rules won't post until it's fixed:</p>
          <ul className="space-y-0.5">
            {limits.issues
              .filter((i) => i.level === "error")
              .map((i) => i.message)
              .concat(rowProblem ? [rowProblem] : [])
              .map((m, idx) => (
                <li key={idx} className="text-xs text-rose-300">• {m}</li>
              ))}
          </ul>
        </div>
      )}
      <div className="flex items-center justify-between mb-2.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</label>
        <Link href={`/dashboard/${guildId}/embed-creator`} className="text-[11px] text-neon-blue hover:underline">
          Edit in Embed Creator
        </Link>
      </div>
      {/* Capped to the viewport and scrolls inside itself, so a long
          multi-embed rules message never runs off the bottom of the screen. */}
      <div className="bg-base-950 border border-white/10 rounded-lg p-3 max-h-[70vh] xl:max-h-[calc(100vh-8rem)] overflow-y-auto">
        <EmbedCreatorPreview guildId={guildId} state={preset.data} />
      </div>
    </NeonCard>
  );
}

function SectionsCard({ guildId }: { guildId: string }) {
  const [sections, setSections] = useState<RulesGateSectionRow[]>([]);
  const [label, setLabel] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getRulesGateSections(guildId).then(setSections);
  }
  useEffect(refresh, [guildId]);

  async function add() {
    if (!label.trim() || !roleId) return;
    setError(null);
    try {
      await api.addRulesGateSection(guildId, { label: label.trim(), roleId });
      setLabel("");
      setRoleId(null);
      refresh();
    } catch {
      setError("Couldn't add that section — up to 4 are supported.");
    }
  }

  async function remove(id: string) {
    await api.deleteRulesGateSection(guildId, id);
    refresh();
  }

  return (
    <NeonCard className="max-w-xl">
      <p className="font-medium mb-1">Sections (Optional)</p>
      <p className="text-xs text-slate-500 mb-4">
        Add extra buttons next to "I Agree" for per-topic acknowledgment (e.g. "Trading Rules", "Voice Chat Rules") — each grants its own role,
        independent of the main agreement. Up to 4.
      </p>

      {sections.length > 0 && (
        <div className="flex flex-col divide-y divide-white/5 mb-4">
          {sections.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-white">{s.label}</span>
              <button onClick={() => remove(s.id)} className="text-xs text-slate-500 hover:text-red-400">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {sections.length < 4 && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Section label, e.g. Trading Rules"
            className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50"
          />
          <RoleSelect guildId={guildId} value={roleId} onChange={setRoleId} placeholder="Role to grant for this section" />
          <button
            onClick={add}
            disabled={!label.trim() || !roleId}
            className="self-start text-xs font-medium px-3 py-1.5 rounded-lg bg-neon-blue/10 border border-neon-blue/40 text-neon-blue hover:bg-neon-blue/20 transition-colors disabled:opacity-40"
          >
            + Add Section
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </NeonCard>
  );
}

function DeclineCard({
  guildId,
  settings,
  update,
}: {
  guildId: string;
  settings: RulesGateSettingsRow | null;
  update: (patch: Partial<RulesGateSettingsRow>) => void;
}) {
  const declineRef = useRef<HTMLTextAreaElement>(null);

  return (
    <NeonCard className="max-w-xl">
      <div className="flex items-center justify-between mb-1">
        <p className="font-medium">"I Don't Agree" Button</p>
        <ToggleSwitch enabled={settings?.declineEnabled ?? false} onChange={(v) => update({ declineEnabled: v })} />
      </div>
      <p className="text-xs text-slate-500 mb-4">Adds a second button for members who don't agree, instead of leaving them stuck with no role.</p>

      {settings?.declineEnabled && (
        <>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">When Clicked</label>
          <select
            value={settings.declineAction}
            onChange={(e) => update({ declineAction: e.target.value as RulesGateSettingsRow["declineAction"] })}
            className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-blue/50"
          >
            <option value="NONE">Just reply — no other action</option>
            <option value="CHANNEL">Point them to a channel</option>
            <option value="KICK">Kick them from the server</option>
          </select>

          {settings.declineAction === "CHANNEL" && (
            <>
              <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Channel to Point To</label>
              <ChannelSelect
                guildId={guildId}
                value={settings.declineChannelId}
                onChange={(id) => update({ declineChannelId: id || null })}
                kind="text"
                placeholder="No channel set"
              />
            </>
          )}

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Reply Message</label>
          <textarea
            ref={declineRef}
            value={settings.declineReplyMessage ?? ""}
            onChange={(e) => update({ declineReplyMessage: e.target.value || null })}
            placeholder={settings.declineAction === "KICK" ? DEFAULT_DECLINE_REPLY_KICK : DEFAULT_DECLINE_REPLY_CHANNEL}
            rows={2}
            className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50 resize-none"
          />
          <PlaceholderExamples
            items={settings.declineAction === "CHANNEL" ? [...SERVER_TOKEN, { token: "{channel}", description: "The configured channel mention" }] : SERVER_TOKEN}
            inputRef={declineRef}
            value={settings.declineReplyMessage ?? ""}
            onChange={(v) => update({ declineReplyMessage: v || null })}
          />
        </>
      )}
    </NeonCard>
  );
}

function ReminderCard({
  settings,
  update,
}: {
  settings: RulesGateSettingsRow | null;
  update: (patch: Partial<RulesGateSettingsRow>) => void;
}) {
  const reminderRef = useRef<HTMLTextAreaElement>(null);

  return (
    <NeonCard className="max-w-xl">
      <div className="flex items-center justify-between mb-1">
        <p className="font-medium">Reminder DM</p>
        <ToggleSwitch enabled={settings?.reminderEnabled ?? false} onChange={(v) => update({ reminderEnabled: v })} />
      </div>
      <p className="text-xs text-slate-500 mb-4">
        DMs members who joined but haven't agreed yet, after a delay — a nudge for people who miss the rules channel. Optionally keeps
        repeating weekly until they agree.
      </p>

      {settings?.reminderEnabled && (
        <>
          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Delay (hours)</label>
          <input
            type="number"
            min={1}
            value={settings.reminderDelayHours}
            onChange={(e) => update({ reminderDelayHours: Number(e.target.value) || 1 })}
            className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-blue/50"
          />

          <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Reminder Message</label>
          <textarea
            ref={reminderRef}
            value={settings.reminderMessage ?? ""}
            onChange={(e) => update({ reminderMessage: e.target.value || null })}
            placeholder={DEFAULT_REMINDER}
            rows={2}
            className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50 resize-none"
          />
          <PlaceholderExamples items={SERVER_TOKEN} inputRef={reminderRef} value={settings.reminderMessage ?? ""} onChange={(v) => update({ reminderMessage: v || null })} />

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/5">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Repeat Weekly</p>
              <p className="text-xs text-slate-500 mt-0.5">Keep sending the reminder on a set day/time each week until they agree.</p>
            </div>
            <ToggleSwitch
              enabled={settings.reminderRepeatEnabled}
              onChange={(v) =>
                update({
                  reminderRepeatEnabled: v,
                  reminderRepeatWeekday: v ? settings.reminderRepeatWeekday ?? 1 : settings.reminderRepeatWeekday,
                  reminderRepeatHour: v ? settings.reminderRepeatHour ?? 12 : settings.reminderRepeatHour,
                })
              }
            />
          </div>

          {settings.reminderRepeatEnabled && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Day</label>
                <select
                  value={settings.reminderRepeatWeekday ?? 1}
                  onChange={(e) => update({ reminderRepeatWeekday: Number(e.target.value) })}
                  className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-blue/50"
                >
                  {WEEKDAYS.map((label, i) => (
                    <option key={label} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Time (UTC)</label>
                <select
                  value={settings.reminderRepeatHour ?? 12}
                  onChange={(e) => update({ reminderRepeatHour: Number(e.target.value) })}
                  className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon-blue/50"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {h.toString().padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>
              <p className="col-span-2 text-xs text-slate-600">
                Times are in UTC (server time), not your local timezone. The reminder keeps repeating on this day/time until the member
                agrees or leaves.
              </p>
            </div>
          )}
        </>
      )}
    </NeonCard>
  );
}

function VersionCard({ guildId, settings }: { guildId: string; settings: RulesGateSettingsRow | null }) {
  const confirm = useConfirm();
  const [bumping, setBumping] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function bump() {
    const ok = await confirm(
      "Bump the rules version and revoke the granted role from everyone who currently has it? They'll need to click \"I Agree\" again — this does not touch the audit trail.",
      { title: "New rules version", confirmLabel: "Bump version", danger: true }
    );
    if (!ok) return;
    setBumping(true);
    const res = await api.bumpRulesGateVersion(guildId);
    setBumping(false);
    setResult(`Now on v${res.newVersion} — revoked the role from ${res.revoked} member${res.revoked === 1 ? "" : "s"}.`);
  }

  return (
    <NeonCard className="max-w-xl">
      <p className="font-medium mb-1">New Rules Version</p>
      <p className="text-xs text-slate-500 mb-3">
        Updated the rules? Bump the version to revoke the role from everyone who currently has it, so they have to re-read and agree again.
        Currently on <b>v{settings?.rulesVersion ?? 1}</b>.
      </p>
      <button
        onClick={bump}
        disabled={bumping}
        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
      >
        {bumping ? "Bumping…" : "New Rules Version"}
      </button>
      {result && <p className="text-xs text-emerald-400 mt-2">{result}</p>}
    </NeonCard>
  );
}

const SERVER_TOKEN = [{ token: "{server}", description: "This server's name" }];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function MessagesCard({
  settings,
  update,
}: {
  settings: RulesGateSettingsRow | null;
  update: (patch: Partial<RulesGateSettingsRow>) => void;
}) {
  const agreeRef = useRef<HTMLTextAreaElement>(null);
  const alreadyRef = useRef<HTMLTextAreaElement>(null);
  const noRoleRef = useRef<HTMLTextAreaElement>(null);
  const dmRef = useRef<HTMLTextAreaElement>(null);

  if (!settings) return null;

  return (
    <NeonCard className="max-w-xl">
      <p className="font-medium mb-1">Messages</p>
      <p className="text-xs text-slate-500 mb-4">
        Customize what gets sent when a member clicks "I Agree". All fields are optional — leave blank to use the default shown as a
        placeholder.
      </p>

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Reply on Successful Agree</label>
      <textarea
        ref={agreeRef}
        value={settings.agreeReplyMessage ?? ""}
        onChange={(e) => update({ agreeReplyMessage: e.target.value || null })}
        placeholder={DEFAULT_AGREE_REPLY}
        rows={2}
        className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50 resize-none"
      />
      <PlaceholderExamples items={SERVER_TOKEN} inputRef={agreeRef} value={settings.agreeReplyMessage ?? ""} onChange={(v) => update({ agreeReplyMessage: v || null })} />

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Reply When Already Agreed</label>
      <textarea
        ref={alreadyRef}
        value={settings.alreadyAgreedMessage ?? ""}
        onChange={(e) => update({ alreadyAgreedMessage: e.target.value || null })}
        placeholder={DEFAULT_ALREADY_AGREED}
        rows={2}
        className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50 resize-none"
      />

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">Reply When No Role Is Configured</label>
      <textarea
        ref={noRoleRef}
        value={settings.noRoleConfiguredMessage ?? ""}
        onChange={(e) => update({ noRoleConfiguredMessage: e.target.value || null })}
        placeholder={DEFAULT_NO_ROLE_CONFIGURED}
        rows={2}
        className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50 resize-none"
      />

      <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2 mt-4">DM Confirmation Message</label>
      <textarea
        ref={dmRef}
        value={settings.dmConfirmMessage ?? ""}
        onChange={(e) => update({ dmConfirmMessage: e.target.value || null })}
        placeholder={DEFAULT_DM_CONFIRM}
        rows={2}
        disabled={!settings.dmConfirmEnabled}
        className="w-full bg-base-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-neon-blue/50 resize-none disabled:opacity-40"
      />
      <p className="text-xs text-slate-600 mt-1">Only sent when DM Confirmation is toggled on above.</p>
      <PlaceholderExamples items={SERVER_TOKEN} inputRef={dmRef} value={settings.dmConfirmMessage ?? ""} onChange={(v) => update({ dmConfirmMessage: v || null })} />
    </NeonCard>
  );
}

function ActivityTab({ guildId }: { guildId: string }) {
  const [agreements, setAgreements] = useState<RulesGateAgreementRow[] | null>(null);
  const [isGuildOwner, setIsGuildOwner] = useState(false);
  const [purging, setPurging] = useState(false);
  const confirm = useConfirm();

  function refresh() {
    api.getRulesGateAgreements(guildId).then(setAgreements);
  }

  useEffect(() => {
    refresh();
    api.getGuilds().then((rows) => setIsGuildOwner(!!rows.find((g) => g.id === guildId)?.owner)).catch(() => null);
  }, [guildId]);

  async function purge() {
    const ok = await confirm("Permanently delete the entire rules-agreement audit trail for this server? This can't be undone.", {
      title: "Purge audit trail",
      confirmLabel: "Purge everything",
      danger: true,
    });
    if (!ok) return;
    setPurging(true);
    await api.purgeRulesGateAgreements(guildId);
    setPurging(false);
    refresh();
  }

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <NeonCard>
        <p className="font-medium mb-1">Audit Trail</p>
        <p className="text-xs text-slate-500 mb-4">
          Every member who has clicked "I Agree", most recent first — kept here even if they later leave or lose the role, so it's a true
          historical record. Most recent 200 shown.
        </p>

        {agreements === null && <p className="text-xs text-slate-500">Loading…</p>}
        {agreements?.length === 0 && <p className="text-xs text-slate-500">No agreements recorded yet.</p>}

        {agreements && agreements.length > 0 && (
          <div className="flex flex-col divide-y divide-white/5 -mx-1">
            {agreements.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-1 py-2.5 text-sm">
                <div>
                  <p className="text-white">
                    {a.username} <span className="text-slate-500 font-mono text-xs">({a.userId})</span>
                  </p>
                  {a.roleId && <p className="text-xs text-slate-500">granted role {a.roleId}</p>}
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap">{new Date(a.agreedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </NeonCard>

      {isGuildOwner && (
        <NeonCard className="border-red-500/20">
          <p className="font-medium mb-1 text-red-400">Danger Zone</p>
          <p className="text-xs text-slate-500 mb-3">Permanently deletes the audit trail above for this server. Server owner only.</p>
          <button
            onClick={purge}
            disabled={purging}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {purging ? "Purging…" : "Purge Audit Trail"}
          </button>
        </NeonCard>
      )}
    </div>
  );
}
