export default function LandingPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-base-950 text-center px-6">
      <h1 className="text-4xl font-bold bg-neon-gradient bg-clip-text text-transparent mb-3">Spartacus</h1>
      <p className="text-slate-400 max-w-md mb-8">
        Community management, stream alerts, and event coordination — unified in one dashboard.
      </p>
      <a href={`${apiUrl}/auth/discord`} className="neon-button">
        Log in with Discord
      </a>
    </main>
  );
}
