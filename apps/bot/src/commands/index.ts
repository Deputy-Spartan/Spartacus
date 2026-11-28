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
import serverSetup from "./utility/serverSetup";
import hqSetup from "./utility/hqSetup";
import role from "./utility/role";
import golive from "./community/golive";
import schedule from "./community/schedule";
import link from "./community/link";
import mystream from "./community/mystream";
import profile from "./leveling/profile";
import levelroles from "./leveling/levelroles";
import resetlevels from "./leveling/resetlevels";
import shop from "./economy/shop";
import crates from "./economy/crates";
import so from "./stream/so";
import raidlist from "./stream/raidlist";
import prestream from "./stream/prestream";
import title from "./stream/title";
import gamenight from "./stream/gamenight";

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
  serverSetup,
  hqSetup,
  role,
  golive,
  schedule,
  link,
  mystream,
  profile,
  levelroles,
  resetlevels,
  shop,
  crates,
  so,
  raidlist,
  prestream,
  title,
  gamenight,
]) {
  commands.set(command.data.name, command);
}
