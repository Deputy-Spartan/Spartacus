"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "../../../lib/api";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const match = window.location.hash.match(/token=([^&]+)/);
    if (match) {
      setToken(match[1]);
      router.replace("/dashboard");
    } else {
      router.replace("/");
    }
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-base-950 text-slate-400">
      Signing you in…
    </main>
  );
}
