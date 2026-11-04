"use client";

import { useEffect, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { EmojiPicker } from "../../../../components/ui/EmojiPicker";
import { Required } from "../../../../components/ui/Required";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import { SavedEmbedPreview } from "../../../../components/embedCreator/SavedEmbedPreview";
import { DiscordButton, DiscordButtonRow, DiscordEmbed, DiscordMessage } from "../../../../components/ui/DiscordPreview";
import { api, type VerificationConfig, type VerificationLogRow } from "../../../../lib/api";
import { useAutoSave } from "../../../../lib/useAutoSave";
import { SaveStatus } from "../../../../components/ui/SaveStatus";

// Same defaults the bot uses (apps/bot/src/modules/security/verification.ts).
const D = {
  title: "✅ Verify Yourself",
  description: "Click the button below to verify and get access to the rest of the server.",
  color: "#57F287",
  buttonLabel: "Verify",
  buttonEmoji: "✅",
  verified: "✅ You're verified! Welcome to **{server}**.",
  alreadyVerified: "You're already verified!",
  noRole: "Verification isn't set up in this server yet. Ask an admin to pick a Verified role.",
  tooNew: "Your Discord account is too new to verify in **{server}** yet. Try again in a few days.",
  noAvatar: "Add a profile picture to your Discord account, then press Verify again.",
  captchaPrompt: "🤖 Quick check: tap the button that shows **{code}**.",
  captchaWrong: "❌ That wasn't the right code. Press Verify to try again.",
  dmConfirm: "✅ You're verified in **{server}**. Enjoy the server!",
  reminder: "👋 Just a reminder: you still need to verify in **{server}** to get access. Head back and press Verify.",
  kick: "You were removed from **{server}** because you didn't verify in time. You're welcome to join again and verify.",
};

const STEPS = [
  { label: "Channel & Role", hint: "Where it posts, what it gives" },
  { label: "Verify Message", hint: "The panel and its button" },
  { label: "Verify Method", hint: "One tap, or a captcha" },
  { label: "Safety Checks", hint: "Account age, avatar, wrong tries" },
  { label: "Join Extras", hint: "Unverified role, log, DM" },
  { label: "Reminders & Kick", hint: "Nudge, then remove" },
  { label: "Button Messages", hint: "What the replies say" },
  { label: "Maintenance", hint: "Repost, verify everyone here" },
] as const;

const label = "text-xs uppercase tracking-wide text-slate-500 block mb-2";
const field = "w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm";
const hint = "text-xs text-slate-500";
const fill = (t: string | null | undefined, d: string) => (t?.trim() ? t : d).replace(/\{server\}/g, "your server").replace(/\{code\}/g, "`K7Q2`");

type Tab = "settings" | "activity";
type Update = (patch: Partial<VerificationConfig>) => void;

export default function VerificationPage({ params }: { params: { guildId: string } }) {
  const [tab, setTab] = useState<Tab>("settings");
  const [config, setConfig] = useState<VerificationConfig | null>(null);

  useEffect(() => {
    api.getVerification(params.guildId).then(setConfig);
  }, [params.guildId]);

  const autoSave = useAutoSave(config, async () => {
    if (config) await api.setVerification(params.guildId, config);
  });
  const update: Update = (patch) => setConfig((c) => (c ? { ...c, ...patch } : c));

  if (!config) return <p className="text-slate-400">Loading…</p>;

  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="VERIFICATION"
        title="Verification"
        description="Posts a Verify panel in a channel. New members press Verify (or run /verify) to pass the checks you set and get the Verified role."
      />

      <div className="flex items-center gap-2 mb-5">
        {(
          [
            ["settings", "⚙️ Settings"],
            ["activity", "📊 Activity"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
              tab === k ? "bg-neon-blue/15 border-neon-blue/40 text-white" : "border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            {l}
          </button>
        ))}
        <SaveStatus status={autoSave} />
      </div>

      {tab === "settings" ? <SettingsTab guildId={params.guildId} config={config} update={update} /> : <ActivityTab guildId={params.guildId} pending={config.pendingCount ?? 0} />}
    </div>
  );
}

function SettingsTab({ guildId, config, update }: { guildId: string; config: VerificationConfig; update: Update }) {
  const [step, setStep] = useState(0);
  const last = STEPS.length - 1;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="hidden lg:flex lg:flex-col lg:gap-1 lg:w-[220px] lg:flex-none">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStep(i)}
            className={`flex items-center gap-2.5 text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
              i === step ? "bg-neon-blue/15 border-neon-blue/40 text-white" : "border-white/5 text-slate-400 hover:text-white hover:border-white/15"
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

      <div className="flex flex-wrap gap-1.5 lg:hidden w-full">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStep(i)}
            aria-label={`Step ${i + 1}: ${s.label}`}
            className={`flex-none w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold border transition-colors ${
              i === step ? "bg-neon-blue/25 border-neon-blue/60 text-white" : i < step ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : "border-white/10 text-slate-500"
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

        {step === 0 && <ChannelRoleStep guildId={guildId} config={config} update={update} />}
        {step === 1 && <MessageStep guildId={guildId} config={config} update={update} />}
        {step === 2 && <MethodStep config={config} update={update} />}
        {step === 3 && <SafetyStep config={config} update={update} />}
        {step === 4 && <ExtrasStep guildId={guildId} config={config} update={update} />}
        {step === 5 && <ReminderStep config={config} update={update} />}
        {step === 6 && <RepliesStep config={config} update={update} />}
        {step === 7 && <MaintenanceStep guildId={guildId} config={config} />}

        <div className="flex items-center justify-between max-w-xl mt-5 gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-xs font-medium px-4 py-2.5 lg:py-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-30"
          >
            ← Back
          </button>
          {step < last ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(last, s + 1))}
              className="flex-1 lg:flex-none text-xs font-medium px-4 py-2.5 lg:py-1.5 rounded-lg bg-neon-blue/15 border border-neon-blue/40 text-white hover:bg-neon-blue/25 transition-colors text-center"
            >
              Next →
            </button>
          ) : (
            <span className="text-xs text-emerald-400">✓ That's every step — you're all set.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Steps ----

function ChannelRoleStep({ guildId, config, update }: { guildId: string; config: VerificationConfig; update: Update }) {
  return (
    <NeonCard className="max-w-xl">
      <label className={label}>
        Verified Role <Required />
      </label>
      <RoleSelect guildId={guildId} value={config.verifiedRoleId} onChange={(id) => update({ verifiedRoleId: id || null })} />
      <p className={`${hint} mt-1`}>Given when someone verifies. Make it the role that can see the rest of your server.</p>

      <label className={`${label} mt-4`}>Panel Channel</label>
      <ChannelSelect guildId={guildId} value={config.panelChannelId} onChange={(id) => update({ panelChannelId: id || null })} kind="text" placeholder="Off — /verify only" />
      <p className={`${hint} mt-1`}>Where the Verify panel is posted. New members should be able to see this channel. Leave it off to only use /verify.</p>
    </NeonCard>
  );
}

function PanelPreview({ guildId, config }: { guildId: string; config: VerificationConfig }) {
  const custom = !!config.buttonLabel?.trim();
  const button = <DiscordButton label={config.buttonLabel?.trim() || D.buttonLabel} emoji={custom ? config.buttonEmoji : config.buttonEmoji || D.buttonEmoji} style="success" />;
  if (config.savedEmbedId) {
    return (
      <div className="space-y-2">
        <SavedEmbedPreview guildId={guildId} savedEmbedId={config.savedEmbedId} />
        <DiscordButtonRow>{button}</DiscordButtonRow>
        <p className={hint}>The Verify button is added under your saved embed.</p>
      </div>
    );
  }
  return (
    <DiscordMessage>
      <DiscordEmbed color={config.embedColor || D.color} title={config.defaultEmbedTitle || D.title} description={config.defaultEmbedDescription || D.description} />
      <DiscordButtonRow>{button}</DiscordButtonRow>
    </DiscordMessage>
  );
}

function MessageStep({ guildId, config, update }: { guildId: string; config: VerificationConfig; update: Update }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <NeonCard>
        <SavedEmbedPicker guildId={guildId} value={config.savedEmbedId} onChange={(id) => update({ savedEmbedId: id })} />
        {!config.savedEmbedId && (
          <>
            <label className={label}>Embed Title</label>
            <input className={field} value={config.defaultEmbedTitle ?? ""} placeholder={D.title} maxLength={256} onChange={(e) => update({ defaultEmbedTitle: e.target.value })} />
            <label className={`${label} mt-4`}>Embed Description</label>
            <textarea
              className={`${field} min-h-24`}
              value={config.defaultEmbedDescription ?? ""}
              placeholder={D.description}
              onChange={(e) => update({ defaultEmbedDescription: e.target.value })}
            />
            <label className={`${label} mt-4`}>Embed Color</label>
            <div className="flex items-center gap-2">
              <input type="color" className="h-9 w-12 rounded bg-transparent" value={config.embedColor || D.color} onChange={(e) => update({ embedColor: e.target.value })} />
              <input className={`${field} max-w-32 font-mono`} value={config.embedColor ?? ""} placeholder={D.color} onChange={(e) => update({ embedColor: e.target.value })} />
            </div>
          </>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/5">
          <div>
            <label className={label}>Button Text</label>
            <input className={field} value={config.buttonLabel ?? ""} placeholder={D.buttonLabel} maxLength={80} onChange={(e) => update({ buttonLabel: e.target.value })} />
          </div>
          <div>
            <label className={label}>Button Emoji</label>
            <EmojiPicker guildId={guildId} popover value={config.buttonEmoji ?? ""} onChange={(v) => update({ buttonEmoji: v })} placeholder={D.buttonEmoji} />
          </div>
        </div>
        <p className={`${hint} mt-3`}>Changes repost the panel in Discord a moment after you stop typing.</p>
      </NeonCard>
      <NeonCard>
        <p className={label}>Preview</p>
        <PanelPreview guildId={guildId} config={config} />
      </NeonCard>
    </div>
  );
}

function MethodStep({ config, update }: { config: VerificationConfig; update: Update }) {
  const method = config.method ?? "BUTTON";
  const card = (id: "BUTTON" | "CAPTCHA", title: string, text: string) => (
    <button
      type="button"
      onClick={() => update({ method: id })}
      className={`text-left rounded-lg border p-4 transition-colors ${method === id ? "border-neon-blue/60 bg-neon-blue/10" : "border-white/10 hover:border-white/20"}`}
    >
      <p className="font-medium text-sm">{title}</p>
      <p className={`${hint} mt-1`}>{text}</p>
    </button>
  );
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <NeonCard>
        <div className="grid grid-cols-1 gap-3">
          {card("BUTTON", "👆 One Tap", "Press Verify and get the role straight away, after the safety checks. Easiest for members.")}
          {card("CAPTCHA", "🤖 Captcha", "Press Verify, then tap the button with the matching code. Stops simple bots and raid accounts.")}
        </div>
        <p className={`${hint} mt-3`}>/verify works the same way as the button.</p>
      </NeonCard>
      <NeonCard>
        <p className={label}>What they see after pressing Verify</p>
        <DiscordMessage ephemeral content={method === "CAPTCHA" ? fill(config.captchaPrompt, D.captchaPrompt) : fill(config.verifiedReply, D.verified)}>
          {method === "CAPTCHA" && (
            <DiscordButtonRow>
              {["X3PA", "K7Q2", "M9TD", "HB4W"].map((c) => (
                <DiscordButton key={c} label={c} />
              ))}
            </DiscordButtonRow>
          )}
        </DiscordMessage>
      </NeonCard>
    </div>
  );
}

function SafetyStep({ config, update }: { config: VerificationConfig; update: Update }) {
  const captcha = config.method === "CAPTCHA";
  return (
    <NeonCard className="max-w-xl">
      <label className={label}>Minimum Account Age (days)</label>
      <input type="number" min={0} max={365} className={field} value={config.minAccountAgeDays} onChange={(e) => update({ minAccountAgeDays: Number(e.target.value) })} />
      <p className={`${hint} mt-1`}>0 = off. Brand-new accounts are a common sign of raids and alts.</p>

      <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-white/5">
        <div>
          <p className="text-sm">Require a Profile Picture</p>
          <p className={hint}>Accounts with Discord's default avatar can't verify until they add one.</p>
        </div>
        <ToggleSwitch enabled={!!config.requireAvatar} onChange={(v) => update({ requireAvatar: v })} label="Require a profile picture" />
      </div>

      <div className={`mt-5 pt-4 border-t border-white/5 ${captcha ? "" : "opacity-50"}`}>
        <p className="text-sm mb-1">Too Many Wrong Captcha Answers</p>
        <p className={`${hint} mb-3`}>{captcha ? "What happens after this many wrong answers." : "Only used with the Captcha method (step 3)."}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Wrong Answers</label>
            <input type="number" min={1} max={10} disabled={!captcha} className={field} value={config.maxFailures ?? 3} onChange={(e) => update({ maxFailures: Number(e.target.value) })} />
          </div>
          <div>
            <label className={label}>Then</label>
            <select disabled={!captcha} className={field} value={config.failAction ?? "NONE"} onChange={(e) => update({ failAction: e.target.value as "NONE" | "KICK" })}>
              <option value="NONE">Let them keep trying</option>
              <option value="KICK">Kick them</option>
            </select>
          </div>
        </div>
      </div>
    </NeonCard>
  );
}

function ExtrasStep({ guildId, config, update }: { guildId: string; config: VerificationConfig; update: Update }) {
  return (
    <NeonCard className="max-w-xl">
      <label className={label}>Unverified Role (optional)</label>
      <RoleSelect guildId={guildId} value={config.unverifiedRoleId ?? null} onChange={(id) => update({ unverifiedRoleId: id || null })} placeholder="None" />
      <p className={`${hint} mt-1`}>Taken away when someone verifies. Handy for a role that can only see the verify channel.</p>
      {config.unverifiedRoleId && (
        <div className="flex items-center justify-between gap-3 mt-3">
          <p className="text-sm">Give it to new members when they join</p>
          <ToggleSwitch enabled={!!config.giveUnverifiedOnJoin} onChange={(v) => update({ giveUnverifiedOnJoin: v })} label="Give unverified role on join" />
        </div>
      )}

      <label className={`${label} mt-5 pt-4 border-t border-white/5`}>Verification Log Channel (optional)</label>
      <ChannelSelect guildId={guildId} value={config.logChannelId ?? null} onChange={(id) => update({ logChannelId: id || null })} kind="text" placeholder="None" />
      <p className={`${hint} mt-1`}>Posts a line each time someone verifies or gets kicked.</p>

      <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-white/5">
        <div>
          <p className="text-sm">DM When Verified</p>
          <p className={hint}>Sends the member a message after they verify.</p>
        </div>
        <ToggleSwitch enabled={!!config.dmConfirmEnabled} onChange={(v) => update({ dmConfirmEnabled: v })} label="DM when verified" />
      </div>
      {config.dmConfirmEnabled && (
        <textarea className={`${field} mt-3 min-h-16`} value={config.dmConfirmMessage ?? ""} placeholder={D.dmConfirm} onChange={(e) => update({ dmConfirmMessage: e.target.value })} />
      )}
    </NeonCard>
  );
}

function ReminderStep({ config, update }: { config: VerificationConfig; update: Update }) {
  return (
    <NeonCard className="max-w-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Reminder DM</p>
          <p className={hint}>One DM to members who joined but haven't verified yet.</p>
        </div>
        <ToggleSwitch enabled={!!config.reminderEnabled} onChange={(v) => update({ reminderEnabled: v })} label="Reminder DM" />
      </div>
      {config.reminderEnabled && (
        <div className="mt-3">
          <label className={label}>Send After (hours)</label>
          <input type="number" min={1} max={336} className={field} value={config.reminderDelayHours ?? 24} onChange={(e) => update({ reminderDelayHours: Number(e.target.value) })} />
          <label className={`${label} mt-3`}>Reminder Message</label>
          <textarea className={`${field} min-h-16`} value={config.reminderMessage ?? ""} placeholder={D.reminder} onChange={(e) => update({ reminderMessage: e.target.value })} />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-white/5">
        <div>
          <p className="text-sm font-medium">Kick If Not Verified</p>
          <p className={hint}>Removes members who still haven't verified after this long. They're DM'd first.</p>
        </div>
        <ToggleSwitch enabled={!!config.kickEnabled} onChange={(v) => update({ kickEnabled: v })} label="Kick if not verified" />
      </div>
      {config.kickEnabled && (
        <div className="mt-3">
          <label className={label}>Kick After (hours)</label>
          <input type="number" min={1} max={720} className={field} value={config.kickAfterHours ?? 48} onChange={(e) => update({ kickAfterHours: Number(e.target.value) })} />
          <label className={`${label} mt-3`}>Message Before the Kick</label>
          <textarea className={`${field} min-h-16`} value={config.kickMessage ?? ""} placeholder={D.kick} onChange={(e) => update({ kickMessage: e.target.value })} />
        </div>
      )}
      <p className={`${hint} mt-4`}>Only counts members who joined after Verification was set up. Checked every 15 minutes.</p>
    </NeonCard>
  );
}

function RepliesStep({ config, update }: { config: VerificationConfig; update: Update }) {
  const rows: Array<[keyof VerificationConfig, string, string]> = [
    ["verifiedReply", "When They Verify", D.verified],
    ["alreadyVerifiedReply", "When They're Already Verified", D.alreadyVerified],
    ["captchaPrompt", "Captcha Question ({code} is the code to tap)", D.captchaPrompt],
    ["captchaWrongReply", "Wrong Captcha Answer", D.captchaWrong],
    ["accountTooNewMessage", "Account Too New", D.tooNew],
    ["noAvatarMessage", "No Profile Picture", D.noAvatar],
    ["noRoleReply", "No Verified Role Set Yet", D.noRole],
  ];
  return (
    <NeonCard className="max-w-xl">
      <p className={`${hint} mb-4`}>Only the member who pressed Verify sees these. Leave one empty to use the default shown. {"{server}"} becomes your server's name.</p>
      {rows.map(([key, title, def], i) => (
        <div key={key} className={i ? "mt-4" : ""}>
          <label className={label}>{title}</label>
          <textarea className={`${field} min-h-14`} value={(config[key] as string | null) ?? ""} placeholder={def} onChange={(e) => update({ [key]: e.target.value } as Partial<VerificationConfig>)} />
        </div>
      ))}
    </NeonCard>
  );
}

function MaintenanceStep({ guildId, config }: { guildId: string; config: VerificationConfig }) {
  const confirm = useConfirm();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<"repost" | "existing" | null>(null);

  async function run(kind: "repost" | "existing") {
    if (kind === "existing") {
      const ok = await confirm("Give the Verified role to every member already in the server who doesn't have it? Bots are skipped.", {
        title: "Verify everyone already here",
        confirmLabel: "Verify everyone",
      });
      if (!ok) return;
    }
    setBusy(kind);
    setNote(null);
    try {
      if (kind === "repost") {
        await api.repostVerificationPanel(guildId);
        setNote({ ok: true, text: "Reposted the Verify panel." });
      } else {
        const r = await api.verifyExistingMembers(guildId);
        setNote({ ok: true, text: `Gave the Verified role to ${r.given} member${r.given === 1 ? "" : "s"}.${r.failed ? ` ${r.failed} couldn't be given it (check Spartacus's role is above it).` : ""}` });
      }
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "That didn't work." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <NeonCard className="max-w-xl">
      <p className="text-sm font-medium">Repost the Panel</p>
      <p className={`${hint} mb-3`}>Deletes the Verify panel and posts it again, e.g. if someone deleted it.</p>
      <button onClick={() => run("repost")} disabled={busy !== null || !config.panelChannelId} className="neon-button-sm disabled:opacity-50">
        {busy === "repost" ? "Reposting…" : "Repost Panel"}
      </button>
      {!config.panelChannelId && <p className={`${hint} mt-2`}>Pick a panel channel in step 1 first.</p>}

      <p className="text-sm font-medium mt-5 pt-4 border-t border-white/5">Verify Everyone Already Here</p>
      <p className={`${hint} mb-3`}>Turning verification on for a server people are already in? This gives them all the Verified role so nobody gets locked out.</p>
      <button onClick={() => run("existing")} disabled={busy !== null || !config.verifiedRoleId} className="neon-button-sm disabled:opacity-50">
        {busy === "existing" ? "Working… (can take a minute)" : "Verify Everyone Already Here"}
      </button>

      {note && <p className={`text-xs mt-3 ${note.ok ? "text-emerald-400" : "text-rose-400"}`}>{note.text}</p>}
    </NeonCard>
  );
}

// ---- Activity ----

const RESULT: Record<VerificationLogRow["result"], { icon: string; text: string; tone: string }> = {
  VERIFIED: { icon: "✅", text: "Verified", tone: "text-emerald-400" },
  FAILED: { icon: "❌", text: "Wrong answer", tone: "text-amber-300" },
  TOO_NEW: { icon: "🍼", text: "Account too new", tone: "text-amber-300" },
  NO_AVATAR: { icon: "👤", text: "No profile picture", tone: "text-amber-300" },
  KICKED: { icon: "👢", text: "Kicked", tone: "text-rose-400" },
};

function ActivityTab({ guildId, pending }: { guildId: string; pending: number }) {
  const [rows, setRows] = useState<VerificationLogRow[] | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [purging, setPurging] = useState(false);
  const confirm = useConfirm();

  function refresh() {
    api.getVerificationLogs(guildId).then(setRows).catch(() => setRows([]));
  }
  useEffect(() => {
    refresh();
    api.getGuilds().then((g) => setIsOwner(!!g.find((x) => x.id === guildId)?.owner)).catch(() => null);
  }, [guildId]);

  async function purge() {
    const ok = await confirm("Permanently delete the whole verification history for this server? This can't be undone.", { title: "Purge history", confirmLabel: "Purge everything", danger: true });
    if (!ok) return;
    setPurging(true);
    await api.purgeVerificationLogs(guildId).catch(() => null);
    setPurging(false);
    refresh();
  }

  const count = (r: VerificationLogRow["result"]) => rows?.filter((x) => x.result === r).length ?? 0;

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Waiting to verify", pending],
          ["Verified", count("VERIFIED")],
          ["Blocked or wrong", count("FAILED") + count("TOO_NEW") + count("NO_AVATAR")],
          ["Kicked", count("KICKED")],
        ].map(([t, n]) => (
          <NeonCard key={t as string}>
            <p className="text-2xl font-semibold">{n}</p>
            <p className={hint}>{t}</p>
          </NeonCard>
        ))}
      </div>
      <p className={`${hint} -mt-3`}>Counts from the latest 200 events, except “Waiting to verify”.</p>

      <NeonCard>
        <p className="font-medium mb-1">History</p>
        <p className={`${hint} mb-4`}>Every verify, blocked try and kick, newest first. Kept even if they leave.</p>
        {rows === null && <p className={hint}>Loading…</p>}
        {rows?.length === 0 && <p className={hint}>Nothing yet.</p>}
        {rows && rows.length > 0 && (
          <div className="flex flex-col divide-y divide-white/5 -mx-1">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-1 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="text-white truncate">
                    {r.username} <span className="text-slate-500 font-mono text-xs">({r.userId})</span>
                  </p>
                  <p className={`text-xs ${RESULT[r.result]?.tone ?? "text-slate-400"}`}>
                    {RESULT[r.result]?.icon} {RESULT[r.result]?.text ?? r.result}
                    {r.detail ? <span className="text-slate-500"> · {r.detail}</span> : null}
                  </p>
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </NeonCard>

      {isOwner && (
        <NeonCard className="border-red-500/20">
          <p className="font-medium mb-1 text-red-400">Danger Zone</p>
          <p className={`${hint} mb-3`}>Permanently deletes the history above. Server owner only.</p>
          <button
            onClick={purge}
            disabled={purging}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {purging ? "Purging…" : "Purge History"}
          </button>
        </NeonCard>
      )}
    </div>
  );
}
