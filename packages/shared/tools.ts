// Streaming › Overlays › stream tools: Alerts, Chat box, Scenes, Stats bar,
// Giveaway, Leaderboard, Next stream, Subathon, Webcam frame, Clip marker,
// Command tips, QR code, Squad box, Poll, Spin wheel, Dice & coin,
// Predictions and First-time welcome.
//
// Each is one StreamDeckState row (key "tool:<kind>") holding
//   { settings, state, events: [{ id, type, data, at }], seq }
// The OBS page (apps/web/public/overlays/tool.html) draws `state` and plays
// each new event once. The dashboard, Stream Deck, Kick events and stream chat
// all change it through applyToolAction, so they always agree.

export const TOOL_KINDS = ["alerts", "chat", "scenes", "stats", "giveaway", "leader", "next", "subathon", "cam", "clip", "cmds", "qr", "squad", "poll", "wheel", "dice", "predict", "welcome"] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];
export const isToolKind = (k: unknown): k is ToolKind => TOOL_KINDS.includes(k as ToolKind);
export const toolStateKey = (k: ToolKind) => `tool:${k}`;

type Item = readonly [string | number, string, string?];
export interface ToolGroup {
  title: string;
  kind: "big" | "small" | "four";
  items: ReadonlyArray<Item>;
  font?: boolean; // show each choice in its font
  swatch?: boolean; // show each choice as a color dot
}
export interface ToolInfo {
  kind: ToolKind;
  title: string;
  icon: string;
  line: string;
  section: "extras" | "tools";
  settings: Record<string, string | number | boolean>;
  state: Record<string, unknown>;
  groups: Record<string, ToolGroup>;
  toggles: Array<[string, string, string]>;
  words: Array<[string, string]>;
  // Buttons on the dashboard (and Stream Deck commands): [label, action]
  buttons: Array<[string, Record<string, unknown>]>;
  auto: string; // what fills it in by itself
}

const COLORS: Item[] = [["#f9c933", "Gold"], ["#ffffff", "White"], ["#4ade80", "Green"], ["#f87171", "Red"], ["#22d3ee", "Cyan"], ["#f472b6", "Pink"], ["#fb923c", "Orange"], ["#a78bfa", "Purple"]];
const G = {
  look: { title: "Box look", kind: "four", items: [["dark", "Dark"], ["gold", "Gold"], ["neon", "Neon"], ["clean", "White"], ["glass", "Glass"], ["military", "Army"], ["red", "Red"], ["discord", "Discord"], ["none", "No box"]] },
  font: { title: "Font", kind: "small", font: true, items: [["lilita", "Chunky"], ["bangers", "Comic"], ["russo", "Bold"], ["blackops", "Stencil"], ["bebas", "Tall"], ["luckiest", "Cartoon"]] },
  color: { title: "Color", kind: "four", swatch: true, items: COLORS },
  corners: { title: "Corners", kind: "small", items: [["round", "Round"], ["square", "Square"], ["pill", "Pill"]] },
  outline: { title: "Outline", kind: "small", items: [["thick", "Thick"], ["thin", "Thin"], ["none", "None"]] },
  size: { title: "Size", kind: "small", items: [[0.8, "Small"], [1, "Medium"], [1.25, "Big"]] },
  volume: { title: "Volume", kind: "small", items: [[0.3, "Quiet"], [0.6, "Medium"], [1, "Loud"]] },
} satisfies Record<string, ToolGroup>;
const LOOKS = { look: G.look, font: G.font, color: G.color, corners: G.corners, outline: G.outline, size: G.size };
const COMMON = { look: "dark", font: "lilita", color: "#f9c933", corners: "round", outline: "thick", size: 1, volume: 0.6 };
const SPOTS4: Item[] = [["tl", "Top left"], ["tr", "Top right"], ["bl", "Bottom left"], ["br", "Bottom right"]];
const sound = (title: string, items: Item[]): ToolGroup => ({ title, kind: "four", items });
const IDLE: ToolGroup = { title: "While it's up", kind: "four", items: [["none", "Still"], ["float", "Float"], ["pulse", "Pulse"], ["glow", "Glow"]] };

