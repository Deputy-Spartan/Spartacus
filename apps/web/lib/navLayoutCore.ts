// Plain helpers for the owner's menu layout (lib/navLayout.ts), kept free of
// React so tests can load them.

export const groupSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const pageSlug = (href: string) => href.replace(/^\/+/, "").replace(/[^a-z0-9._-]/gi, "-");

export const NAV_KEYS = {
  groupOrder: "nav.order._groups",
  pageOrder: (section: string) => `nav.order.${groupSlug(section)}`,
  groupLabel: (section: string) => `nav.group.${groupSlug(section)}`,
  pageLabel: (href: string) => `nav.page.${pageSlug(href)}`,
  hidden: "nav.hidden",
};
export const hiddenGroupId = (section: string) => `group:${groupSlug(section)}`;

export function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Saved ids first, in the saved order; anything new since then (a page added
// in an update) keeps its built-in place after them.
export function applyOrder<T>(items: T[], id: (t: T) => string, saved: string[]): T[] {
  if (!saved.length) return items;
  const pos = new Map(saved.map((s, i) => [s, i]));
  const rank = (t: T, i: number) => pos.get(id(t)) ?? saved.length + i;
  return items
    .map((t, i) => ({ t, r: rank(t, i) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.t);
}
