import Link from "next/link";

// Shown for any address that isn't a real page.
export default function NotFound() {
  return (
    <main className="min-h-screen bg-base-950 flex flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold text-neon-blue">404</p>
      <h1 className="text-lg font-semibold text-slate-100">This page doesn&apos;t exist</h1>
      <p className="text-sm text-slate-400 max-w-sm">The link may be old or typed wrong.</p>
      <Link href="/dashboard" className="neon-button mt-2">
        Back to dashboard
      </Link>
    </main>
  );
}