export const TOOLS: Record<ToolKind, ToolInfo> = {
  alerts: {
    kind: "alerts", title: "Alerts", icon: "🔔", section: "extras", line: "Big pop-ups for follows, subs, gifted subs and raids.",
    settings: { ...COMMON, style: "slam", pos: "center", hold: 5, sound: "fanfare", followTitle: "NEW FOLLOWER!", subTitle: "NEW SUB!", giftTitle: "GIFTED SUBS!", raidTitle: "RAID!" },
    state: {},
    groups: {
      style: { title: "How it comes in", kind: "big", items: [["slam", "Slam", "Slams down and shakes the screen."], ["slide", "Slide", "Slides in from the side with a bounce."], ["flip", "Flip", "Flips in like a card."], ["explode", "Explode", "Pops in with confetti bursting out."], ["bullets", "Bullets", "Bullets hit the wall, then it slams in."], ["glitch", "Glitch", "Glitches in with a red and blue split."]] },
      pos: { title: "Where", kind: "small", items: [["top", "Top"], ["center", "Middle"], ["bottom", "Bottom"]] },
      hold: { title: "Stays up for", kind: "small", items: [[3, "3 sec"], [5, "5 sec"], [8, "8 sec"]] },
      ...LOOKS,
      sound: sound("Sound", [["off", "Off"], ["fanfare", "Fanfare"], ["ding", "Ding"], ["airhorn", "Airhorn"]]),
      volume: G.volume,
    },
    toggles: [],
    words: [["followTitle", "Follower words"], ["subTitle", "Sub words"], ["giftTitle", "Gift words"], ["raidTitle", "Raid words"]],
    buttons: [["💜 Test follower", { op: "test", type: "follow" }], ["⭐ Test sub", { op: "test", type: "sub" }], ["🎁 Test gift", { op: "test", type: "gift" }], ["🚀 Test raid", { op: "test", type: "raid" }]],
    auto: "Kick follows and subs show by themselves (needs Kick set up in Stream Growth).",
  },
  chat: {
    kind: "chat", title: "Chat box", icon: "💬", section: "extras", line: "Your live Kick and Twitch chat on screen.",
    settings: { ...COMMON, color: "#a78bfa", side: "left", max: 6, style: "bubbles", anim: "slide", names: "rainbow", badges: true, fade: 0, chatFont: "clean", sound: "off" },
    state: { msgs: [] },
    groups: {
      style: { title: "Style", kind: "small", items: [["bubbles", "Bubbles"], ["panel", "One panel"], ["clean", "Just text"]] },
      anim: { title: "New messages", kind: "four", items: [["slide", "Slide"], ["pop", "Pop"], ["fade", "Fade"], ["bounce", "Bounce"]] },
      side: { title: "Side", kind: "small", items: [["left", "Left"], ["right", "Right"]] },
      max: { title: "How many show", kind: "small", items: [[4, "4"], [6, "6"], [10, "10"]] },
      fade: { title: "Messages leave after", kind: "small", items: [[0, "Never"], [15, "15 sec"], [30, "30 sec"]] },
      names: { title: "Name colors", kind: "small", items: [["rainbow", "Each person"], ["accent", "All one color"]] },
      chatFont: { title: "Message font", kind: "small", items: [["clean", "Clean"], ["big", "Same as titles"]] },
      look: G.look, font: G.font, color: { ...G.color, title: "Name color (All one color)" }, corners: G.corners, size: G.size,
      sound: sound("Sound", [["off", "Off"], ["blip", "Blip"], ["pop", "Pop"], ["ding", "Ding"]]),
      volume: G.volume,
    },
    toggles: [["badges", "Badges", "🛡️ for mods, ⭐ for subs, 👑 for you."]],
    words: [],
    buttons: [["💬 Test message", { op: "test" }], ["🧹 Clear", { op: "clear" }]],
    auto: "Messages come from your Kick and Twitch chat by themselves.",
  },
  scenes: {
    kind: "scenes", title: "Scenes", icon: "🎬", section: "extras", line: "Starting Soon, Be Right Back and Ending screens with a timer.",
    settings: { ...COMMON, color: "#a78bfa", bg: "gradient", trans: "wipe", titleFx: "glow", showTimer: true, showGame: true, showSocials: true, showDiscord: true, timerLen: 300000,
      startTitle: "STARTING SOON", brbTitle: "BE RIGHT BACK", endTitle: "THANKS FOR WATCHING", startLine: "Grab a drink, we're about to go live", brbLine: "Stretch break, back in a minute", endLine: "See you next stream!", sound: "off" },
    state: { scene: "start", t0: 0, base: 300000 },
    groups: {
      bg: { title: "Background", kind: "small", items: [["gradient", "Moving colors"], ["embers", "Embers"], ["grid", "Retro grid"], ["dark", "Dark"], ["clear", "See-through"]] },
      trans: { title: "Switching scenes", kind: "small", items: [["wipe", "Wipe"], ["fade", "Fade"], ["zoom", "Zoom"]] },
      titleFx: { title: "Title while waiting", kind: "four", items: [["glow", "Glow"], ["float", "Float"], ["pulse", "Pulse"], ["none", "Still"]] },
      timerLen: { title: "Timer", kind: "four", items: [[60000, "1 min"], [300000, "5 min"], [600000, "10 min"], [900000, "15 min"]] },
      font: G.font, color: { ...G.color, title: "Accent color" }, outline: G.outline,
      sound: sound("Sound when it hits 0", [["off", "Off"], ["fanfare", "Fanfare"], ["ding", "Ding"], ["airhorn", "Airhorn"]]),
      volume: G.volume,
    },
    toggles: [["showTimer", "Timer", "A countdown under the title."], ["showGame", "Game", "From your Game overlay."], ["showSocials", "Socials", "From Overlays › Socials."], ["showDiscord", "Discord invite", "From your Discord box or Socials."]],
    words: [["startTitle", "Starting title"], ["startLine", "Starting line"], ["brbTitle", "BRB title"], ["brbLine", "BRB line"], ["endTitle", "Ending title"], ["endLine", "Ending line"]],
    buttons: [["▶ Starting", { op: "scene", scene: "start" }], ["☕ BRB", { op: "scene", scene: "brb" }], ["👋 Ending", { op: "scene", scene: "end" }], ["+1 min", { op: "add", ms: 60000 }]],
    auto: "The game, socials and invite come from your other overlays. Next stream (on Ending) comes from your schedule.",
  },
  stats: {
    kind: "stats", title: "Stats bar", icon: "📊", section: "extras", line: "One slim bar with your money, K/D, wins, goal and game.",
    settings: { ...COMMON, mode: "cycle", pos: "bottom", every: 5, showMoney: true, showKd: true, showWl: true, showGoal: true, showGame: true, sound: "off" },
    state: {},
    groups: {
      mode: { title: "How it shows them", kind: "small", items: [["cycle", "One at a time"], ["row", "All in a row"], ["scroll", "Scrolling"]] },
      pos: { title: "Where", kind: "small", items: [["top", "Top"], ["bottom", "Bottom"]] },
      every: { title: "Switch every (one at a time)", kind: "small", items: [[3, "3 sec"], [5, "5 sec"], [8, "8 sec"]] },
      look: G.look, font: G.font, color: G.color, corners: G.corners, outline: G.outline,
    },
    toggles: [["showMoney", "Money", "From your Money Counter."], ["showKd", "K/D", "From your K/D Counter."], ["showWl", "Win / Loss", "From your Win/Loss."], ["showGoal", "Goal", "From your Goal bar."], ["showGame", "Game", "From your Game overlay."]],
    words: [],
    buttons: [],
    auto: "It reads the numbers from your other overlays by itself.",
  },
  giveaway: {
    kind: "giveaway", title: "Giveaway", icon: "🎁", section: "extras", line: "Prize, entries and time left, then a winner reveal.",
    settings: { ...COMMON, source: "discord", label: "🎁 GIVEAWAY", prize: "Discord Nitro", how: "Type !join in chat to enter", showTimer: true, len: 300000, idle: "none", sound: "fanfare" },
    state: { entries: 0, names: [], t0: 0, base: 300000 },
    groups: {
      source: { title: "Which giveaway", kind: "small", items: [["discord", "My Discord giveaway"], ["chat", "Chat !join"]] },
      len: { title: "How long (Chat !join)", kind: "four", items: [[120000, "2 min"], [300000, "5 min"], [600000, "10 min"], [1800000, "30 min"]] },
      idle: IDLE,
      ...LOOKS,
      sound: sound("Sound for the winner", [["off", "Off"], ["fanfare", "Fanfare"], ["ding", "Ding"], ["airhorn", "Airhorn"]]),
      volume: G.volume,
    },
    toggles: [["showTimer", "Time left", "A countdown and a bar that empties."]],
    words: [["label", "Top words"], ["prize", "Prize (Chat !join)"], ["how", "How to enter"]],
    buttons: [["▶ Start (Chat !join)", { op: "start" }], ["🎲 Draw winner", { op: "draw" }]],
    auto: "My Discord giveaway: follows the giveaway running in your server. Chat !join: people type !join in Kick or Twitch chat.",
  },
  leader: {
    kind: "leader", title: "Leaderboard", icon: "🏅", section: "extras", line: "Top chatters, chat this week and top XP, switching between them.",
    settings: { ...COMMON, rows: 5, every: 8, side: "right", bars: true, showChat: true, showVotw: true, showXp: true, sound: "off" },
    state: { boards: {} },
    groups: {
      rows: { title: "Rows", kind: "small", items: [[3, "Top 3"], [5, "Top 5"], [8, "Top 8"]] },
      every: { title: "Switch boards every", kind: "small", items: [[5, "5 sec"], [8, "8 sec"], [15, "15 sec"]] },
      side: { title: "Side", kind: "small", items: [["left", "Left"], ["right", "Right"]] },
      ...LOOKS,
    },
    toggles: [["showChat", "Top chatters", "Who talks the most this stream."], ["showVotw", "Chat this week", "Messages this week (Viewer of the Week)."], ["showXp", "Top XP", "Your server's levels."], ["bars", "Bars", "A bar behind each name."]],
    words: [],
    buttons: [["➡ Next board", { op: "next" }]],
    auto: "Fills in by itself from stream chat and your server's levels.",
  },
  next: {
    kind: "next", title: "Next stream", icon: "📅", section: "extras", line: "When you're live next, from your schedule, with a countdown.",
    settings: { ...COMMON, label: "NEXT STREAM", showCountdown: true, showGame: true, idle: "float", sound: "off" },
    state: {},
    groups: { idle: IDLE, ...LOOKS },
    toggles: [["showCountdown", "Countdown", "Shows how long until then, like in 2d 4h."], ["showGame", "What you'll play", "From the schedule."]],
    words: [["label", "Top words"]],
    buttons: [["▶ Show it again", { op: "again" }]],
    auto: "Reads your next stream from the schedule in Stream Extras.",
  },
  subathon: {
    kind: "subathon", title: "Subathon", icon: "⏳", section: "extras", line: "A timer that follows and subs add time to.",
    settings: { ...COMMON, label: "SUBATHON", perFollow: 1, perSub: 5, cap: 0, finalFlash: true, sound: "coin" },
    state: { t0: 0, base: 3 * 3600_000, running: false },
    groups: {
      perFollow: { title: "Each follow adds", kind: "small", items: [[0, "Nothing"], [1, "1 min"], [2, "2 min"]] },
      perSub: { title: "Each sub adds", kind: "small", items: [[3, "3 min"], [5, "5 min"], [10, "10 min"]] },
      cap: { title: "Longest it can go", kind: "small", items: [[0, "No limit"], [12, "12 hours"], [24, "24 hours"]] },
      ...LOOKS,
      sound: sound("Sound when time's added", [["off", "Off"], ["coin", "Coin"], ["ding", "Ding"], ["pop", "Pop"]]),
      volume: G.volume,
    },
    toggles: [["finalFlash", "Last 10 seconds", "Turns red and pulses at the very end."]],
    words: [["label", "Top words"]],
    buttons: [["▶ / ⏸", { op: "toggle" }], ["+5 min", { op: "add", ms: 300000 }], ["+1 hour", { op: "add", ms: 3600000 }], ["−5 min", { op: "add", ms: -300000 }]],
    auto: "Kick follows and subs add time by themselves.",
  },
  cam: {
    kind: "cam", title: "Webcam frame", icon: "📷", section: "extras", line: "A frame for your camera with your name tag.",
    settings: { ...COMMON, color: "#22d3ee", style: "hud", thick: 10, name: "DEPUTY SPARTAN", showTag: true, tagPos: "bl", liveDot: true, flashOnAlert: true, sound: "off" },
    state: {},
    groups: {
      style: { title: "Frame", kind: "big", items: [["hud", "HUD corners", "Glowing corner brackets with a scan line."], ["neon", "Neon", "A glowing border that breathes."], ["gold", "Gold", "A thick shiny gold border."], ["tag", "Name tag", "A dark border with an accent edge."], ["army", "Army", "Olive stencil plate with bolts."], ["glass", "Glass", "Frosted see-through edge."], ["rainbow", "Rainbow", "A border that spins through colors."]] },
      thick: { title: "Thickness", kind: "small", items: [[6, "Thin"], [10, "Medium"], [18, "Thick"]] },
      tagPos: { title: "Name tag spot", kind: "small", items: [["bl", "Bottom left"], ["bc", "Bottom middle"], ["tl", "Top left"]] },
      look: { ...G.look, title: "Name tag look" }, font: G.font, color: G.color, corners: G.corners, size: G.size,
    },
    toggles: [["showTag", "Name tag", "Your name on the frame."], ["liveDot", "Live dot", "A blinking red dot in the tag."], ["flashOnAlert", "Flash on alerts", "Flashes when a follow or sub comes in."]],
    words: [["name", "Name on the tag"]],
    buttons: [["⚡ Flash", { op: "flash" }]],
    auto: "Put it over your camera in OBS (the middle is see-through) and resize it to fit.",
  },
  clip: {
    kind: "clip", title: "Clip marker", icon: "📌", section: "tools", line: "Press a key when something good happens; Spartacus saves the time.",
    settings: { ...COMMON, color: "#ffffff", show: "both", spot: "tr", words: "CLIPPED!", bigWords: "BIG MOMENT!", sound: "shutter" },
    state: { marks: [] },
    groups: {
      show: { title: "On stream", kind: "small", items: [["both", "Flash + badge"], ["badge", "Badge only"], ["flash", "Flash only"], ["hidden", "Nothing (just save it)"]] },
      spot: { title: "Badge spot", kind: "four", items: SPOTS4 },
      ...LOOKS,
      sound: sound("Sound", [["off", "Off"], ["shutter", "Camera"], ["ding", "Ding"], ["pop", "Pop"]]),
      volume: G.volume,
    },
    toggles: [],
    words: [["words", "Badge words"], ["bigWords", "Big moment words"]],
    buttons: [["📌 Clip it", { op: "clip" }], ["⭐ Big moment", { op: "clip", big: true }], ["🧹 Clear the list", { op: "clearMarks" }]],
    auto: "Each press saves the time and how far into the stream it was.",
  },
  cmds: {
    kind: "cmds", title: "Command tips", icon: "⌨️", section: "tools", line: "Rotating tips like Type !discord, so new viewers know what to type.",
    settings: { ...COMMON, color: "#22d3ee", corners: "pill", trans: "flip", every: 8, spot: "bl", label: "TYPE IN CHAT", tip1: "!discord — join the server", tip2: "!socials — all my links", tip3: "!join — enter the giveaway", tip4: "!lurk — lurk with us", sound: "off" },
    state: {},
    groups: {
      trans: { title: "Switching tips", kind: "small", items: [["flip", "Flip"], ["slide", "Slide"], ["type", "Typing"]] },
      every: { title: "Next tip every", kind: "small", items: [[5, "5 sec"], [8, "8 sec"], [15, "15 sec"]] },
      spot: { title: "Where", kind: "four", items: SPOTS4 },
      ...LOOKS,
    },
    toggles: [],
    words: [["label", "Top words"], ["tip1", "Tip 1"], ["tip2", "Tip 2"], ["tip3", "Tip 3"], ["tip4", "Tip 4 (optional)"]],
    buttons: [["➡ Next tip", { op: "next" }], ["⏸ Pause / play", { op: "pause" }]],
    auto: "Type your own tips, like !discord — join the server.",
  },
  qr: {
    kind: "qr", title: "QR code", icon: "🔳", section: "tools", line: "Scan to join your Discord or follow you.",
    settings: { ...COMMON, color: "#5865f2", link: "https://discord.gg/yourcode", label: "SCAN TO JOIN", caption: "discord.gg/yourcode", spot: "br", when: 0, idle: "float", qrColor: "dark", sound: "off" },
    state: {},
    groups: {
      when: { title: "When it shows", kind: "small", items: [[0, "Always"], [5, "Every 5 min"], [10, "Every 10 min"]] },
      spot: { title: "Where", kind: "four", items: SPOTS4 },
      qrColor: { title: "Code color", kind: "small", items: [["dark", "Black"], ["accent", "Accent color"]] },
      idle: IDLE,
      ...LOOKS,
    },
    toggles: [],
    words: [["link", "Link it opens"], ["label", "Top words"], ["caption", "Under the code"]],
    buttons: [["👀 Show now", { op: "show" }]],
    auto: "Point a phone camera at the preview to check the link.",
  },
  squad: {
    kind: "squad", title: "Squad box", icon: "🎧", section: "tools", line: "Who's in your Discord voice channel right now.",
    settings: { ...COMMON, color: "#4ade80", layout: "list", side: "left", showNames: true, label: "🎧 SQUAD", follow: "me", voiceChannelId: "", followUserId: "", sound: "off" },
    state: {},
    groups: {
      layout: { title: "Layout", kind: "small", items: [["list", "List"], ["row", "Row of faces"]] },
      side: { title: "Side", kind: "small", items: [["left", "Left"], ["right", "Right"]] },
      ...LOOKS,
      sound: sound("Sound when someone joins", [["off", "Off"], ["pop", "Pop"], ["ding", "Ding"], ["blip", "Blip"]]),
      volume: G.volume,
    },
    toggles: [["showNames", "Names", "Show each name."]],
    words: [["label", "Top words"]],
    buttons: [],
    auto: "Shows whichever voice channel you're in (or the one you pick), with avatars and who's muted.",
  },
  poll: {
    kind: "poll", title: "Poll", icon: "📊", section: "tools", line: "Chat votes by typing 1, 2, 3 or 4, with live bars.",
    settings: { ...COMMON, color: "#22d3ee", question: "Next game?", o1: "Siege", o2: "Valorant", o3: "", o4: "", len: 120000, how: "Type 1 or 2 in chat", bars: "solid", sound: "ding" },
    state: { votes: [0, 0, 0, 0], voters: [], t0: 0, open: false, ended: false },
    groups: {
      len: { title: "How long", kind: "four", items: [[60000, "1 min"], [120000, "2 min"], [300000, "5 min"], [0, "Until I end it"]] },
      bars: { title: "Bars", kind: "small", items: [["solid", "Solid"], ["striped", "Striped"]] },
      ...LOOKS,
      sound: sound("Sound for the result", [["off", "Off"], ["ding", "Ding"], ["fanfare", "Fanfare"], ["pop", "Pop"]]),
      volume: G.volume,
    },
    toggles: [],
    words: [["question", "Question"], ["o1", "Choice 1"], ["o2", "Choice 2"], ["o3", "Choice 3 (optional)"], ["o4", "Choice 4 (optional)"], ["how", "How to vote"]],
    buttons: [["▶ Start poll", { op: "start" }], ["🏁 End poll", { op: "end" }]],
    auto: "Votes come from Kick and Twitch chat (one vote each; typing again changes it).",
  },
  wheel: {
    kind: "wheel", title: "Spin wheel", icon: "🎡", section: "tools", line: "A wheel of challenges that spins on a key press.",
    settings: { ...COMMON, scheme: "rainbow", label: "🎡 CHALLENGE WHEEL", s1: "No scope only", s2: "10 squats", s3: "Pistol only", s4: "Free pass", s5: "Chat picks my loadout", s6: "Crouch the whole round", s7: "", s8: "", sound: "tick" },
    state: {},
    groups: {
      scheme: { title: "Wheel colors", kind: "small", items: [["rainbow", "Rainbow"], ["accent", "Accent shades"], ["casino", "Red & black"]] },
      ...LOOKS,
      sound: sound("Sound", [["off", "Off"], ["tick", "Ticks + fanfare"], ["ding", "Ding at the end"]]),
      volume: G.volume,
    },
    toggles: [],
    words: [["label", "Top words"], ["s1", "Slice 1"], ["s2", "Slice 2"], ["s3", "Slice 3"], ["s4", "Slice 4"], ["s5", "Slice 5 (optional)"], ["s6", "Slice 6 (optional)"], ["s7", "Slice 7 (optional)"], ["s8", "Slice 8 (optional)"]],
    buttons: [["🎡 Spin", { op: "spin" }]],
    auto: "Empty slices are left out.",
  },
  dice: {
    kind: "dice", title: "Dice & coin", icon: "🎲", section: "tools", line: "Roll dice or flip a coin on stream to settle bets with chat.",
    settings: { ...COMMON, count: 2, dieColor: "white", heads: "HEADS", tails: "TAILS", sound: "pop" },
    state: {},
    groups: {
      count: { title: "Dice", kind: "small", items: [[1, "1 die"], [2, "2 dice"], [3, "3 dice"]] },
      dieColor: { title: "Dice color", kind: "four", items: [["white", "White"], ["red", "Red"], ["black", "Black"], ["gold", "Gold"]] },
      look: { ...G.look, title: "Result box look" }, font: G.font, color: G.color, size: G.size,
      sound: sound("Sound", [["off", "Off"], ["pop", "Pop"], ["ding", "Ding"], ["coin", "Coin"]]),
      volume: G.volume,
    },
    toggles: [],
    words: [["heads", "Heads words"], ["tails", "Tails words"]],
    buttons: [["🎲 Roll dice", { op: "roll" }], ["🪙 Flip coin", { op: "flip" }]],
    auto: "",
  },
  predict: {
    kind: "predict", title: "Predictions", icon: "🔮", section: "tools", line: "Chat bets points on YES or NO, and you settle it.",
    settings: { ...COMMON, color: "#a78bfa", question: "Will I win this match?", yes: "YES", no: "NO", yesColor: "#22d3ee", noColor: "#f472b6", len: 60000, start: 1000, sound: "fanfare" },
    state: { pool: [0, 0], bettors: [0, 0], bets: {}, t0: 0, phase: "idle", winner: -1, top: ["", 0] },
    groups: {
      len: { title: "Betting open for", kind: "four", items: [[30000, "30 sec"], [60000, "1 min"], [120000, "2 min"], [0, "Until I lock"]] },
      yesColor: { title: "Yes color", kind: "four", swatch: true, items: COLORS },
      noColor: { title: "No color", kind: "four", swatch: true, items: COLORS },
      ...LOOKS,
      sound: sound("Sound for the result", [["off", "Off"], ["fanfare", "Fanfare"], ["ding", "Ding"], ["airhorn", "Airhorn"]]),
      volume: G.volume,
    },
    toggles: [],
    words: [["question", "Question"], ["yes", "Yes side"], ["no", "No side"]],
    buttons: [["▶ Open betting", { op: "open" }], ["🔒 Lock", { op: "lock" }], ["✅ Yes won", { op: "settle", side: 0 }], ["❌ No won", { op: "settle", side: 1 }]],
    auto: "Chat types !bet yes 100 or !bet no 50. Everyone starts each prediction with 1,000 points; winners split the pot. (Points here aren't your server's coins.)",
  },
  welcome: {
    kind: "welcome", title: "First-time welcome", icon: "👋", section: "tools", line: "Welcomes people the first time they chat.",
    settings: { ...COMMON, color: "#4ade80", corners: "pill", spot: "tl", anim: "slide", words: "Welcome {name}! First time here", backWords: "Welcome back {name}!", back: true, hold: 5, sound: "pop" },
    state: { seen: {} },
    groups: {
      anim: { title: "How it comes in", kind: "four", items: [["slide", "Slide"], ["pop", "Pop"], ["bounce", "Bounce"], ["wave", "Wave"]] },
      spot: { title: "Where", kind: "four", items: SPOTS4 },
      hold: { title: "Stays up for", kind: "small", items: [[3, "3 sec"], [5, "5 sec"], [8, "8 sec"]] },
      ...LOOKS,
      sound: sound("Sound", [["off", "Off"], ["pop", "Pop"], ["ding", "Ding"], ["blip", "Blip"]]),
      volume: G.volume,
    },
    toggles: [["back", "Welcome back", "Also welcomes people who haven't chatted in 30 days."]],
    words: [["words", "New chatter words ({name} = their name)"], ["backWords", "Welcome back words"]],
    buttons: [["👋 Test", { op: "test" }]],
    auto: "Fires by itself the first time someone chats in your Kick or Twitch chat.",
  },
};

