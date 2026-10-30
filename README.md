# Spartacus

A Discord bot plus a web dashboard for running a Discord server: moderation, leveling, tickets,
polls, giveaways, events, stream alerts and more. Every feature is configured from the dashboard
and the bot carries it out inside Discord.

**New here? Read this page top to bottom once.** It covers what lives where, how to run it, and
how updates go live.

---

## The three pieces

| Piece | What it is | Where it runs | Folder |
| --- | --- | --- | --- |
| **Bot** | The Discord bot itself: slash commands, reacting to messages, posting panels | Render (inside the API service) | [apps/bot](apps/bot) |
| **API** | The backend server the dashboard talks to: login, saving settings | Render | [apps/api](apps/api) |
| **Dashboard** | The website you log into and click around in | Vercel | [apps/web](apps/web) |

They all share one **database** (Postgres on Neon). Its layout is defined in
[packages/db](packages/db).

```text
  You (browser)                                   Discord server
       │                                                ▲
       ▼                                                │
  Dashboard (Vercel)  ──HTTP──▶  API (Render)  ──runs──▶ Bot
  apps/web                       apps/api               apps/bot
                                     │                    │
                                     └──────┬─────────────┘
                                            ▼
                                   Database (Neon Postgres)
                                   packages/db
```

The API and bot run as **one process** on Render (`RUN_BOT_INLINE=true`). When you save a
setting on the dashboard, the API writes it to the database. The bot reads it from there and acts
on it in Discord.

---

## Folder map

```text
Spartacus/
├── apps/                    ← the three runnable programs
│   ├── api/                 ← backend server (Express)
│   ├── bot/                 ← Discord bot (discord.js)
│   └── web/                 ← dashboard website (Next.js + Tailwind)
├── packages/                ← code shared by the apps
│   ├── db/                  ← database schema + migrations (Prisma)
│   └── shared/              ← shared lists: module names, sidebar menu
├── docs/                    ← guides (deploying, adding a feature)
├── scripts/                 ← small one-off scripts used during deploy
│
├── .env                     ← your secrets (NEVER committed to GitHub)
├── .env.example             ← template listing every setting .env can have
├── package.json             ← root commands (npm run …) and workspace list
├── Dockerfile               ← how Render builds the API + bot server
├── render.yaml              ← Render's service settings
├── docker-compose.yml       ← optional local database for development
└── tsconfig.base.json       ← shared TypeScript settings
```

Each app and package has its own README that explains its folders:
[api](apps/api/README.md) · [bot](apps/bot/README.md) · [web](apps/web/README.md) ·
[db](packages/db/README.md) · [shared](packages/shared/README.md)

---

## "I want to change…" — where to look

| I want to… | Go to |
| --- | --- |
| Change how a dashboard page looks | `apps/web/app/dashboard/[guildId]/<page-name>/page.tsx` |
| Change a reusable dashboard control (toggle, channel picker, embed fields) | `apps/web/components/ui/` |
| Add or rename an item in the dashboard sidebar | `packages/shared/navItems.ts` |
| Change what a slash command does (`/rank`, `/ban`, …) | `apps/bot/src/commands/<category>/<command>.ts` |
| Change how the bot reacts to something happening in Discord | `apps/bot/src/modules/<category>/` |
| Change something the bot does on a timer (reminders, auto-posts) | `apps/bot/src/jobs/` |
| Change what happens when the dashboard saves a setting | `apps/api/src/routes/<feature>.ts` |
| Add a new setting/column to the database | `packages/db/prisma/schema.prisma` (then run a migration) |
| Add a whole new feature end to end | [docs/adding-a-feature.md](docs/adding-a-feature.md) |

File names match the feature. To work on **polls**, search for "poll" in the file list
(Ctrl+P in VS Code) and you'll see the dashboard page, the API route and the bot code.

---

## Everyday commands

Run these from the `Spartacus` folder in a terminal.

| Command | What it does |
| --- | --- |
| `npm install` | Installs everything the project needs. Run it after pulling new code. |
| `npm run dev:api` | Runs the API + bot locally (auto-restarts when you edit code) |
| `npm run dev:web` | Runs the dashboard locally at <http://localhost:3000> |
| `npm run typecheck` | Checks all three apps for TypeScript errors without running them |
| `npm run db:generate` | Regenerates the database client after editing `schema.prisma` |
| `npm run db:migrate` | Creates and applies a new database migration (local dev only) |

### First-time local setup

```bash
npm install
cp .env.example .env     # then fill in the real values
npm run db:generate
```

Then start the API (`npm run dev:api`) and the dashboard (`npm run dev:web`) in two terminals.
`dev:api` already starts the bot too, so you don't need `dev:bot` unless you've set
`RUN_BOT_INLINE=false`.

---

## How updates go live

1. Make changes and commit them to the `main` branch.
2. `git push` to GitHub (`Deputy-Spartan/Spartacus`).
3. Both hosts see the push and redeploy on their own:
   - **Render** rebuilds the API + bot from the `Dockerfile`. Database migrations and
     slash-command registration run automatically on startup.
   - **Vercel** rebuilds the dashboard from `apps/web`.
4. Check the Render and Vercel dashboards to confirm the deploys finished.

The full first-time hosting setup is in [docs/deploying.md](docs/deploying.md).

---

## Rules of thumb

- **Never commit `.env`.** It holds your bot token and database password. It's already in
  `.gitignore`. If you add a new setting, add a placeholder line to `.env.example` too.
- **Never edit an existing migration** in `packages/db/prisma/migrations/`. Make a new one instead.
  Old migrations have already run on the live database.
- **Keep memory low.** The server has a 512MB ceiling. Discord caches are capped in
  `apps/bot/src/index.ts`, and app caches use bounded `lru-cache`, never plain unbounded `Map`s.
