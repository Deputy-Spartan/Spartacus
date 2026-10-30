# Adding a feature

Most features touch the same five places, in this order. **Polls** is used as the worked example
throughout, so open its files side by side to see each step for real.

```text
1. packages/db       what gets stored          schema.prisma → model Poll
2. packages/shared   the on/off switch + menu  moduleKeys.ts "POLLS", navItems.ts "/polls"
3. apps/api          dashboard ↔ database      src/routes/polls.ts
4. apps/web          the dashboard page        app/dashboard/[guildId]/polls/page.tsx
5. apps/bot          what happens in Discord   src/jobs/pollPoster.ts, src/modules/engagement/pollVotes.ts
```

You won't always need every step. A purely cosmetic dashboard change is step 4 only, and a new
slash command is usually step 5 only.

---

## 1. Store it: `packages/db`

Add a model (or new fields) to [schema.prisma](../packages/db/prisma/schema.prisma), then create a
migration:

```bash
npm run db:migrate      # asks for a name, e.g. "add_polls"
```

This writes a new folder under `packages/db/prisma/migrations/`. Commit it. Render applies it to
the live database on the next deploy.

## 2. Name it: `packages/shared`

- If the feature can be switched on/off per server, add a key to
  [moduleKeys.ts](../packages/shared/moduleKeys.ts) (e.g. `"POLLS"`).
- To give it a dashboard page, add a line to [navItems.ts](../packages/shared/navItems.ts). The
  sidebar and the bot's test-server setup both read from this list.

## 3. Save it: `apps/api`

Create `apps/api/src/routes/<feature>.ts` with the GET/POST/DELETE handlers the page needs.
Protect each one with `requireAuth, requireGuildPermission` (copy from
[polls.ts](../apps/api/src/routes/polls.ts)). Then import it and add `app.use(<feature>Router)` in
[apps/api/src/index.ts](../apps/api/src/index.ts).

## 4. Show it: `apps/web`

Create `apps/web/app/dashboard/[guildId]/<page-name>/page.tsx`. The folder name becomes the URL
and must match the `href` you added in step 2. Call the API through
[lib/api.ts](../apps/web/lib/api.ts), and reuse the building blocks in `components/ui/`
(`ToggleSwitch`, `ChannelSelect`, `EmbedFields`, `SaveStatus`, …) so it looks like every other
page.

## 5. Do it: `apps/bot`

Pick the kind of bot code you need:

| You need the bot to… | Put it in | Then register it in |
| --- | --- | --- |
| Respond to a slash command | `src/commands/<category>/<name>.ts` | `src/commands/index.ts` |
| React to Discord activity (messages, joins, reactions) | `src/modules/<category>/<name>.ts` | `src/index.ts` (`client.on(...)`) or `src/events/` |
| Do something on a timer, or post what the dashboard saved | `src/jobs/<name>.ts` | `src/index.ts` (`start…Job(c)`) |
| Handle a button/menu/modal click | `src/events/interactionCreate.ts` | — |

Start every handler with `isModuleEnabled(guildId, "YOUR_KEY")`
([lib/moduleGate.ts](../apps/bot/src/lib/moduleGate.ts)) so turning the module off on the dashboard
actually stops it.

---

## Before you push

```bash
npm run typecheck
```

If that comes back clean, commit and push to `main`.
