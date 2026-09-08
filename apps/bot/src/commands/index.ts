import { Collection } from "discord.js";
import type { CommandModule } from "./types";

import ban from "./moderation/ban";
import kick from "./moderation/kick";
import mute from "./moderation/mute";
import warn from "./moderation/warn";
import rank from "./leveling/rank";
import leaderboard from "./leveling/leaderboard";
import createEvent from "./events/create-event";
import verify from "./security/verify";
import quarantine from "./security/quarantine";
import release from "./security/release";
import poll from "./engagement/poll";
import suggest from "./engagement/suggest";
import { approveCommand as approveSuggestion, denyCommand as denySuggestion } from "./engagement/suggestionReview";
import balance from "./economy/balance";
import daily from "./economy/daily";
import coinflip from "./games/coinflip";
import slots from "./games/slots";
import trivia from "./games/trivia";
import report from "./moderation/report";

export const commands = new Collection<string, CommandModule>();

for (const command of [
  ban,
  kick,
  mute,
  warn,
  rank,
  leaderboard,
  createEvent,
  verify,
  quarantine,
  release,
  poll,
  suggest,
  approveSuggestion,
  denySuggestion,
  balance,
  daily,
  coinflip,
  slots,
  trivia,
  report,
]) {
  commands.set(command.data.name, command);
}
