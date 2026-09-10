"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

// Client-side companion to the server's requireOwner middleware — the API
// already refuses these requests for anyone else, this just avoids a
// non-owner briefly seeing a broken owner-only page full of failed
// fetches before bouncing them back to somewhere real.
export function useOwnerGuard(guildId: string): "checking" | "allowed" {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "allowed">("checking");

  useEffect(() => {
    api
      .getAccessStatus()
      .then((s) => {
        if (s.status === "owner") setState("allowed");
        else router.replace(`/dashboard/${guildId}`);
      })
      .catch(() => router.replace(`/dashboard/${guildId}`));
  }, [guildId, router]);

  return state;
}
