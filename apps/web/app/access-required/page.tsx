"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NeonCard } from "../../components/ui/NeonCard";
import { api, clearToken, type CurrentUser, type AccessStatus } from "../../lib/api";

export default function AccessRequiredPage() {
  const router = useRouter();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");

  function refresh() {
    Promise.all([api.getMe(), api.getAccessStatus()])
      .then(([m, s]) => {
        setMe(m);
        setStatus(s);
        if (s.status === "owner" || s.status === "approved") router.replace("/dashboard");
      })
      .catch(() => {
        clearToken();
        router.replace("/");
      });
  }
  useEffect(refresh, [router]);

  async function requestAccess() {
    setRequesting(true);
    await api.requestAccess(message.trim() || undefined).catch(() => null);
    setRequesting(false);
    refresh();
  }

  async function checkStatus() {
    setChecking(true);
    await new Promise((r) => setTimeout(r, 400)); // let the click register before the page flips
    setChecking(false);
    refresh();
  }

  if (!me || !status) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-base-950 text-slate-400">Loading…</main>
    );
  }

  const pending = status.status === "pending";

  return (
    <main className="min-h-screen flex items-center justify-center bg-base-950 px-4">
      <NeonCard className="w-full max-w-sm">
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl mx-auto mb-4 ${
            pending ? "bg-amber-500/15 text-amber-400" : "bg-amber-500/15 text-amber-400"
          }`}
        >
          {pending ? "⏳" : "🔒"}
        </div>
        <h1 className="text-lg font-bold text-center">{pending ? "Request sent" : "Access needed"}</h1>
        <p className="text-slate-400 text-sm text-center mt-1.5 leading-relaxed">
          {pending
            ? "Your request is waiting on the owner. Check back here — no need to sign in again."
            : "This dashboard is invite-only. The owner needs to approve your Discord account before you can manage anything."}
        </p>

        <div className="flex items-center gap-3 bg-base-950 border border-white/10 rounded-lg p-3 mt-5">
          <img
            src={me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : "/default-avatar.png"}
            alt=""
            className="w-9 h-9 rounded-full"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{me.username}</p>
            <p className="text-xs text-slate-500 font-mono">{me.id}</p>
          </div>
        </div>

        {pending ? (
          <>
            {status.message && (
              <div className="bg-base-950 border border-white/10 rounded-lg p-3 mt-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Your message</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{status.message}</p>
              </div>
            )}
            <button onClick={checkStatus} disabled={checking} className="neon-button w-full mt-5 disabled:opacity-50">
              {checking ? "Checking…" : "Check status"}
            </button>
          </>
        ) : (
          <>
            <label className="text-xs uppercase tracking-wide text-slate-500 block mt-5 mb-2">
              Message to the owner <span className="normal-case text-slate-600">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              placeholder="e.g. I run the #announcements channel and need to update the welcome message"
              className="w-full bg-base-950 border border-white/10 rounded-lg p-2.5 text-sm min-h-20 resize-none"
            />
            <button onClick={requestAccess} disabled={requesting} className="neon-button w-full mt-3 disabled:opacity-50">
              {requesting ? "Sending…" : "Request Access"}
            </button>
          </>
        )}
        <button
          onClick={() => {
            clearToken();
            router.replace("/");
          }}
          className="w-full mt-2 text-xs text-slate-500 hover:text-slate-300 py-2"
        >
          Sign in with a different account
        </button>
      </NeonCard>
    </main>
  );
}
