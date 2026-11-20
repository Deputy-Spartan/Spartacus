// Placeholders a giveaway's built or saved embed can use.
export function giveawayTokens(g: { prize: string; winnerCount: number; endsAt: Date }): Record<string, string> {
  return {
    "{prize}": g.prize,
    "{winners}": String(g.winnerCount),
    "{ends}": `<t:${Math.floor(g.endsAt.getTime() / 1000)}:R>`,
  };
}
