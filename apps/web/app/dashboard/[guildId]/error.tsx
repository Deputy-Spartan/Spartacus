"use client";

import { CrashScreen } from "../../../components/ui/CrashScreen";

// Keeps the sidebar and top bar; only the broken page is swapped out.
export default function DashboardPageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CrashScreen error={error} reset={reset} compact />;
}
