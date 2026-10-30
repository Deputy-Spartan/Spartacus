# Deploying Spartacus

Spartacus is already live. This guide is for setting it up again from scratch, for example on a
new account or for a second copy of the bot.

**Day-to-day updates don't need any of this.** Push to `main` on GitHub and Render and Vercel
redeploy on their own (see the [README](../README.md#how-updates-go-live)).

| Piece | Host | Plan |
| --- | --- | --- |
| API + bot (one service) | Render, `spartacus-api` | Starter (paid, never sleeps) |
| Dashboard | Vercel | Free |
| Database | Neon Postgres | Free |

---

## 1. Create the Discord application

1. Discord Developer Portal → **New Application** → name it.
2. **Bot** tab → **Reset Token** → copy it. This is `DISCORD_TOKEN`. Keep it secret.
3. Same tab → under **Privileged Gateway Intents** enable **Server Members Intent** and
   **Message Content Intent**.
4. **OAuth2 → General** → copy **Client ID** (`DISCORD_CLIENT_ID`) and **Client Secret**
   (`DISCORD_CLIENT_SECRET`).
5. **OAuth2 → URL Generator** → scopes `bot` + `applications.commands`, permission
   `Administrator` → open the URL and invite the bot to your server.

## 2. Create the database

On [Neon](https://neon.tech) create a project and copy its connection string. Add
`&connection_limit=5&pool_timeout=10` to the end so the free tier's connection cap isn't
exhausted:

```text
postgresql://user:pass@host/db?sslmode=require&connection_limit=5&pool_timeout=10
```

## 3. Deploy the API + bot on Render

1. [Render](https://render.com) → **New → Blueprint** → connect the GitHub repo. Render reads
   [render.yaml](../render.yaml) and creates the `spartacus-api` service.
2. Fill in every env var Render asks for (the ones marked `sync: false`). The full list, with
   what each one means, is in [.env.example](../.env.example). Don't forget `OWNER_DISCORD_ID`
   (your own Discord user ID, which unlocks the owner-only pages). Add `ANTHROPIC_API_KEY` too if
   you want the AI features.
3. Deploy. On every startup the server automatically:
   - flags the bot as "Updating" so the status channel doesn't report it as offline
     ([scripts/mark-deploying.js](../scripts/mark-deploying.js)),
   - applies any new database migrations (`prisma migrate deploy`),
   - registers slash commands with Discord.

## 4. Deploy the dashboard on Vercel

1. [Vercel](https://vercel.com) → **New Project** → import the same repo → set **Root Directory**
   to `apps/web`.
2. Env vars: `NEXT_PUBLIC_API_URL` = your Render service URL.
3. Deploy. Then wire up Discord login (the login flow goes through the API, which sends you back
   to the dashboard afterwards):
   - In Render, set `DISCORD_REDIRECT_URI` to `https://<your-render-domain>/auth/discord/callback`
     and `NEXTAUTH_URL` to `https://<your-vercel-domain>`.
   - Add that same redirect URI under Discord's **OAuth2 → Redirects**.
   - Redeploy the Render service so it picks up the change.

## 5. Check it's working

- `https://<your-render-domain>/health` should return `{"status":"ok",...}`.
- Run `/rank` in your Discord server. If the bot replies, it's connected to Discord and the
  database.
- Open the Vercel URL, click **Continue with Discord**, and you should see your server list.

## Optional keys

| Feature | Needs |
| --- | --- |
| Twitch stream alerts | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| YouTube stream alerts | `YOUTUBE_API_KEY` |
| AI Chat / AI Moderation | `ANTHROPIC_API_KEY` |

If a key is missing, its feature stays switched off quietly and nothing crashes.
