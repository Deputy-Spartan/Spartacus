# packages/shared — lists used everywhere

Small, plain lists that the bot, API and dashboard all need to agree on. Keeping them in one place
means they can't drift apart.

| File | What's in it |
| --- | --- |
| `moduleKeys.ts` | The name of every on/off module (`"POLLS"`, `"TICKETS"`, …) |
| `navItems.ts` | The dashboard sidebar: every page, its label, icon and category. The bot's test-server setup command builds its channels from this same list. |
| `index.ts` | Re-exports both, so code can `import { … } from "@spartacus/shared"` |
