// Owner Only → OG Armory Store: shapes of what the store website sends back through the API.

export type OgAlertKey = "orders" | "refunds" | "renewals" | "news";
export interface OgAlertRoute { on: boolean; channelId: string; pingRoleId: string }
export interface OgRouting { version: number; routes: Record<OgAlertKey, OgAlertRoute> }
export interface OgTickets { discordTickets: boolean; ticketCategoryId: string; ticketChannelId: string }

export interface OgProduct {
  id: string;
  name: string;
  tag: string;
  short: string;
  hidden: boolean;
  category: string;
  price: string;
  was: string | null;
  image: string | null;
  url: string;
}

export interface OgSummary {
  store: { name: string; url: string };
  features: { signin: boolean; checkout: boolean };
  setup: Record<string, boolean>;
  stats: null | {
    live: boolean;
    money: { today: number; week: number; month: number; all_time: number; refunded: number };
    counts: { orders: number; orders_month: number; customers: number; buyers: number; active_subs: number; past_due: number; pending_roles: number; disputes: number };
    tickets: { open: number; answered: number };
  };
  banner: { announcement: string };
  products: OgProduct[];
  tickets: OgTickets;
  routing: OgRouting;
}

export interface OgPost {
  guildId: string;
  channelIds: string[];
  title: string;
  description: string;
  url?: string;
  image?: string | null;
  ping?: string;
  fields?: Array<{ name: string; value: string }>;
  buttons?: Array<{ label: string; url: string }>;
}

export const OG_ALERTS: Array<{ key: OgAlertKey; label: string; detail: string; audience: "Staff" | "Public" }> = [
  { key: "orders", label: "New orders", detail: "Every paid order: items, total and who bought it.", audience: "Staff" },
  { key: "refunds", label: "Refunds and chargebacks", detail: "Money going back out, and disputes you need to answer.", audience: "Staff" },
  { key: "renewals", label: "Failed and ended subscriptions", detail: "A card was declined, or a subscription ended.", audience: "Staff" },
  { key: "news", label: "Store news", detail: "The channel Post to Discord picks first for products and sales.", audience: "Public" },
];

export const OG_SETUP_LABELS: Array<[string, string]> = [
  ["spartacus", "Connected to Spartacus (STORE_BRIDGE_SECRET)"],
  ["sessionSecret", "Login security key"],
  ["discordLogin", "Sign in with Discord"],
  ["discordBot", "Discord roles and staff (bot token + server)"],
  ["database", "Database"],
  ["stripe", "Stripe payments"],
  ["stripeWebhook", "Stripe delivery hook"],
];
