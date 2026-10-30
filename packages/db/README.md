# packages/db — the database

Uses [Prisma](https://www.prisma.io) with Postgres (Neon in production). The bot and the API both
import from here (`import { prisma } from "@spartacus/db"`).

```text
prisma/
├── schema.prisma     ← THE definition of every table and column. Start here.
└── migrations/       ← history of every database change, applied in date order
index.ts              ← the shared database connection + logError() helper
embedComponents.ts    ← shared types for Embed Creator buttons (used by web, api and bot)
```

## Changing the database

1. Edit `prisma/schema.prisma`.
2. Run `npm run db:migrate` from the project root and give the change a short name.
   This creates a new folder in `migrations/` and updates your local database.
3. Commit the new migration folder. Render applies it to the live database automatically on the
   next deploy.

**Never edit or delete an existing migration.** They've already run on the live database. To undo
something, make a new migration.

`npm run studio --workspace=packages/db` opens a browser view of the data.
