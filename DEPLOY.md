# Going live — step by step

Everything below is verified working locally (the API boots, `/health` responds, the bot
attempts login correctly and no longer crashes the process on a bad token). What's left is
account-level setup only I can't do for you — creating your own Discord app, database, and
hosting account. ~15 minutes.

## 1. Create the Discord application (5 min)

1. Go to the Discord Developer Portal → **New Application** → name it "Spartacus" (or whatever
   you like).
2. **Bot** tab → **Reset Token** → copy it. This is your `DISCORD_TOKEN`. Keep it secret.
3. Same **Bot** tab → enable these under **Privileged Gateway Intents**:
   - Server Members Intent
   - Message Content Intent
4. **OAuth2 → General** tab → copy **Client ID** (`DISCORD_CLIENT_ID`) and **Client Secret**
   (`DISCORD_CLIENT_SECRET`).
5. **OAuth2 → URL Generator**: scopes = `bot`, `applications.commands`; permissions = at minimum
   `Administrator` (simplest for a bot with this many features) or hand-pick each permission the
   modules need (ban/kick/manage roles/manage channels/manage messages/etc). Open the generated
   URL and invite the bot to your test server.

## 2. Create a free Postgres database (3 min)

Pick one:
- **[Neon](https://neon.tech)** (recommended, generous free tier) — create a project, copy the
  connection string.
- **[Supabase](https://supabase.com)** — create a project, Database settings → connection string
  (use the "connection pooling" URI).

Either way you get a `DATABASE_URL` like:
```
postgresql://user:pass@host/db?sslmode=require
```
Append `&connection_limit=5&pool_timeout=10` to the end of it (keeps the free-tier connection
cap from being exhausted — see `README.md`).

## 3. Deploy the bot + API (Render, free tier)

1. Push this repo to GitHub (create a new repo, `git init` here if you haven't, `git push`).
2. On [Render](https://render.com) → **New → Blueprint** → connect the repo. Render will read
   `render.yaml` at the project root and provision the `spartacus-api` web service automatically.
3. Fill in the env vars Render prompts for (everything marked `sync: false` in `render.yaml`):
   `DATABASE_URL`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
   `DISCORD_REDIRECT_URI` (see step 5), `NEXTAUTH_SECRET` (generate with
   `openssl rand -base64 32`), `NEXTAUTH_URL` (your dashboard's URL, from step 4).
4. Deploy. On first boot the container runs `npm run start`, which runs `prisma migrate deploy`
   against your database automatically before starting the server — no manual migration step.
5. Once live, register your slash commands once:
   ```
   DISCORD_TOKEN=... DISCORD_CLIENT_ID=... npx tsx apps/bot/src/deployCommands.ts
   ```
   (run this locally, or as a one-off Render shell command — it just needs your `.env` values).

## 4. Deploy the dashboard (Vercel, free tier — recommended for Next.js)

1. [Vercel](https://vercel.com) → **New Project** → import the same GitHub repo → set the root
   directory to `apps/web`.
2. Env vars: `NEXT_PUBLIC_API_URL` = your Render service's URL (from step 3),
   `NEXTAUTH_URL` = this Vercel deployment's URL, `NEXTAUTH_SECRET` = same value as step 3.
3. Deploy. Update `DISCORD_REDIRECT_URI` in Discord's OAuth2 settings and in Render's env vars to
   `https://<your-vercel-domain>/api/auth/callback/discord` once you know the final URL, then
   redeploy the API service so it picks up the change.

## 5. Keep it awake 24/7 (2 min)

1. [UptimeRobot](https://uptimerobot.com) (free) → **Add New Monitor** → HTTP(s) → URL =
   `https://<your-render-domain>/health` → interval = 5 minutes.
2. That's it — Render's free tier stays awake as long as something pings it regularly.

## Verifying it's actually live

- `curl https://<your-render-domain>/health` → should return `{"status":"ok",...}`.
- In Discord, run `/rank` or `/balance` in your test server — if it replies, the bot is
  connected and the database is reachable.
- Open your Vercel dashboard URL, click **Continue with Discord**, and you should land on your
  real server list (not the artifact's mock data).

## What's still mock-only

Twitch/YouTube alerts need `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` and `YOUTUBE_API_KEY` (free
developer keys from each platform) — without them, Stream Alerts subscriptions save but never
go live. Everything else in the dashboard's nav is wired to real bot behavior as of this commit.
