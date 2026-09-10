"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setToken, api } from "../../../lib/api";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const match = window.location.hash.match(/token=([^&]+)/);
    if (!match) {
      router.replace("/");
      return;
    }
    setToken(match[1]);

    api
      .getAccessStatus()
      .then((s) => {
        router.replace(s.status === "owner" || s.status === "approved" ? "/dashboard" : "/access-required");
      })
      .catch(() => router.replace("/"));
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-base-950 text-slate-400">
      Signing you in…
    </main>
  );
}
