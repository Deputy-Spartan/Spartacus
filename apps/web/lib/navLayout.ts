"use client";

import { useCallback, useMemo } from "react";
import { NAV_SECTIONS, type NavItem } from "@spartacus/shared";
import { useDashboardTexts } from "../components/ui/EditableText";

// The owner's own layout for the dashboard menu: group and page order, new
// names, and what's hidden. Stored as DashboardText rows under "nav.*" (the
// same owner-only store as the editable descriptions), so it saves to the
// database, follows the owner to every device, and everyone sees the same
// menu. Anything not customised falls back to NAV_SECTIONS.

import { applyOrder, groupSlug, hiddenGroupId, NAV_KEYS, parseList } from "./navLayoutCore";
export { applyOrder, groupSlug, NAV_KEYS, parseList };

export interface LaidOutItem extends NavItem {
  originalLabel: string;
  hidden: boolean;
}
export interface LaidOutSection {
  key: string; // the built-in group name, which other pages still link by
  label: string;
  originalLabel: string;
  icon?: string;
  description?: string;
  hidden: boolean;
  items: LaidOutItem[];
}

export function useNavLayout() {
  const { owner, texts, save } = useDashboardTexts();

  const hidden = useMemo(() => new Set(parseList(texts[NAV_KEYS.hidden])), [texts]);

  const sections = useMemo<LaidOutSection[]>(() => {
    const groups = NAV_SECTIONS.filter((s) => s.section);
    return applyOrder(groups, (s) => groupSlug(s.section as string), parseList(texts[NAV_KEYS.groupOrder])).map((s) => {
      const name = s.section as string;
      return {
        key: name,
        label: texts[NAV_KEYS.groupLabel(name)] ?? name,
        originalLabel: name,
        icon: s.icon,
        description: s.description,
        hidden: hidden.has(hiddenGroupId(name)),
        items: applyOrder(s.items, (i) => i.href, parseList(texts[NAV_KEYS.pageOrder(name)])).map((i) => ({
          ...i,
          label: texts[NAV_KEYS.pageLabel(i.href)] ?? i.label,
          originalLabel: i.label,
          hidden: hidden.has(i.href),
        })),
      };
    });
  }, [texts, hidden]);

  const pageLabel = useCallback((href: string, fallback: string) => texts[NAV_KEYS.pageLabel(href)] ?? fallback, [texts]);
  const groupLabel = useCallback((section: string) => texts[NAV_KEYS.groupLabel(section)] ?? section, [texts]);

  // The whole new order, as the drag lists hand it over when you let go.
  const setGroupOrder = useCallback(
    async (sectionKeys: string[]) => {
      await save(NAV_KEYS.groupOrder, JSON.stringify(sectionKeys.map(groupSlug)));
    },
    [save]
  );
  const setPageOrder = useCallback(
    async (section: string, hrefs: string[]) => {
      await save(NAV_KEYS.pageOrder(section), JSON.stringify(hrefs));
    },
    [save]
  );

  // Saving the built-in name again (or an empty box) goes back to it.
  const renameGroup = useCallback(
    async (section: string, label: string) => {
      const v = label.trim();
      await save(NAV_KEYS.groupLabel(section), !v || v === section ? "" : v.slice(0, 60));
    },
    [save]
  );
  const renamePage = useCallback(
    async (href: string, original: string, label: string) => {
      const v = label.trim();
      await save(NAV_KEYS.pageLabel(href), !v || v === original ? "" : v.slice(0, 60));
    },
    [save]
  );

  const toggleHidden = useCallback(
    async (id: string) => {
      const next = new Set(hidden);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      await save(NAV_KEYS.hidden, next.size ? JSON.stringify([...next]) : "");
    },
    [hidden, save]
  );
  const toggleGroupHidden = useCallback((section: string) => toggleHidden(hiddenGroupId(section)), [toggleHidden]);
  const togglePageHidden = useCallback((href: string) => toggleHidden(href), [toggleHidden]);

  const customized = useMemo(() => Object.keys(texts).some((k) => k.startsWith("nav.")), [texts]);
  const reset = useCallback(
    async () => {
      await Promise.all(Object.keys(texts).filter((k) => k.startsWith("nav.")).map((k) => save(k, "")));
    },
    [texts, save]
  );

  return {
    owner,
    sections,
    pageLabel,
    groupLabel,
    setGroupOrder,
    setPageOrder,
    renameGroup,
    renamePage,
    toggleGroupHidden,
    togglePageHidden,
    reset,
    customized,
  };
}
