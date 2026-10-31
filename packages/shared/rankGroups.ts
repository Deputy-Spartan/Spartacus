// Discord menus hold 25 options, so long rank lists split into two picks:
// a tier like Gold, then a division like Gold III.
export const MAX_RANKS = 100;

export interface RankGroup {
  name: string;
  indexes: number[]; // positions in the full rank list
}

export function rankGroups(ranks: string[]): RankGroup[] {
  const groups: RankGroup[] = [];
  ranks.forEach((rank, index) => {
    const name = rank.replace(/\s+(?:[IVX]+|\d+)$/i, "").trim() || rank;
    const group = groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
    if (group) group.indexes.push(index);
    else groups.push({ name, indexes: [index] });
  });
  return groups;
}

export function rankListProblem(ranks: string[]): string | null {
  if (ranks.length > MAX_RANKS) return `Use ${MAX_RANKS} ranks or fewer.`;
  if (ranks.length <= 25) return null;
  const groups = rankGroups(ranks);
  if (groups.length > 25) return "Over 25 ranks need tiers, like Gold I and Gold II. Use 25 tiers or fewer.";
  if (groups.some((g) => g.indexes.length > 25)) return "Each tier can have up to 25 ranks.";
  return null;
}
