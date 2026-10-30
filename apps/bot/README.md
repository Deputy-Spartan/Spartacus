# apps/bot — the Discord bot

Built with [discord.js](https://discord.js.org). In production it runs inside the API process
(see [apps/api](../api/README.md)). Locally you can run it alone with `npm run dev:bot` if
`RUN_BOT_INLINE=false`.

```text
src/
├── index.ts          ← starts the bot: creates the client, attaches listeners, starts every job
├── deployCommands.ts ← manual slash-command registration (also happens on every startup)
├── commands/         ← slash commands, grouped by category (moderation/, leveling/, economy/…)
│   └── index.ts      ← the list of every command; a new command must be added here
├── events/           ← central Discord event handlers (messages, member joins, button clicks)
├── modules/          ← feature logic, grouped by category (security/, community/, tickets/…)
├── jobs/             ← code that runs on a timer (cron): auto-posting panels, reminders, digests
└── lib/              ← shared helpers (database, caching, module on/off check, rendering)
```

## Which folder?

- **commands/**: someone types `/something`.
- **modules/**: the bot reacts to something happening (a message, a reaction, someone joining).
- **jobs/**: the bot does something on a schedule, or posts something the dashboard saved.
  Many `*Poster.ts` jobs check the database every few seconds for panels the dashboard asked to
  be posted.
- **events/**: shared entry points that hand off to the right module. Button, menu and modal
  clicks are all routed in `events/interactionCreate.ts`.

## Rules

- Every feature checks `isModuleEnabled(guildId, "KEY")` from `lib/moduleGate.ts` first, so
  switching it off on the dashboard actually turns it off.
- Caches must be bounded (`lru-cache`). The whole server shares 512MB of memory.
