# Spartacus

Hybrid Discord bot + web dashboard: MEE6-style community management, PhantomBot-style stream
alerts, and Raid Helper-style event coordination, unified under one neon blue-gray dashboard and
designed to run 24/7 on a 512MB free-tier host.

## Structure

- `apps/bot` — discord.js client, commands, event listeners, cron jobs
- `apps/api` — Express API, OAuth2, `/health` keep-awake endpoint, REST routes the dashboard calls
- `apps/web` — Next.js dashboard (App Router + Tailwind neon theme)
- `packages/db` — shared Prisma schema/client
- `packages/shared` — shared TypeScript types/constants (module keys, roles)

## Setup

```bash
npm install
cp .env.example .env        # fill in real values
npm run db:generate
npm run db:migrate
```

Run each app in its own terminal during development:

```bash
npm run dev:api
npm run dev:bot
npm run dev:web
```

## Deploying on a free tier (Render / Fly.io / Railway)

1. Deploy `apps/api` (with `apps/bot` merged in, see `apps/api/src/index.ts` comment) as one web
   service — free tiers usually give you one always-on-ish service more reliably than two.
2. Point an UptimeRobot HTTP monitor at `https://<your-app>/health` every 5 minutes so the host
   never idles the dyno.
3. Deploy `apps/web` to Vercel's free tier (best fit for Next.js) or the same host as a second
   service.
4. Set all `.env` values as host secrets — never commit `.env`.

## Memory budget (512MB ceiling)

- Discord client caches are capped via `Options.cacheWithLimits` (see `apps/bot/src/index.ts`).
- App-level caches use bounded `lru-cache` instances, never unbounded `Map`s.
- Prisma pool is capped via `connection_limit` in `DATABASE_URL`.
- Stream-alert polling batches all subscriptions into one cron tick instead of one timer per guild.
