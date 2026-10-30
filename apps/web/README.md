# apps/web — the dashboard website

A [Next.js](https://nextjs.org) site (App Router) styled with [Tailwind](https://tailwindcss.com).
Hosted on Vercel, which builds from this folder. Run it locally with `npm run dev:web` and open
http://localhost:3000.

```text
app/                              ← every page; the folder path IS the URL
├── page.tsx                      ← the login / landing page  (/)
├── dashboard/page.tsx            ← server picker              (/dashboard)
└── dashboard/[guildId]/          ← everything for one server  (/dashboard/123…)
    ├── layout.tsx                ← sidebar + header around every server page
    ├── page.tsx                  ← the Overview page
    └── <feature>/page.tsx        ← one folder per feature (polls/, tickets/, welcome/…)
components/
├── ui/                           ← reusable controls: toggles, pickers, embed editors, previews
├── nav/                          ← sidebar, top header, command palette, bot status badge
└── embedCreator/                 ← pieces of the Embed Creator page
lib/
├── api.ts                        ← every call to the backend goes through here
└── use*.ts                       ← React hooks (auto-save, bot status, owner guard…)
public/                           ← static images (app icons)
```

## Adding a page

1. Create `app/dashboard/[guildId]/<page-name>/page.tsx`.
2. Add it to the sidebar in [packages/shared/navItems.ts](../../packages/shared/navItems.ts).
   The `href` must match the folder name.
3. Build it from the `components/ui/` pieces so it matches the rest of the dashboard.
