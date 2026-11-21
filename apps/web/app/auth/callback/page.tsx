"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setToken, api } from "../../../lib/api";
import { rememberLastUser } from "../../../lib/lastUser";
import { SpartacusLoader } from "../../../components/ui/SpartacusLoader";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const match = window.location.hash.match(/token=([^&]+)/);
    if (!match) {
      console.error("[auth/callback] no token in the redirect URL — the sign-in redirect from the API never included one.");
      router.replace("/?error=signin");
      return;
    }
    setToken(match[1]);
    // For the login page next time: "Welcome back" with their avatar.
    api.getMe().then(rememberLastUser).catch(() => null);

    api
      .getAccessStatus()
      .then((s) => {
        // ?auto=1 lets the server list jump straight to your last server.
        router.replace(s.status === "owner" || s.status === "approved" ? "/dashboard?auto=1" : "/access-required");
      })
      .catch((err) => {
        // Most likely cause: NEXTAUTH_URL on the API doesn't exactly match
        // this page's own origin (a trailing slash, http vs https, etc.),
        // so the browser blocks the request as cross-origin before it even
        // reaches the server — this logs whatever detail is available.
        console.error("[auth/callback] getAccessStatus failed right after login:", err);
        router.replace("/?error=signin");
      });
  }, [router]);

  return <SpartacusLoader label="Signing you in" />;
}
