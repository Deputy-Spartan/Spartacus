"use client";

import { NeonCard } from "../../../../components/ui/NeonCard";
import { ModuleHeader } from "../../../../components/ui/ModuleHeader";

export default function AiModerationPage({ params }: { params: { guildId: string } }) {
  return (
    <div>
      <ModuleHeader
        guildId={params.guildId}
        moduleKey="AI_MODERATION"
        title="AI Moderation"
        description="Uses an AI model to catch harassment, hate speech, and threats that regex-based automod checks miss — costs one API call per message when enabled."
      />

      <NeonCard>
        <p className="text-sm text-slate-300 mb-2">How it works</p>
        <p className="text-sm text-slate-500">
          When enabled (via the toggle above), every message is classified by an AI model before anything else happens to
          it. Anything flagged as harassment, hate speech, explicit sexual content, or a serious threat is deleted
          immediately, the same way the regular Moderator checks work.
        </p>
        <p className="text-sm text-slate-500 mt-3">
          This is separate from — and runs in addition to — the word-list and pattern-based checks in the{" "}
          <span className="text-neon-blue">Moderator</span> module, since those can't catch meaning, only exact
          matches. Requires an Anthropic API key to be configured on the bot; without one, messages are left alone and
          nothing is deleted.
        </p>
      </NeonCard>
    </div>
  );
}