// Stream Deck: the Overlay Tool key's choices. [value, label, kind, action]
export const TOOL_COMMANDS: Array<[string, string, ToolKind, Record<string, unknown>]> = [
  ["clip", "📌 Clip it", "clip", { op: "clip" }],
  ["clipbig", "⭐ Big moment", "clip", { op: "clip", big: true }],
  ["spin", "🎡 Spin the wheel", "wheel", { op: "spin" }],
  ["roll", "🎲 Roll dice", "dice", { op: "roll" }],
  ["flip", "🪙 Flip a coin", "dice", { op: "flip" }],
  ["sceneStart", "▶ Scene: Starting", "scenes", { op: "scene", scene: "start" }],
  ["sceneBrb", "☕ Scene: BRB", "scenes", { op: "scene", scene: "brb" }],
  ["sceneEnd", "👋 Scene: Ending", "scenes", { op: "scene", scene: "end" }],
  ["scenePlus", "+1 min on the scene timer", "scenes", { op: "add", ms: 60000 }],
  ["pollStart", "📊 Start poll", "poll", { op: "start" }],
  ["pollEnd", "🏁 End poll", "poll", { op: "end" }],
  ["predOpen", "🔮 Open betting", "predict", { op: "open" }],
  ["predLock", "🔒 Lock betting", "predict", { op: "lock" }],
  ["predYes", "✅ Prediction: Yes won", "predict", { op: "settle", side: 0 }],
  ["predNo", "❌ Prediction: No won", "predict", { op: "settle", side: 1 }],
  ["gwStart", "🎁 Start giveaway (chat !join)", "giveaway", { op: "start" }],
  ["gwDraw", "🎲 Draw giveaway winner", "giveaway", { op: "draw" }],
  ["subToggle", "⏳ Subathon start / pause", "subathon", { op: "toggle" }],
  ["subPlus", "⏳ Subathon +5 min", "subathon", { op: "add", ms: 300000 }],
  ["camFlash", "📷 Flash webcam frame", "cam", { op: "flash" }],
  ["qrShow", "🔳 Show QR code", "qr", { op: "show" }],
  ["tipNext", "⌨️ Next command tip", "cmds", { op: "next" }],
  ["boardNext", "🏅 Next leaderboard", "leader", { op: "next" }],
  ["alertTest", "🔔 Test alert", "alerts", { op: "test", type: "follow" }],
];

