# apps/api — the backend server

An [Express](https://expressjs.com) server. The dashboard calls it to log in and to read and
save settings. It also starts the Discord bot inside the same process when
`RUN_BOT_INLINE` isn't `"false"`. Hosted on Render as `spartacus-api`.

```text
src/
├── index.ts      ← starts the server: registers every route, starts the bot and background jobs
├── routes/       ← one file per dashboard feature (polls.ts, tickets.ts, welcome.ts…)
├── middleware/   ← checks that run before a route: logged in? allowed on this server? owner?
├── lib/          ← helpers: talking to Discord's REST API, bot status, embed building
└── jobs/         ← background tasks owned by the API (status watchdog, deploy announcer)
```

## Adding a route

1. Create `routes/<feature>.ts` and protect each handler with `requireAuth, requireGuildPermission`.
   For owner-only routes, use `requireAuth, requireOwner`.
2. Import it in `index.ts` and add `app.use(<feature>Router)`.

`GET /health` is the uptime check Render uses to confirm the service is running.
