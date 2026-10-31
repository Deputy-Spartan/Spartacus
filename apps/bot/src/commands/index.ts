import { Collection } from "discord.js";
import type { CommandModule } from "./types";

import ban from "./moderation/ban";
import kick from "./moderation/kick";
import mute from "./moderation/mute";
import warn from "./moderation/warn";
import purge from "./moderation/purge";
import purgeUser from "./moderation/purge-user";
import rank from "./leveling/rank";
import leaderboard from "./leveling/leaderboard";
import event from "./events/event";
import verify from "./security/verify";
import quarantine from "./security/quarantine";
import release from "./security/release";
import suggest from "./engagement/suggest";
import { approveCommand as approveSuggestion, denyCommand as denySuggestion } from "./engagement/suggestionReview";
import balance from "./economy/balance";
import daily from "./economy/daily";
import pay from "./economy/pay";
import coinflip from "./games/coinflip";
import slots from "./games/slots";
import trivia from "./games/trivia";
import match from "./games/match";
import report from "./moderation/report";
import sticky from "./community/sticky";
import birthday from "./community/birthday";
import confess from "./community/confess";
import giveawayReroll from "./engagement/giveawayReroll";
import prestige from "./leveling/prestige";
import remindme from "./utility/remindme";

export const commands = new Collection<string, CommandModule>();

for (const command of [
  ban,
  kick,
  mute,
  warn,
  purge,
  purgeUser,
  rank,
  leaderboard,
  event,
  verify,
  quarantine,
  release,
  suggest,
  approveSuggestion,
  denySuggestion,
  balance,
  daily,
  pay,
  coinflip,
  slots,
  trivia,
  match,
  report,
  sticky,
  birthday,
  confess,
  giveawayReroll,
  prestige,
  remindme,
]) {
  commands.set(command.data.name, command);
}
