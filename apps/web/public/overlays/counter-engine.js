// Streaming › Overlays: the shared overlay engine for every counter and box
// (money, K/D, win/loss, challenge, timer, goal, game, Discord, latest
// follower). counter.html (OBS) and the dashboard preview use it, and the test
// pages inline a copy. Sizes are in --u units (1px on the 1400x500 OBS
// canvas), so a smaller preview just sets a smaller --u.
//
//   const fx = CounterFX.mount(rootElement);
//   fx.set(settings, values);  // see VALUES below for each kind
//   fx.demo(key, diff);        // plays an animation without changing anything
//
// VALUES by kind:
//   money { amount }            kd { kills, deaths, streak }
//   winloss { wins, losses, streak }   challenge { count }
//   timer { timer: { running, base, t0 } }  (base = ms left, or ms counted, at t0)
//   goal { cur, target }        game { game }
//   discord { members, online } ticker { type: "follow"|"sub"|"raid", name, recent: [] }
(function () {
  const CSS = `
.cfx { --u: 1px; --kc: #f9c933; --dc: #ffffff; --up: #4ade80; --down: #f87171; --gold: #f9c933; --ow: 1; --dsize: 1; --rad: calc(var(--u) * 20);
  --font: "Lilita One", "Arial Black", sans-serif; position: relative; overflow: hidden; }
.cfx-place { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(var(--scale, 1)); }
/* The +/- on one side: pin the box to the other edge so it never runs off. */
.cfx-place.at-right { left: 4%; transform: translate(0, -50%) scale(var(--scale, 1)); transform-origin: left center; }
.cfx-place.at-left { left: auto; right: 4%; transform: translate(0, -50%) scale(var(--scale, 1)); transform-origin: right center; }
.cfx-overlay { position: relative; }
.cfx-overlay.bob { animation: cfx-bob 3s ease-in-out infinite; }
@keyframes cfx-bob { 0%, 100% { transform: translateY(0) rotate(-.6deg); } 50% { transform: translateY(calc(var(--u) * -14)) rotate(.6deg); } }
.cfx-overlay.pulse .cfx-box { animation: cfx-pulse 2.4s ease-in-out infinite; }
@keyframes cfx-pulse { 0%, 100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(1.035); filter: brightness(1.12); } }

.cfx-box { position: relative; display: inline-flex; align-items: stretch; border-radius: var(--rad);
  background: linear-gradient(180deg, #2a2a2a 0%, #151515 100%); border: calc(var(--u) * 3) solid #050505;
  box-shadow: inset 0 calc(var(--u) * 2) 0 rgba(255,255,255,.09), 0 calc(var(--u) * 10) calc(var(--u) * 22) rgba(0,0,0,.5);
  font-family: var(--font); line-height: 1; white-space: nowrap; transition: box-shadow .3s; }
.cfx-box.lay-stacked { flex-direction: column; }
.cfx-box.look-gold { background: linear-gradient(180deg, #ffe07a 0%, #e0a91e 60%, #b07b0c 100%); border-color: #5a3d00; box-shadow: inset 0 calc(var(--u) * 3) 0 rgba(255,255,255,.5), 0 calc(var(--u) * 10) calc(var(--u) * 22) rgba(0,0,0,.5); }
.cfx-box.look-gold .cfx-label { color: #3a2600; -webkit-text-stroke: 0; }
.cfx-box.look-neon { background: #0b0d14; border-color: #22d3ee; box-shadow: 0 0 calc(var(--u) * 18) #22d3ee, 0 0 calc(var(--u) * 50) rgba(34,211,238,.45), inset 0 0 calc(var(--u) * 22) rgba(34,211,238,.25); }
.cfx-box.look-neon .cfx-label { color: #a5f3fc; }
.cfx-box.look-clean { background: #f6f6f4; border-color: #1a1a1a; box-shadow: 0 calc(var(--u) * 10) calc(var(--u) * 22) rgba(0,0,0,.4); }
.cfx-box.look-clean .cfx-label { color: #1a1a1a; -webkit-text-stroke: 0; }
.cfx-box.look-glass { background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.35); box-shadow: 0 calc(var(--u) * 10) calc(var(--u) * 30) rgba(0,0,0,.35); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.cfx-box.look-military { background: linear-gradient(180deg, #4b5320 0%, #2f3514 100%); border-color: #1a1d0a; box-shadow: inset 0 calc(var(--u) * 2) 0 rgba(255,255,255,.15), 0 calc(var(--u) * 10) calc(var(--u) * 22) rgba(0,0,0,.5); }
.cfx-box.look-red { background: linear-gradient(180deg, #7f1d1d 0%, #3b0a0a 100%); border-color: #1a0505; }
.cfx-box.look-discord { background: linear-gradient(180deg, #5865f2 0%, #3c45c9 100%); border-color: #1e2266; }
.cfx-box.look-none { background: none; border-color: transparent; box-shadow: none; }
.cfx-box.shine { overflow: visible; }
.cfx-box.shine::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,.38) 50%, transparent 60%); background-size: 260% 100%; animation: cfx-shine 4s ease-in-out infinite; }
@keyframes cfx-shine { 0%, 55% { background-position: 130% 0; } 100% { background-position: -130% 0; } }

.cfx-stat { position: relative; display: flex; flex-direction: column; align-items: center; padding: calc(var(--u) * 12) calc(var(--u) * 34) calc(var(--u) * 16); border-radius: var(--rad); transition: box-shadow .3s; }
.cfx-stat + .cfx-stat { border-left: calc(var(--u) * 3) solid rgba(255,255,255,.14); }
.lay-stacked .cfx-stat + .cfx-stat { border-left: 0; border-top: calc(var(--u) * 3) solid rgba(255,255,255,.14); }
.look-clean .cfx-stat + .cfx-stat { border-color: rgba(0,0,0,.18); }
.look-none .cfx-stat + .cfx-stat { border-color: transparent; }
.lay-line .cfx-stat { flex-direction: row; align-items: baseline; gap: calc(var(--u) * 14); padding: calc(var(--u) * 12) calc(var(--u) * 26) calc(var(--u) * 14); }
.lay-line .cfx-num { font-size: calc(var(--u) * 80); }
.cfx-stat.glow { box-shadow: 0 0 0 calc(var(--u) * 5) var(--gold), 0 0 calc(var(--u) * 60) var(--gold), 0 0 calc(var(--u) * 120) rgba(249,201,51,.6); }
.cfx-label { font-size: calc(var(--u) * 30); letter-spacing: .1em; color: #fff; text-transform: uppercase; -webkit-text-stroke: calc(var(--u) * 6 * var(--ow)) #000; paint-order: stroke fill; }
.cfx-label:empty { display: none; }
.cfx-num { display: flex; font-size: calc(var(--u) * 104); margin-top: calc(var(--u) * 2); color: var(--kc); font-variant-numeric: tabular-nums;
  -webkit-text-stroke: calc(var(--u) * 12 * var(--ow)) #111; paint-order: stroke fill; text-shadow: 0 calc(var(--u) * 6 * var(--ow)) 0 #111; transition: color .2s; }
.ow-0 .cfx-num, .ow-0 .cfx-label, .ow-0 .cfx-sub { filter: drop-shadow(0 calc(var(--u) * 4) calc(var(--u) * 6) rgba(0,0,0,.7)); }
.cfx-stat.deaths .cfx-num, .cfx-stat.losses .cfx-num { color: var(--dc); }
.cfx-stat.ratio .cfx-num, .cfx-stat.winrate .cfx-num { color: #fff; }
.cfx-stat.game .cfx-num, .cfx-stat.ticker .cfx-num, .cfx-stat.discord .cfx-num { font-size: calc(var(--u) * 84); }
.cfx-num.flash-up { color: var(--up) !important; }
.cfx-num.flash-down { color: var(--down) !important; }
.cfx-num.glitch { animation: cfx-glitch .1s steps(2) infinite; }
@keyframes cfx-glitch {
  0% { text-shadow: calc(var(--u) * -7) 0 #ff004c, calc(var(--u) * 7) 0 #00e5ff; transform: translate(calc(var(--u) * 3), 0) skewX(-6deg); }
  100% { text-shadow: calc(var(--u) * 7) 0 #ff004c, calc(var(--u) * -7) 0 #00e5ff; transform: translate(calc(var(--u) * -3), calc(var(--u) * 2)) skewX(6deg); } }
.cfx-col { display: inline-block; height: 1.12em; overflow: hidden; }
.cfx-strip { display: flex; flex-direction: column; }
.cfx-strip span, .cfx-ch { height: 1.12em; line-height: 1.12em; }
.cfx-main { display: flex; flex-direction: column; align-items: center; }
.lay-line .cfx-main { align-items: flex-start; }
.cfx-row { display: flex; align-items: center; gap: calc(var(--u) * 16); }
.cfx-icon { font-size: calc(var(--u) * 66); line-height: 1; display: inline-grid; place-items: center; filter: drop-shadow(0 calc(var(--u) * 4) calc(var(--u) * 4) rgba(0,0,0,.6)); }
.cfx-icon svg { width: calc(var(--u) * 72); height: calc(var(--u) * 72); }
.cfx-sub { margin-top: calc(var(--u) * 8); font-size: calc(var(--u) * 28); letter-spacing: .04em; color: #d6dae1; -webkit-text-stroke: calc(var(--u) * 5 * var(--ow)) #000; paint-order: stroke fill; }
.cfx-sub:empty { display: none; }
.look-gold .cfx-sub, .look-clean .cfx-sub { color: #2a2a2a; -webkit-text-stroke: 0; }
/* Goal: a bar under the number */
.cfx-stat.goal { min-width: calc(var(--u) * 440); }
.cfx-stat.goal .cfx-num { font-size: calc(var(--u) * 76); }
.cfx-bar { position: relative; width: 100%; height: calc(var(--u) * 30); margin-top: calc(var(--u) * 12); border-radius: 999px; background: rgba(0,0,0,.55); border: calc(var(--u) * 3) solid #000; overflow: hidden; }
.cfx-fill { position: absolute; inset: 0 auto 0 0; width: 0; border-radius: inherit; background: linear-gradient(180deg, color-mix(in srgb, var(--kc) 70%, #fff), var(--kc) 55%, color-mix(in srgb, var(--kc) 70%, #000)); box-shadow: 0 0 calc(var(--u) * 14) var(--kc); }
.cfx-fill::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(-45deg, rgba(255,255,255,.22) 0 calc(var(--u) * 12), transparent calc(var(--u) * 12) calc(var(--u) * 24)); animation: cfx-stripes 1.2s linear infinite; }
@keyframes cfx-stripes { from { background-position: 0 0; } to { background-position: calc(var(--u) * 34) 0; } }
/* Timer: the last seconds */
.cfx-num.urgent { color: var(--down) !important; }

.cfx-spot { --dscale: 1; position: absolute; pointer-events: none; z-index: 4; }
.cfx-spot.right { left: 100%; top: 50%; transform: translateY(-50%); margin-left: calc(var(--u) * 18); }
.cfx-spot.left { right: 100%; top: 50%; transform: translateY(-50%); margin-right: calc(var(--u) * 18); }
.cfx-spot.above { bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: calc(var(--u) * 8); }
.cfx-spot.below { top: 100%; left: 50%; transform: translateX(-50%); margin-top: calc(var(--u) * 12); }
.cfx-spot.over { top: 62%; left: 50%; transform: translate(-50%, -50%); }
.cfx-spot.corner { top: 0; right: 0; transform: translate(35%, -65%) rotate(8deg); --dscale: .72; }
.cfx-delta { display: block; font-family: var(--font); font-size: calc(var(--u) * 62 * var(--dscale) * var(--dsize)); line-height: 1; white-space: nowrap;
  -webkit-text-stroke: calc(var(--u) * 10 * max(var(--ow), .5)) #000; paint-order: stroke fill; text-shadow: 0 calc(var(--u) * 5) 0 #000; }
.cfx-delta.up { color: var(--up); }
.cfx-delta.down { color: var(--down); }
.cfx-delta.pill { -webkit-text-stroke: 0; text-shadow: none; color: #04130a; background: var(--up); border: calc(var(--u) * 4) solid #000; border-radius: 999px; padding: .12em .5em .18em; box-shadow: 0 calc(var(--u) * 6) 0 #000; }
.cfx-delta.pill.down { color: #1f0606; background: var(--down); }
.cfx-bit { position: absolute; left: 50%; top: 60%; font-family: var(--font); font-size: calc(var(--u) * 46); -webkit-text-stroke: calc(var(--u) * 8) #000; paint-order: stroke fill; pointer-events: none; z-index: 3; }
.cfx-drop { position: absolute; top: calc(var(--u) * -90); font-size: calc(var(--u) * 60); pointer-events: none; z-index: 1; }
.cfx-fly { position: absolute; left: 50%; top: 50%; font-size: calc(var(--u) * 60); pointer-events: none; z-index: 3; }
.cfx-spark { position: absolute; font-size: calc(var(--u) * 42); pointer-events: none; z-index: 3; }
.cfx-banner { position: absolute; left: 50%; top: 9%; z-index: 6; font-family: var(--font); font-size: calc(var(--u) * 78); color: var(--gold); white-space: nowrap;
  -webkit-text-stroke: calc(var(--u) * 12) #000; paint-order: stroke fill; text-shadow: 0 calc(var(--u) * 7) 0 #000; pointer-events: none; }
.cfx-bullet { position: absolute; left: calc(var(--u) * -46); top: calc(var(--u) * -5); width: calc(var(--u) * 46); height: calc(var(--u) * 10); transform-origin: 100% 50%;
  border-radius: 0 999px 999px 0; pointer-events: none; z-index: 5;
  background: linear-gradient(90deg, rgba(255,200,80,0) 0%, rgba(255,210,110,.55) 45%, #c9932e 72%, #f5d27a 86%, #8a6115 100%);
  filter: drop-shadow(0 0 calc(var(--u) * 6) rgba(255,190,60,.9)); }
.cfx-hole { position: absolute; width: calc(var(--u) * 30); height: calc(var(--u) * 30); margin: calc(var(--u) * -15) 0 0 calc(var(--u) * -15); border-radius: 50%; pointer-events: none; z-index: 4;
  background:
    radial-gradient(circle, #050505 0 26%, #2a2a2a 31%, rgba(90,90,90,.85) 38%, rgba(0,0,0,0) 56%),
    repeating-conic-gradient(from 12deg, rgba(20,20,20,.75) 0 5deg, rgba(0,0,0,0) 5deg 44deg); }
.cfx-shard { position: absolute; width: calc(var(--u) * 16); height: calc(var(--u) * 3); margin-top: calc(var(--u) * -1.5); border-radius: 2px; background: #ffd66b; box-shadow: 0 0 calc(var(--u) * 6) #ffb020; transform-origin: 0 50%; pointer-events: none; z-index: 5; }
@media (prefers-reduced-motion: reduce) { .cfx-overlay.bob, .cfx-overlay.pulse .cfx-box, .cfx-box.shine::after, .cfx-fill::after { animation: none; } }
`;

  const DISCORD_SVG = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 0 13.6.3 18.1a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.4-5.3-.7-9.8-3.4-13.7zM8.5 15.4c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4z"/></svg>';
  const FONTS = {
    lilita: '"Lilita One", "Arial Black", sans-serif',
    bangers: '"Bangers", "Arial Black", sans-serif',
    russo: '"Russo One", "Arial Black", sans-serif',
    blackops: '"Black Ops One", "Arial Black", sans-serif',
    bebas: '"Bebas Neue", "Arial Narrow", sans-serif',
    luckiest: '"Luckiest Guy", "Arial Black", sans-serif',
  };
  const RADII = { round: 20, square: 4, pill: 999 };
  const OUTLINES = { thick: 1, thin: 0.5, none: 0 };

  const DEFAULTS = {
    kind: "money", size: 100, anim: "bounce", spot: "right", look: "dark", font: "lilita", corners: "round", outline: "thick", idle: "none",
    color: "#f9c933", dstyle: "text", dsize: 1, speed: 1, sound: "off", volume: 0.6, layout: "side",
    // money
    label: "TOTAL MONEY", prefix: "$", suffix: "", bigwin: true, short: false,
    // two-stat counters (kills & deaths, wins & losses)
    dcolor: "#ffffff", colors: "kd", dtext: "num", ratio: true, streakOn: true, streakEvery: 5,
    killsLabel: "KILLS", deathsLabel: "DEATHS", ratioLabel: "K/D",
    winsLabel: "WINS", lossesLabel: "LOSSES", rateLabel: "WIN %",
    // challenge
    chLabel: "SQUATS OWED", upBad: false,
    // timer
    timerLabel: "STARTING SOON", timerMode: "down", doneText: "⏰ TIME'S UP!", finalFlash: true,
    // goal
    goalLabel: "FOLLOWER GOAL", goalDone: "🎉 GOAL REACHED!", showPct: false,
    // game
    gameLabel: "NOW PLAYING", icon: "🎮", sub: "", uppercase: false, tag: "NEW GAME", showTag: true,
    // discord
    discordLabel: "JOIN THE DISCORD", invite: "discord.gg/yourcode", showOnline: true,
    // latest follower / sub / raid
    followLabel: "LATEST FOLLOWER", subLabel: "LATEST SUB", raidLabel: "LATEST RAID", showRecent: true,
  };
  const TEXT_KINDS = ["game", "ticker"];
  const ICON_KINDS = ["game", "ticker", "challenge", "discord"];

  function injectCSS() {
    if (document.getElementById("cfx-css")) return;
    const st = document.createElement("style");
    st.id = "cfx-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function mount(root) {
    injectCSS();
    root.classList.add("cfx");
    root.innerHTML = '<div class="cfx-place"><div class="cfx-overlay"><div class="cfx-box"></div></div></div>';
    const place = root.querySelector(".cfx-place");
    const overlay = root.querySelector(".cfx-overlay");
    const box = root.querySelector(".cfx-box");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let s = { ...DEFAULTS };
    let v = { amount: 0, kills: 0, deaths: 0, wins: 0, losses: 0, streak: 0, count: 0, cur: 0, target: 1000, members: 0, online: 0, game: "", type: "follow", name: "", recent: [], timer: { running: false, base: 0, t0: 0 } };
    let cells = {};
    let built = "";
    let started = false;

    const U = () => parseFloat(getComputedStyle(root).getPropertyValue("--u")) || 1;
    const speed = () => Number(s.speed) || 1;
    const scale = () => Math.max(0.3, Math.min(2.5, (Number(s.size) || 100) / 100));
    const later = (fn, ms) => setTimeout(fn, ms / speed());
    const rnd = () => Math.random() * 2 - 1;
    const play = (el, frames, o) => {
      const a = el.animate(frames, { fill: "forwards", ...o });
      a.playbackRate = speed();
      return a;
    };
    const done = (a, el) => {
      const gone = () => (el._spot || el).remove();
      a.finished.then(gone).catch(gone);
    };
    const num = (n) => Math.abs(Math.round(n)).toLocaleString("en-US");

    // ---- What's shown ----
    function keys() {
      switch (s.kind) {
        case "kd": return ["kills", "deaths", ...(s.ratio ? ["ratio"] : [])];
        case "winloss": return ["wins", "losses", ...(s.ratio ? ["winrate"] : [])];
        case "money": return ["amount"];
        default: return [{ challenge: "count", timer: "timer", goal: "goal", game: "game", discord: "discord", ticker: "ticker" }[s.kind] || "amount"];
      }
    }
    function timerMs(T) {
      const t = T || {};
      const run = t.running ? Date.now() - (Number(t.t0) || Date.now()) : 0;
      return s.timerMode === "up" ? (Number(t.base) || 0) + run : Math.max(0, (Number(t.base) || 0) - run);
    }
    function valueOf(k, vals = v) {
      switch (k) {
        case "game": return String(vals.game ?? "");
        case "ticker": return String(vals.name ?? "");
        case "ratio": return vals.kills / Math.max(1, vals.deaths);
        case "winrate": return vals.wins + vals.losses ? vals.wins / (vals.wins + vals.losses) : 0;
        case "timer": return timerMs(vals.timer);
        case "goal": return Number(vals.cur) || 0;
        case "discord": return Number(vals.members) || 0;
        default: return Number(vals[k]) || 0;
      }
    }
    function labelOf(k) {
      if (k === "ticker") return v.type === "sub" ? s.subLabel : v.type === "raid" ? s.raidLabel : s.followLabel;
      return ({ amount: s.label, kills: s.killsLabel, deaths: s.deathsLabel, ratio: s.ratioLabel, wins: s.winsLabel, losses: s.lossesLabel, winrate: s.rateLabel,
        count: s.chLabel, timer: s.timerLabel, goal: s.goalLabel, game: s.gameLabel, discord: s.discordLabel })[k] ?? "";
    }
    function shortNum(n) {
      const a = Math.abs(n);
      const [d, u] = a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : a >= 1e4 ? [1e3, "K"] : [1, ""];
      return d === 1 ? Math.round(a).toLocaleString("en-US") : (a / d).toFixed(a / d >= 100 ? 0 : 1).replace(/\.0$/, "") + u;
    }
    const moneyBody = (n) => (s.short ? shortNum(n) : num(n));
    function clock(ms) {
      const t = Math.max(0, s.timerMode === "up" ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
      const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
      return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
    }
    function textOf(k, n) {
      switch (k) {
        case "game": case "ticker": return s.uppercase ? String(n).toUpperCase() : String(n);
        case "discord": return s.invite;
        case "ratio": return n.toFixed(2);
        case "winrate": return `${Math.round(n * 100)}%`;
        case "amount": return `${n < 0 ? "-" : ""}${s.prefix}${moneyBody(n)}${s.suffix}`;
        case "timer": return clock(n);
        case "goal": {
          const t = Number(v.target) || 0;
          return `${num(n)} / ${num(t)}${s.showPct && t ? ` · ${Math.min(999, Math.round((n / t) * 100))}%` : ""}`;
        }
        default: return num(n);
      }
    }
    function subOf(k) {
      if (k === "game") return s.sub;
      if (k === "discord") return `👥 ${num(v.members)} members${s.showOnline ? `  ·  🟢 ${num(v.online)} online` : ""}`;
      if (k === "ticker") return s.showRecent && v.recent?.length ? `Also: ${v.recent.slice(0, 3).join(" · ")}` : "";
      return "";
    }
    const firstStat = { kd: "kills", winloss: "wins" };
    function isGood(k, diff) {
      if (TEXT_KINDS.includes(k) || k === "discord") return true;
      if ((s.kind === "kd" || s.kind === "winloss") && s.colors === "kd") return k === firstStat[s.kind];
      if (k === "count" && s.upBad) return diff < 0;
      return diff > 0;
    }
    function deltaText(k, diff) {
      const sign = diff > 0 ? "+" : "-";
      switch (k) {
        case "game": return s.tag || "NEW GAME";
        case "ticker": return v.type === "sub" ? "NEW SUB!" : v.type === "raid" ? "RAID!" : "NEW FOLLOWER!";
        case "discord": return diff > 0 ? `+${Math.abs(diff)} 👋` : `-${Math.abs(diff)}`;
        case "amount": return `${sign}${s.prefix}${moneyBody(diff)}${s.suffix}`;
        case "timer": return `${sign}${clock(Math.abs(diff))}`;
      }
      const words = { kills: "KILL", deaths: "DEATH", wins: "WIN", losses: "LOSS" };
      const plural = (w) => (Math.abs(diff) === 1 ? w : w === "LOSS" ? "LOSSES" : w + "S");
      const word = s.dtext === "word" && words[k] ? " " + plural(words[k]) : "";
      return `${sign}${num(diff)}${word}`;
    }
    // What rains, bursts and sparkles for each thing.
    function iconFor(k, diff) {
      switch (k) {
        case "amount": return diff > 0 ? "💵" : "💸";
        case "kills": return diff > 0 ? "🔥" : "↩️";
        case "deaths": return diff > 0 ? "💀" : "↩️";
        case "wins": return diff > 0 ? "🏆" : "↩️";
        case "losses": return diff > 0 ? "❌" : "↩️";
        case "timer": return "⏰";
        case "goal": return "🎉";
        case "discord": return "👋";
        case "count": return s.icon || "🔥";
        default: return s.icon || "🎮";
      }
    }

    function drawLook() {
      root.style.setProperty("--kc", s.color);
      root.style.setProperty("--dc", s.dcolor);
      root.style.setProperty("--dsize", String(s.dsize));
      root.style.setProperty("--ow", String(OUTLINES[s.outline] ?? 1));
      root.style.setProperty("--font", FONTS[s.font] || FONTS.lilita);
      root.style.setProperty("--rad", `calc(var(--u) * ${RADII[s.corners] ?? 20})`);
      place.style.setProperty("--scale", String(scale()));
      place.className = "cfx-place" + (s.spot === "right" ? " at-right" : s.spot === "left" ? " at-left" : "");
      overlay.classList.toggle("bob", s.anim === "float" || s.idle === "float");
      overlay.classList.toggle("pulse", s.idle === "pulse");
      root.classList.toggle("ow-0", s.outline === "none");
      const lay = s.kind === "kd" || s.kind === "winloss" ? s.layout : s.layout === "line" ? "line" : "side";
      box.className = `cfx-box look-${s.look} lay-${lay}${s.idle === "shine" ? " shine" : ""}`;
    }

    function build() {
      box.innerHTML = "";
      cells = {};
      for (const k of keys()) {
        const c = document.createElement("div");
        c.className = "cfx-stat " + k;
        const l = document.createElement("div");
        l.className = "cfx-label";
        l.textContent = labelOf(k);
        const n = document.createElement("div");
        n.className = "cfx-num";
        const cell = { cell: c, num: n, label: l, shown: valueOf(k), raf: 0, sub: null, fill: null };
        const hasIcon = ICON_KINDS.includes(k === "count" ? "challenge" : k) && (k === "discord" || s.icon);
        const hasSub = ["game", "discord", "ticker"].includes(k);
        if (hasIcon || hasSub || k === "goal") {
          const main = document.createElement("div");
          main.className = "cfx-main";
          const row = document.createElement("div");
          row.className = "cfx-row";
          if (hasIcon) {
            const ic = document.createElement("span");
            ic.className = "cfx-icon";
            if (k === "discord") ic.innerHTML = DISCORD_SVG; else ic.textContent = s.icon;
            row.appendChild(ic);
          }
          row.appendChild(n);
          main.appendChild(row);
          if (k === "goal") {
            const bar = document.createElement("div");
            bar.className = "cfx-bar";
            const fill = document.createElement("div");
            fill.className = "cfx-fill";
            bar.appendChild(fill);
            main.appendChild(bar);
            cell.fill = fill;
          }
          if (hasSub) {
            const sub = document.createElement("div");
            sub.className = "cfx-sub";
            main.appendChild(sub);
            cell.sub = sub;
          }
          c.append(l, main);
        } else c.append(l, n);
        box.appendChild(c);
        cells[k] = cell;
        paint(k, cell.shown);
      }
    }
    // Draws one stat at a value (also its bar and second line).
    function paint(k, val) {
      const c = cells[k];
      if (!c) return;
      c.num.textContent = textOf(k, val);
      if (c.fill) {
        const t = Number(v.target) || 0;
        c.fill.style.width = `${t ? Math.max(0, Math.min(100, (val / t) * 100)) : 0}%`;
      }
      if (c.sub) c.sub.textContent = subOf(k);
      if (k === "ticker") c.label.textContent = labelOf(k);
    }

    // ---- Number drawing ----
    function countTo(k) {
      const c = cells[k];
      if (!c) return;
      const to = valueOf(k), from = c.shown;
      cancelAnimationFrame(c.raf);
      if (typeof to === "string" || k === "timer" || reduce || from === to) { c.shown = to; paint(k, to); return; }
      const t0 = performance.now(), ms = 900 / speed();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / ms);
        c.shown = from + (to - from) * (1 - Math.pow(1 - p, 3));
        paint(k, p === 1 ? to : c.shown);
        if (p < 1) c.raf = requestAnimationFrame(step); else c.shown = to;
      };
      c.raf = requestAnimationFrame(step);
    }
    // Text: the letters scramble, then land one by one from the left.
    function scramble(k) {
      const c = cells[k];
      if (!c) return;
      cancelAnimationFrame(c.raf);
      c.shown = valueOf(k);
      paint(k, c.shown);
      const target = c.num.textContent;
      if (reduce) return;
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@";
      const t0 = performance.now(), ms = (500 + target.length * 45) / speed();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / ms);
        const fixed = Math.floor(p * target.length);
        let out = "";
        for (let i = 0; i < target.length; i++) out += i < fixed || /[\s/·:,.%]/.test(target[i]) ? target[i] : chars[Math.floor(Math.random() * chars.length)];
        c.num.textContent = out;
        if (p < 1) c.raf = requestAnimationFrame(step);
      };
      c.raf = requestAnimationFrame(step);
    }
    function drawSlot(k, prevText) {
      if (typeof valueOf(k) === "string" || k === "discord" || k === "timer") return scramble(k);
      const c = cells[k];
      if (!c) return;
      cancelAnimationFrame(c.raf);
      c.shown = valueOf(k);
      paint(k, c.shown);
      const t = c.num.textContent;
      c.num.textContent = "";
      const strips = [];
      [...t].forEach((ch, i) => {
        if (!/\d/.test(ch)) { const e = document.createElement("span"); e.className = "cfx-ch"; e.textContent = ch; c.num.appendChild(e); return; }
        // Digits are matched by place from the right, so 9,900 -> 10,000 rolls right.
        const old = prevText[prevText.length - (t.length - i)];
        const start = /\d/.test(old ?? "") ? Number(old) : 0;
        const col = document.createElement("span"); col.className = "cfx-col";
        const strip = document.createElement("span"); strip.className = "cfx-strip";
        for (let d = 0; d <= 9; d++) { const e = document.createElement("span"); e.textContent = d; strip.appendChild(e); }
        strip.style.transform = `translateY(${-start * 1.12}em)`;
        col.appendChild(strip); c.num.appendChild(col);
        strips.push([strip, Number(ch), i]);
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        for (const [strip, d, i] of strips) {
          strip.style.transition = reduce ? "none" : `transform ${(0.7 + (strips.length - i) * 0.04) / speed()}s cubic-bezier(.2,.9,.25,1.15)`;
          strip.style.transform = `translateY(${-d * 1.12}em)`;
        }
      }));
    }
    function flash(k, diff, ms) {
      const n = cells[k]?.num;
      if (!n) return;
      n.classList.remove("flash-up", "flash-down");
      n.classList.add(isGood(k, diff) ? "flash-up" : "flash-down");
      clearTimeout(n._t);
      n._t = setTimeout(() => n.classList.remove("flash-up", "flash-down"), ms / speed());
    }

    // ---- The +/- (or tag), in the chosen spot around the stat that changed ----
    function makeDelta(k, diff) {
      const sp = document.createElement("div");
      sp.className = "cfx-spot " + s.spot;
      const d = document.createElement("div");
      d.className = "cfx-delta " + (isGood(k, diff) ? "up" : "down") + (s.dstyle === "pill" ? " pill" : "");
      d.textContent = deltaText(k, diff);
      if (TEXT_KINDS.includes(k) && !s.showTag) d.style.display = "none";
      sp.appendChild(d);
      cells[k].cell.appendChild(sp);
      d._spot = sp;
      return d;
    }
    function rise(k, diff) {
      const d = makeDelta(k, diff);
      done(play(d, [
        { opacity: 0, transform: "translateY(50%)" }, { opacity: 1, transform: "translateY(0)", offset: .15 },
        { opacity: 1, transform: "translateY(0)", offset: .6 }, { opacity: 0, transform: "translateY(-150%)" },
      ], { duration: 2000, easing: "ease-out" }), d);
    }
    function popIn(k, diff) {
      const d = makeDelta(k, diff);
      done(play(d, [
        { opacity: 0, transform: "scale(0) rotate(-12deg)" }, { opacity: 1, transform: "scale(1.25) rotate(4deg)", offset: .2 },
        { opacity: 1, transform: "scale(1) rotate(0)", offset: .35 }, { opacity: 1, transform: "translateY(-12%)", offset: .7 }, { opacity: 0, transform: "translateY(-100%)" },
      ], { duration: 1900, easing: "ease-out" }), d);
    }
    function shake(el, amt = 1) {
      const u = U() * amt;
      play(el, [
        { transform: "none" }, { transform: `translate(${-12 * u}px,${6 * u}px) rotate(-2deg)` }, { transform: `translate(${10 * u}px,${-4 * u}px) rotate(2deg)` },
        { transform: `translate(${-8 * u}px,${4 * u}px) rotate(-1deg)` }, { transform: `translate(${6 * u}px,0) rotate(1deg)` }, { transform: "none" },
      ], { duration: 420, easing: "linear", fill: "none" });
    }
    function glow(cell, ms) { cell.classList.add("glow"); later(() => cell.classList.remove("glow"), ms); }
    function sparkles(cell, ch, n = 14) {
      const u = U();
      for (let i = 0; i < n; i++) {
        const e = document.createElement("div");
        e.className = "cfx-spark"; e.textContent = ch;
        e.style.left = Math.random() * 100 + "%"; e.style.top = Math.random() * 100 + "%";
        cell.appendChild(e);
        done(play(e, [
          { opacity: 0, transform: "translate(-50%,-50%) scale(0) rotate(0)" },
          { opacity: 1, transform: `translate(calc(-50% + ${rnd() * 110 * u}px), calc(-50% + ${rnd() * 75 * u}px)) scale(1.3) rotate(90deg)`, offset: .4 },
          { opacity: 0, transform: `translate(calc(-50% + ${rnd() * 180 * u}px), calc(-50% + ${rnd() * 120 * u}px)) scale(.4) rotate(180deg)` },
        ], { duration: 1100, delay: Math.random() * 400, easing: "ease-out" }), e);
      }
    }
    function bits(k, diff) {
      const u = U(), cell = cells[k].cell;
      const ch = (i) => {
        if (k === "amount") return i % 3 === 0 ? (diff > 0 ? "+" : "-") : s.prefix.trim() || "$";
        if (["kills", "deaths", "wins", "losses", "count", "goal"].includes(k)) return i % 2 ? iconFor(k, diff) : diff > 0 ? "+1" : "-1";
        return i % 2 ? "★" : iconFor(k, diff);
      };
      for (let i = 0; i < 16; i++) {
        const b = document.createElement("div");
        b.className = "cfx-bit"; b.textContent = ch(i); b.style.color = isGood(k, diff) ? "var(--up)" : "var(--down)";
        cell.appendChild(b);
        const ang = (Math.PI * 2 * i) / 16 + Math.random() * 0.4, dist = (140 + Math.random() * 130) * u;
        const x = Math.cos(ang) * dist, y = Math.sin(ang) * dist * 0.7;
        done(play(b, [
          { opacity: 1, transform: "translate(-50%,-50%) scale(.4)" },
          { opacity: 1, transform: `translate(calc(-50% + ${x * .7}px), calc(-50% + ${y * .7 - 40 * u}px)) scale(1.1) rotate(${x / 6 / u}deg)`, offset: .45 },
          { opacity: 0, transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y + 60 * u}px)) scale(.8) rotate(${x / 4 / u}deg)` },
        ], { duration: 900 + Math.random() * 300, easing: "cubic-bezier(.2,.7,.4,1)" }), b);
      }
    }
    function rainDown(ch, n = 22) {
      const u = U(), h = root.clientHeight;
      for (let i = 0; i < n; i++) {
        const e = document.createElement("div");
        e.className = "cfx-drop"; e.textContent = ch;
        e.style.left = Math.random() * 95 + "%";
        root.appendChild(e);
        done(play(e, [
          { transform: `translateY(0) rotate(${rnd() * 30}deg)` },
          { transform: `translate(${rnd() * 40 * u}px, ${h + 180 * u}px) rotate(${rnd() * 180}deg)` },
        ], { duration: 1400 + Math.random() * 900, delay: Math.random() * 500, easing: "cubic-bezier(.4,.1,.7,1)" }), e);
      }
    }

    // Bullets fly in from one side and hit the wall around the stat: a hole,
    // sparks, and a little kick on the box.
    function bullets(k, diff) {
      const u = U();
      const rr = root.getBoundingClientRect(), cr = cells[k].cell.getBoundingClientRect();
      const fromLeft = Math.random() < 0.5;
      const n = Math.min(8, Math.max(3, Math.abs(Number(diff) || 1) + 3));
      for (let i = 0; i < n; i++) {
        later(() => {
          const x = cr.left - rr.left + (Math.random() * 1.5 - 0.25) * cr.width;
          const y = cr.top - rr.top + (Math.random() * 1.7 - 0.35) * cr.height;
          const x0 = fromLeft ? -60 * u : rr.width + 60 * u;
          const y0 = y + rnd() * rr.height * 0.35;
          const ang = (Math.atan2(y - y0, x - x0) * 180) / Math.PI;
          const b = document.createElement("div");
          b.className = "cfx-bullet";
          root.appendChild(b);
          const a = b.animate([
            { transform: `translate(${x0}px, ${y0}px) rotate(${ang}deg)` },
            { transform: `translate(${x}px, ${y}px) rotate(${ang}deg)` },
          ], { duration: 170, easing: "linear", fill: "forwards" });
          a.finished.then(() => { b.remove(); impact(x, y, ang, u, isGood(k, diff)); }).catch(() => b.remove());
        }, i * 120);
      }
    }
    function impact(x, y, ang, u, good) {
      const h = document.createElement("div");
      h.className = "cfx-hole";
      h.style.left = x + "px"; h.style.top = y + "px";
      root.appendChild(h);
      done(h.animate([
        { opacity: 0, transform: "scale(.3)" }, { opacity: 1, transform: "scale(1.15)", offset: .05 }, { opacity: 1, transform: "scale(1)", offset: .12 },
        { opacity: 1, transform: "scale(1)", offset: .8 }, { opacity: 0, transform: "scale(1)" },
      ], { duration: 2200 / speed(), fill: "forwards" }), h);
      // Sparks bounce back off the wall, away from where the bullet came from.
      for (let i = 0; i < 7; i++) {
        const sh = document.createElement("div");
        sh.className = "cfx-shard";
        if (!good) { sh.style.background = "#ff8a8a"; sh.style.boxShadow = `0 0 ${6 * u}px #ff3b3b`; }
        sh.style.left = x + "px"; sh.style.top = y + "px";
        root.appendChild(sh);
        const back = ang + 180 + rnd() * 70;
        const dist = (40 + Math.random() * 70) * u;
        done(sh.animate([
          { opacity: 1, transform: `rotate(${back}deg) translateX(0) scaleX(1)` },
          { opacity: 0, transform: `rotate(${back}deg) translateX(${dist}px) scaleX(.3)` },
        ], { duration: 320, easing: "ease-out", fill: "forwards" }), sh);
      }
      play(box, [
        { transform: "none" },
        { transform: `translate(${rnd() * 8 * u}px, ${rnd() * 6 * u}px)` },
        { transform: "none" },
      ], { duration: 110, fill: "none" });
      sound("shot");
    }

    // ---- The animations ----
    const ANIM = {
      bounce(k, diff) {
        countTo(k);
        const u = U();
        play(cells[k].cell, [
          { transform: "translateY(0) scale(1)" }, { transform: `translateY(${-28 * u}px) scale(1.05,.95)`, offset: .3 },
          { transform: "translateY(0) scale(1.07,.92)", offset: .55 }, { transform: `translateY(${-10 * u}px) scale(.98,1.02)`, offset: .75 }, { transform: "none" },
        ], { duration: 650, easing: "ease-out", fill: "none" });
        const d = makeDelta(k, diff);
        done(play(d, [
          { opacity: 0, transform: "scale(.3)" }, { opacity: 1, transform: "scale(1.35)", offset: .15 }, { opacity: 1, transform: "scale(.9)", offset: .25 },
          { opacity: 1, transform: "scale(1.08)", offset: .33 }, { opacity: 1, transform: "scale(1)", offset: .6 }, { opacity: 0, transform: "translateY(-140%)" },
        ], { duration: 2000, easing: "ease-out" }), d);
      },
      float(k, diff) {
        countTo(k); flash(k, diff, 700);
        const d = makeDelta(k, diff);
        done(play(d, [
          { opacity: 0, transform: "translate(0,-20%) rotate(0)" }, { opacity: 1, transform: "translate(4%,-70%) rotate(-5deg)", offset: .2 },
          { opacity: 1, transform: "translate(-4%,-130%) rotate(5deg)", offset: .45 }, { opacity: 1, transform: "translate(4%,-190%) rotate(-4deg)", offset: .7 },
          { opacity: 0, transform: "translate(0,-260%) rotate(0)" },
        ], { duration: 2600, easing: "ease-in-out" }), d);
      },
      slam(k, diff) {
        const d = makeDelta(k, diff);
        done(play(d, [
          { opacity: 0, transform: "translateY(-260%) scale(2.2)" }, { opacity: 1, transform: "scale(1)", offset: .18 }, { opacity: 1, transform: "scale(1.15,.85)", offset: .24 },
          { opacity: 1, transform: "scale(1)", offset: .32 }, { opacity: 1, transform: "scale(1)", offset: .75 }, { opacity: 0, transform: "scale(.6)" },
        ], { duration: 1900, easing: "ease-in" }), d);
        later(() => { countTo(k); flash(k, diff, 900); if (cells[k]) shake(cells[k].cell); }, 330);
      },
      burst(k, diff) {
        countTo(k); flash(k, diff, 600);
        play(cells[k].num, [{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out", fill: "none" });
        bits(k, diff);
        popIn(k, diff);
      },
      slot(k, diff, prevText) {
        drawSlot(k, prevText);
        later(() => flash(k, diff, 600), 650);
        rise(k, diff);
      },
      pop(k, diff) {
        countTo(k); flash(k, diff, 800);
        play(cells[k].num, [
          { transform: "scale(1) rotate(0)" }, { transform: "scale(1.35) rotate(-4deg)", offset: .25 }, { transform: "scale(1.2) rotate(4deg)", offset: .45 },
          { transform: "scale(1.25) rotate(-2deg)", offset: .6 }, { transform: "scale(1) rotate(0)" },
        ], { duration: 800, easing: "ease-out", fill: "none" });
        const d = makeDelta(k, diff);
        done(play(d, [
          { opacity: 0, transform: "scale(.5)" }, { opacity: 1, transform: "scale(1.2)", offset: .15 }, { opacity: 1, transform: "scale(1)", offset: .25 },
          { opacity: 1, transform: "scale(1)", offset: .75 }, { opacity: 0, transform: "scale(.8)" },
        ], { duration: 1800, easing: "ease-out" }), d);
      },
      rain(k, diff) {
        countTo(k); flash(k, diff, 800);
        if (k === "amount" && diff < 0) {
          // Taking money away: bills fly off from the box.
          const u = U(), w = root.clientWidth, h = root.clientHeight;
          for (let i = 0; i < 22; i++) {
            const e = document.createElement("div");
            e.className = "cfx-fly"; e.textContent = "💸";
            cells[k].cell.appendChild(e);
            const x = rnd() * w * 0.4, y = -Math.random() * h * 0.45 - 40 * u;
            done(play(e, [
              { transform: "translate(-50%,-50%) scale(.5)", opacity: 1 },
              { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1) rotate(${x / 6 / u}deg)`, opacity: 0 },
            ], { duration: 1200 + Math.random() * 500, delay: Math.random() * 300, easing: "ease-out" }), e);
          }
        } else rainDown(iconFor(k, diff));
        rise(k, diff);
      },
      bullets(k, diff) {
        bullets(k, diff);
        later(() => { countTo(k); flash(k, diff, 900); if (cells[k]) shake(cells[k].cell, 0.7); }, 200);
        popIn(k, diff);
      },
      jackpot(k, diff) {
        countTo(k); flash(k, diff, 1200);
        const cell = cells[k].cell;
        glow(cell, 1500); shake(cell);
        sparkles(cell, isGood(k, diff) ? "✨" : iconFor(k, diff) === "💀" ? "💀" : "💥");
        const d = makeDelta(k, diff);
        done(play(d, [
          { opacity: 0, transform: "scale(0) rotate(-20deg)" }, { opacity: 1, transform: "scale(1.5) rotate(6deg)", offset: .18 },
          { opacity: 1, transform: "scale(1.1) rotate(-3deg)", offset: .3 }, { opacity: 1, transform: "scale(1.2) rotate(0)", offset: .7 }, { opacity: 0, transform: "translateY(-120%) scale(1)" },
        ], { duration: 2200, easing: "ease-out" }), d);
      },
      spin(k, diff) {
        flash(k, diff, 900);
        play(cells[k].cell, [{ transform: "perspective(800px) rotateX(0)" }, { transform: "perspective(800px) rotateX(360deg)" }], { duration: 750, easing: "cubic-bezier(.3,.1,.3,1)", fill: "none" });
        later(() => countTo(k), 250);
        popIn(k, diff);
      },
      glitch(k, diff) {
        const c = cells[k], u = U();
        c.num.classList.add("glitch");
        later(() => { c.num.classList.remove("glitch"); countTo(k); flash(k, diff, 700); }, 520);
        play(c.cell, [
          { transform: "none" }, { transform: `translate(${-6 * u}px, ${2 * u}px)` }, { transform: `translate(${5 * u}px, ${-3 * u}px) skewX(4deg)` },
          { transform: `translate(${-3 * u}px, 0) skewX(-3deg)` }, { transform: "none" },
        ], { duration: 360, easing: "steps(4)", iterations: 2, fill: "none" });
        const d = makeDelta(k, diff);
        done(play(d, [
          { opacity: 0, transform: "translateX(-8%)" }, { opacity: 1, transform: "translateX(6%)", offset: .05 }, { opacity: 0, transform: "translateX(0)", offset: .09 },
          { opacity: 1, transform: "translateX(-4%)", offset: .13 }, { opacity: 1, transform: "none", offset: .2 }, { opacity: 1, transform: "none", offset: .7 },
          { opacity: 0, transform: "translateY(-100%)" },
        ], { duration: 1900, easing: "linear" }), d);
      },
    };

    // ---- Sounds (made on the fly, no files) ----
    let ac = null;
    function ctx() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
      if (ac.state === "suspended") ac.resume().catch(() => null);
      return ac;
    }
    const vol = () => Math.max(0.05, Math.min(1, Number(s.volume) || 0.6));
    function tone(f, t0, dur, type, g, f2) {
      const a = ctx(); if (!a) return;
      const t = a.currentTime + t0, o = a.createOscillator(), gn = a.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, g * vol()), t + 0.008);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn).connect(a.destination);
      o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(t0, dur, g, type, freq) {
      const a = ctx(); if (!a) return;
      const t = a.currentTime + t0, len = Math.ceil(a.sampleRate * dur);
      const buf = a.createBuffer(1, len, a.sampleRate), data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain();
      src.buffer = buf; f.type = type; f.frequency.value = freq;
      gn.gain.setValueAtTime(Math.max(0.0002, g * vol()), t);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(gn).connect(a.destination);
      src.start(t);
    }
    const SOUNDS = {
      chaching() { tone(1568, 0, 0.09, "square", 0.1); tone(2093, 0.07, 0.45, "square", 0.1); noise(0, 0.25, 0.22, "highpass", 5000); },
      coin() { tone(988, 0, 0.07, "square", 0.13); tone(1319, 0.07, 0.35, "square", 0.13); },
      pop() { tone(300, 0, 0.12, "sine", 0.5, 900); },
      gunshot() { noise(0, 0.4, 0.9, "lowpass", 1500); tone(120, 0, 0.18, "sine", 0.6, 40); },
      hitmarker() { noise(0, 0.05, 0.5, "highpass", 6000); tone(2600, 0, 0.06, "square", 0.07); },
      ding() { tone(1320, 0, 0.7, "sine", 0.35); tone(2640, 0, 0.35, "sine", 0.08); },
      down() { tone(420, 0, 0.14, "triangle", 0.3, 300); tone(300, 0.12, 0.3, "triangle", 0.3, 180); },
      shot() { noise(0, 0.12, 0.5, "lowpass", 2500); },
      whoosh() { noise(0, 0.45, 0.5, "bandpass", 900); tone(220, 0, 0.4, "sine", 0.15, 660); },
      fanfare() { tone(523, 0, 0.14, "square", 0.1); tone(659, 0.13, 0.14, "square", 0.1); tone(784, 0.26, 0.14, "square", 0.1); tone(1047, 0.39, 0.5, "square", 0.12); },
      tick() { tone(1000, 0, 0.05, "square", 0.08); },
    };
    function sound(name) {
      if (s.sound === "off") return;
      if (name === "shot" && s.anim !== "bullets") return;
      (SOUNDS[name] || (() => null))();
    }

    // Big banners: streaks, goal reached, time's up.
    function banner(text, cellKey) {
      const b = document.createElement("div");
      b.className = "cfx-banner";
      b.textContent = text;
      root.appendChild(b);
      const c = cells[cellKey || keys()[0]];
      if (c) { glow(c.cell, 1600); sparkles(c.cell, "✨", 10); }
      if (s.sound !== "off") SOUNDS.fanfare();
      done(play(b, [
        { opacity: 0, transform: "translateX(-50%) scale(0) rotate(-10deg)" },
        { opacity: 1, transform: "translateX(-50%) scale(1.25) rotate(3deg)", offset: .15 },
        { opacity: 1, transform: "translateX(-50%) scale(1) rotate(0)", offset: .25 },
        { opacity: 1, transform: "translateX(-50%) scale(1)", offset: .8 },
        { opacity: 0, transform: "translateX(-50%) translateY(-30px) scale(1)" },
      ], { duration: 2600, easing: "ease-out" }), b);
    }
    const streakText = (n) => (s.kind === "winloss" ? `🏆 ${n} WIN STREAK!` : `🔥 ${n} KILL STREAK!`);

    function celebrate(k, diff, prevText) {
      if (!cells[k]) return;
      (ANIM[s.anim] || ANIM.bounce)(k, diff, prevText);
      if (s.anim !== "bullets") sound(isGood(k, diff) ? s.sound : "down");
      else if (!isGood(k, diff)) sound("down");
      else if (s.sound !== "gunshot") sound(s.sound);
      // Money: adding 1,000,000 or more also gets the gold glow and sparkles.
      if (s.kind === "money" && s.bigwin && diff >= 1000000 && s.anim !== "jackpot") { glow(cells[k].cell, 1400); sparkles(cells[k].cell, "✨"); }
    }

    // ---- The timer ticks by itself ----
    let lastSec = null;
    setInterval(() => {
      if (s.kind !== "timer" || !cells.timer || !started) return;
      const c = cells.timer;
      const ms = timerMs(v.timer);
      if (!c.num.querySelector(".cfx-col") && !c.raf) paint("timer", ms);
      const running = !!v.timer?.running;
      const sec = Math.ceil(ms / 1000);
      if (s.timerMode === "down" && running && sec !== lastSec) {
        if (s.finalFlash && sec > 0 && sec <= 10) {
          c.num.classList.add("urgent");
          play(c.num, [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 300, easing: "ease-out", fill: "none" });
          if (s.sound !== "off") SOUNDS.tick();
        }
        if (sec === 0 && lastSec > 0) { c.num.classList.remove("urgent"); banner(s.doneText || "⏰ TIME'S UP!", "timer"); }
      }
      if (sec > 10 || !running) c.num.classList.remove("urgent");
      lastSec = sec;
    }, 200);

    // ---- Public ----
    function set(next, vals) {
      const oldV = v;
      s = { ...s, ...(next || {}) };
      v = { ...v, ...(vals || {}) };
      drawLook();
      const shape = JSON.stringify([s.kind, s.ratio, s.layout, s.label, s.killsLabel, s.deathsLabel, s.ratioLabel, s.winsLabel, s.lossesLabel, s.rateLabel,
        s.prefix, s.suffix, s.short, s.gameLabel, s.icon, s.sub, s.uppercase, s.chLabel, s.timerLabel, s.goalLabel, s.discordLabel, s.invite, s.showOnline, s.showPct, s.showRecent,
        s.followLabel, s.subLabel, s.raidLabel, s.timerMode]);
      if (shape !== built || !started) {
        built = shape;
        build();
        return;
      }
      const old = (k) => valueOf(k, oldV);
      switch (s.kind) {
        case "game":
          if (old("game") !== valueOf("game")) celebrate("game", 1, textOf("game", old("game")));
          return;
        case "ticker":
          if (old("ticker") !== valueOf("ticker") || oldV.type !== v.type) celebrate("ticker", 1, "");
          else paint("ticker", valueOf("ticker"));
          return;
        case "timer": {
          const diff = valueOf("timer") - old("timer");
          if (Math.abs(diff) > 1500 && (v.timer?.base !== oldV.timer?.base)) celebrate("timer", diff, textOf("timer", old("timer")));
          else if (!!v.timer?.running !== !!oldV.timer?.running) play(cells.timer.num, [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300, fill: "none" });
          paint("timer", valueOf("timer"));
          return;
        }
        case "goal": {
          if (v.target !== oldV.target) paint("goal", cells.goal.shown);
          const diff = valueOf("goal") - old("goal");
          if (diff) celebrate("goal", diff, textOf("goal", old("goal")));
          const t = Number(v.target) || 0;
          if (t && old("goal") < t && valueOf("goal") >= t) later(() => { banner(s.goalDone || "🎉 GOAL REACHED!", "goal"); rainDown("🎉", 18); }, 500);
          return;
        }
        case "discord": {
          const diff = valueOf("discord") - old("discord");
          if (diff) celebrate("discord", diff, "");
          else paint("discord", valueOf("discord"));
          return;
        }
      }
      for (const k of keys()) {
        if (k === "ratio" || k === "winrate") continue;
        const diff = valueOf(k) - old(k);
        if (diff) celebrate(k, diff, textOf(k, old(k)));
      }
      for (const r of ["ratio", "winrate"]) if (cells[r]) countTo(r);
      const every = Math.max(1, Number(s.streakEvery) || 5);
      if ((s.kind === "kd" || s.kind === "winloss") && s.streakOn && v.streak > oldV.streak && Math.floor(v.streak / every) > Math.floor(oldV.streak / every)) {
        later(() => banner(streakText(Math.floor(v.streak / every) * every), firstStat[s.kind]), 400);
      }
    }
    function start() {
      started = true;
      build();
      play(box, [{ opacity: 0, transform: "translateY(-16px) scale(.9)" }, { opacity: 1, transform: "translateY(2px) scale(1.03)", offset: 0.7 }, { opacity: 1, transform: "none" }], { duration: 450, easing: "cubic-bezier(.2,.8,.2,1)", fill: "none" });
    }
    // Plays an animation with a pretend change; nothing changes.
    function demo(k, diff) {
      if (!cells[k]) k = keys()[0];
      celebrate(k, diff, textOf(k, valueOf(k)));
    }
    function streakDemo() {
      if (s.kind === "goal") return banner(s.goalDone || "🎉 GOAL REACHED!", "goal");
      if (s.kind === "timer") return banner(s.doneText || "⏰ TIME'S UP!", "timer");
      banner(streakText(Math.max(1, Number(s.streakEvery) || 5)), firstStat[s.kind]);
    }

    drawLook();
    build();
    return { set, start, demo, streakDemo, get settings() { return s; }, get values() { return v; } };
  }

  window.CounterFX = { mount, DEFAULTS };
})();
