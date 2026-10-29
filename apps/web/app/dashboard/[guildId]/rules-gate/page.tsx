"use client";

import { useEffect, useRef, useState } from "react";
import { NeonCard } from "../../../../components/ui/NeonCard";
import { ChannelSelect } from "../../../../components/ui/ChannelSelect";
import { RoleSelect } from "../../../../components/ui/RoleSelect";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";
import { ToggleSwitch } from "../../../../components/ui/ToggleSwitch";
import { PlaceholderExamples } from "../../../../components/ui/PlaceholderExamples";
import { useConfirm } from "../../../../components/ui/ConfirmDialog";
import { api, type RulesGateSettingsRow, type RulesGateAgreementRow } from "../../../../lib/api";
import { SavedEmbedPicker } from "../../../../components/embedCreator/SavedEmbedPicker";
import Link from "next/link";

type Tab = "settings" | "activity";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "settings", label: "Settings", icon: "⚙️" },
  { key: "activity", label: "Activity", icon: "📊" },
];

const DEFAULT_AGREE_REPLY = "✅ Thanks — you now have access!";
const DEFAULT_ALREADY_AGREED = "You've already agreed!";
const DEFAULT_NO_ROLE_CONFIGURED = "This server hasn't configured a role to grant yet — ask an admin to set one up.";
const DEFAULT_DM_CONFIRM = "✅ Thanks for agreeing to the rules in **{server}** — you now have access!";

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
  return (
    <div className="flex flex-col gap-5">
      <NeonCard className="max-w-xl">
        <p className="text-xs text-slate-500 mb-4">
          Build the full rules message below (title, images, links, multiple fields — even multiple embeds) in the{" "}
          <Link href={`/dashboard/${guildId}/embed-creator`} className="text-neon-blue hover:underline">
            Embed Creator
          </Link>
          , then pick it here. Saving posts (or reposts) it right away.
        </p>

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

        <SavedEmbedPicker guildId={guildId} value={settings?.savedEmbedId ?? null} onChange={(id) => update({ savedEmbedId: id })} />
      </NeonCard>

      <NeonCard className="max-w-xl">
        <p className="font-medium mb-1">Onboarding Extras</p>
        <p className="text-xs text-slate-500 mb-4">
          Optional add-ons that make the rules gate double as the last step of verification instead of a standalone embed.
        </p>

        <label className="text-xs uppercase tracking-wide text-slate-500 block mb-2">Role to Remove on Agree</label>
        <p className="text-xs text-slate-500 mb-2">
          Strip a pending/unverified role (e.g. @Unverified) the moment someone agrees — pairs well with Verification or the Rules Gate acting
          as your final gate.
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
      </NeonCard>

      <MessagesCard settings={settings} update={update} />
    </div>
  );
}

const SERVER_TOKEN = [{ token: "{server}", description: "This server's name" }];

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