// ---- Saving ----
export interface ToolEvent {
  id: number;
  type: string;
  data: Record<string, unknown>;
  at: number;
}
export interface ToolRow {
  settings: Record<string, string | number | boolean>;
  state: Record<string, unknown>;
  events: ToolEvent[];
  seq: number;
}

// Settings are the defaults' keys only, each kept to its default's type.
export function cleanToolSettings(kind: ToolKind, raw: unknown): ToolRow["settings"] {
  const d = TOOLS[kind].settings;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: ToolRow["settings"] = {};
  for (const [k, def] of Object.entries(d)) {
    const v = r[k];
    if (typeof def === "number") out[k] = Number.isFinite(Number(v)) && v !== "" && v !== null && v !== undefined ? Math.max(-1e12, Math.min(1e12, Number(v))) : def;
    else if (typeof def === "boolean") out[k] = typeof v === "boolean" ? v : def;
    else out[k] = typeof v === "string" ? v.slice(0, k === "link" ? 300 : 120) : def;
  }
  // Only the choices on offer, for the ones picked from a list.
  for (const [k, g] of Object.entries(TOOLS[kind].groups)) {
    if (!g.items.some(([id]) => String(id) === String(out[k]))) out[k] = d[k];
    else if (typeof d[k] === "number") out[k] = Number(out[k]);
  }
  if (out.color && !/^#[0-9a-f]{6}$/i.test(String(out.color))) out.color = d.color;
  return out;
}
export function cleanToolRow(kind: ToolKind, raw: unknown): ToolRow {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ToolRow>;
  return {
    settings: cleanToolSettings(kind, r.settings),
    state: { ...TOOLS[kind].state, ...(r.state && typeof r.state === "object" ? r.state : {}) },
    events: Array.isArray(r.events) ? r.events.slice(-15) : [],
    seq: Number(r.seq) || 0,
  };
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const SAMPLE = ["xNova", "PixelPete", "Lena_GG", "SkyBlaze", "Mo_Plays", "QuietStorm", "Kai2k", "Jules", "RazorFox", "BeanzTV"];
const str = (x: unknown, n = 60) => (typeof x === "string" ? x.trim().slice(0, n) : "");

function push(row: ToolRow, type: string, data: Record<string, unknown> = {}, now = Date.now()) {
  row.seq += 1;
  row.events = [...row.events, { id: row.seq, type, data, at: now }].slice(-15);
}

// One change: from the dashboard, a Stream Deck key, a Kick event or chat.
// Returns the new row, or { error } in plain words.
export function applyToolAction(kind: ToolKind, current: ToolRow, a: Record<string, unknown>, now = Date.now()): ToolRow | { error: string } {
  const row: ToolRow = { settings: current.settings, state: { ...current.state }, events: [...current.events], seq: current.seq };
  const s = row.settings;
  const st = row.state as Record<string, any>;
  const op = String(a.op ?? "");
  switch (kind) {
    case "alerts": {
      const type = ["follow", "sub", "gift", "raid"].includes(String(a.type)) ? String(a.type) : "follow";
      push(row, "alert", { type, name: str(a.name, 40) || pick(SAMPLE), count: Math.max(1, Math.min(9999, Number(a.count) || (type === "gift" ? 5 : type === "raid" ? 42 : 1))) }, now);
      return row;
    }
    case "chat": {
      if (op === "clear") return { ...row, state: { ...st, msgs: [] } };
      const text = str(a.text, 300) || (op === "test" ? "This is what chat looks like on stream 👋" : "");
      if (!text) return { error: "Nothing to show." };
      const msg = { id: now + Math.random(), name: str(a.name, 40) || "Spartacus", text, badge: str(a.badge, 4), platform: str(a.platform, 10) };
      st.msgs = [...(Array.isArray(st.msgs) ? st.msgs : []), msg].slice(-20);
      return row;
    }
    case "scenes": {
      if (op === "scene" && ["start", "brb", "end"].includes(String(a.scene))) { st.scene = a.scene; st.t0 = now; st.base = Number(s.timerLen) || 300000; return row; }
      if (op === "add") { const left = Math.max(0, (Number(st.base) || 0) - (now - (Number(st.t0) || now))); st.base = Math.max(0, left + Number(a.ms || 0)); st.t0 = now; return row; }
      return { error: "Pick a scene." };
    }
    case "giveaway": {
      if (op === "start") { st.entries = 0; st.names = []; st.t0 = now; st.base = Number(s.len) || 300000; st.running = true; st.winner = ""; push(row, "start", {}, now); return row; }
      if (op === "join") {
        const name = str(a.name, 40);
        if (!name || !st.running || now - st.t0 > st.base) return row;
        const names: string[] = Array.isArray(st.names) ? st.names : [];
        if (names.some((n) => n.toLowerCase() === name.toLowerCase())) return row;
        st.names = [...names, name].slice(-5000);
        st.entries = st.names.length;
        return row;
      }
      if (op === "draw") {
        const names: string[] = Array.isArray(a.names) ? (a.names as string[]) : Array.isArray(st.names) ? st.names : [];
        if (!names.length) return { error: "Nobody has entered yet." };
        const winner = pick(names);
        st.running = false; st.winner = winner;
        push(row, "draw", { winner, names: names.slice(0, 40) }, now);
        return row;
      }
      return { error: "Start or draw." };
    }
    case "leader":
      if (op === "next") { push(row, "next", {}, now); return row; }
      if (op === "chatTop" && Array.isArray(a.top)) { st.chatTop = (a.top as Array<[string, number]>).slice(0, 10).map(([n, v]) => [str(n, 40), Number(v) || 0]); return row; }
      return { error: "Nothing to do." };
    case "next":
      push(row, "again", {}, now);
      return row;
    case "subathon": {
      const left = () => Math.max(0, st.running ? (Number(st.base) || 0) - (now - (Number(st.t0) || now)) : Number(st.base) || 0);
      const cap = (ms: number) => (Number(s.cap) ? Math.min(ms, Number(s.cap) * 3600_000) : ms);
      if (op === "toggle") { const l = left(); st.running = !st.running; st.base = l; st.t0 = now; return row; }
      if (op === "set") { st.base = cap(Math.max(0, Number(a.ms) || 0)); st.t0 = now; return row; }
      let ms = Number(a.ms) || 0;
      if (op === "event") ms = (a.type === "follow" ? Number(s.perFollow) : a.type === "gift" ? Number(s.perSub) * Math.max(1, Number(a.count) || 1) : Number(s.perSub)) * 60000;
      if (!ms) return row;
      const l = left();
      st.base = cap(Math.max(0, l + ms)); st.t0 = now;
      push(row, "add", { ms, type: str(a.type, 10) || "manual" }, now);
      return row;
    }
    case "cam":
    case "qr":
    case "cmds":
      push(row, op || "flash", {}, now);
      return row;
    case "clip": {
      if (op === "clearMarks") return { ...row, state: { ...st, marks: [] } };
      const big = !!a.big;
      const into = Number(a.into) > 0 ? Number(a.into) : null;
      st.marks = [...(Array.isArray(st.marks) ? st.marks : []), { at: now, into, big }].slice(-200);
      push(row, "clip", { big }, now);
      return row;
    }
    case "poll": {
      const choices = [s.o1, s.o2, s.o3, s.o4].map((x) => String(x || "").trim());
      if (op === "start") { st.votes = [0, 0, 0, 0]; st.voters = []; st.t0 = now; st.open = true; st.ended = false; push(row, "start", {}, now); return row; }
      if (op === "end") { if (!st.open) return { error: "There's no poll running." }; st.open = false; st.ended = true; push(row, "end", {}, now); return row; }
      if (op === "vote") {
        const i = Number(a.choice) - 1, user = str(a.user, 40).toLowerCase();
        if (!st.open || !(i >= 0 && i < 4) || !choices[i] || !user) return row;
        if (Number(s.len) && now - st.t0 > Number(s.len)) { st.open = false; st.ended = true; push(row, "end", {}, now); return row; }
        const voters: Array<[string, number]> = Array.isArray(st.voters) ? st.voters : [];
        const prev = voters.find((v) => v[0] === user);
        const votes = [...(st.votes as number[])];
        if (prev) { if (prev[1] === i) return row; votes[prev[1]]--; prev[1] = i; } else voters.push([user, i]);
        votes[i]++;
        st.votes = votes; st.voters = voters.slice(-5000);
        return row;
      }
      return { error: "Start or end the poll." };
    }
    case "wheel": {
      const slices = [s.s1, s.s2, s.s3, s.s4, s.s5, s.s6, s.s7, s.s8].map((x) => String(x || "").trim()).filter(Boolean);
      if (!slices.length) return { error: "Add at least one slice." };
      const index = Math.floor(Math.random() * slices.length);
      push(row, "spin", { index, result: slices[index] }, now);
      st.last = slices[index];
      return row;
    }
    case "dice": {
      if (op === "flip") { const heads = Math.random() < 0.5; push(row, "flip", { heads }, now); st.last = heads ? s.heads : s.tails; return row; }
      const nums = Array.from({ length: Math.max(1, Math.min(3, Number(s.count) || 1)) }, () => 1 + Math.floor(Math.random() * 6));
      push(row, "roll", { nums }, now);
      st.last = nums.join(" + ");
      return row;
    }
    case "predict": {
      if (op === "open") { st.pool = [0, 0]; st.bettors = [0, 0]; st.bets = {}; st.t0 = now; st.phase = "open"; st.winner = -1; st.top = ["", 0]; push(row, "open", {}, now); return row; }
      if (op === "lock") { if (st.phase !== "open") return { error: "Betting isn't open." }; st.phase = "locked"; return row; }
      if (op === "settle") {
        if (st.phase !== "open" && st.phase !== "locked") return { error: "Open betting first." };
        st.phase = "done"; st.winner = Number(a.side) === 1 ? 1 : 0;
        push(row, "settle", { side: st.winner }, now);
        return row;
      }
      if (op === "bet") {
        const user = str(a.user, 40).toLowerCase(), side = Number(a.side) === 1 ? 1 : 0, amt = Math.floor(Number(a.amount));
        if (st.phase !== "open" || !user || !(amt > 0)) return row;
        if (Number(s.len) && now - st.t0 > Number(s.len)) { st.phase = "locked"; return row; }
        const bets: Record<string, [number, number]> = { ...(st.bets ?? {}) };
        if (bets[user]) return row; // one bet each
        const amount = Math.min(amt, Number(s.start) || 1000);
        bets[user] = [side, amount];
        const pool = [...st.pool], bettors = [...st.bettors];
        pool[side] += amount; bettors[side]++;
        st.bets = bets; st.pool = pool; st.bettors = bettors;
        if (amount > (st.top?.[1] ?? 0)) st.top = [str(a.user, 40), amount];
        return row;
      }
      return { error: "Open, lock or settle." };
    }
    case "welcome": {
      const name = str(a.name, 40) || pick(SAMPLE);
      if (op === "chat") {
        // Kept per name: the last time they chatted.
        const seen: Record<string, number> = { ...(st.seen ?? {}) };
        const key = name.toLowerCase(), last = seen[key];
        seen[key] = now;
        const keys = Object.keys(seen);
        if (keys.length > 20000) for (const k of keys.sort((x, y) => seen[x] - seen[y]).slice(0, 2000)) delete seen[k];
        st.seen = seen;
        if (!last) push(row, "welcome", { name, back: false }, now);
        else if (s.back && now - last > 30 * 86400_000) push(row, "welcome", { name, back: true }, now);
        return row;
      }
      push(row, "welcome", { name, back: !!a.back }, now);
      return row;
    }
    case "stats":
    case "squad":
      return { error: "This one fills in by itself." };
  }
}

// What's "live" (read fresh, never saved): sent to the overlay next to state.
export interface ToolLive {
  [key: string]: unknown;
}
