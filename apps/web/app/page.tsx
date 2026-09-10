"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LandingContent() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const params = useSearchParams();
  const expired = params.get("expired") === "1";
  const idle = params.get("idle") === "1";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-base-950 text-center px-6">
      <h1 className="text-4xl font-bold bg-neon-gradient bg-clip-text text-transparent mb-3">Spartacus</h1>
      <p className="text-slate-400 max-w-md mb-8">
        Community management, stream alerts, and event coordination — unified in one dashboard.
      </p>
      {(expired || idle) && (
        <p className="text-amber-400 text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2 mb-6 max-w-sm">
          {idle ? "You were signed out after 30 minutes of inactivity." : "Your session expired — please sign in again."}
        </p>
      )}
      <a href={`${apiUrl}/auth/discord`} className="neon-button">
        Log in with Discord
      </a>
    </main>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-base-950" />}>
      <LandingContent />
    </Suspense>
  );
}
