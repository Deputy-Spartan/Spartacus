// Streaming › Money Counter and K/D Counter: the shared overlay engine.
// counter.html (OBS) and the dashboard preview use it, and the test pages
// inline a copy. Sizes are in --u units (1px on the 1400x500 OBS canvas), so
// a smaller preview just sets a smaller --u.
//
//   const fx = CounterFX.mount(rootElement);
//   fx.set(settings, values);  // values: { amount } or { kills, deaths, streak }
//   fx.demo(key, diff);        // plays an animation without changing the numbers
//
// Settings are listed in packages/shared/counters.ts.
(function () {
  const CSS = `
.cfx { --u: 1px; --kc: #f9c933; --dc: #ffffff; --up: #4ade80; --down: #f87171; --gold: #f9c933; --ow: 1; --dsize: 1; --rad: calc(var(--u) * 20);
  --font: "Lilita One", "Arial Black", sans-serif; position: relative; overflow: hidden; }
.cfx-place { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(var(--scale, 1)); }
.cfx-place.at-right { left: 36%; }
.cfx-place.at-left { left: 64%; }
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
.ow-0 .cfx-num, .ow-0 .cfx-label { filter: drop-shadow(0 calc(var(--u) * 4) calc(var(--u) * 6) rgba(0,0,0,.7)); }
.cfx-stat.deaths .cfx-num { color: var(--dc); }
.cfx-stat.ratio .cfx-num { color: #fff; }
.cfx-num.flash-up { color: var(--up) !important; }
.cfx-num.flash-down { color: var(--down) !important; }
.cfx-num.glitch { animation: cfx-glitch .1s steps(2) infinite; }
@keyframes cfx-glitch {
  0% { text-shadow: calc(var(--u) * -7) 0 #ff004c, calc(var(--u) * 7) 0 #00e5ff; transform: translate(calc(var(--u) * 3), 0) skewX(-6deg); }
  100% { text-shadow: calc(var(--u) * 7) 0 #ff004c, calc(var(--u) * -7) 0 #00e5ff; transform: translate(calc(var(--u) * -3), calc(var(--u) * 2)) skewX(6deg); } }
.cfx-col { display: inline-block; height: 1.12em; overflow: hidden; }
.cfx-strip { display: flex; flex-direction: column; }
.cfx-strip span, .cfx-ch { height: 1.12em; line-height: 1.12em; }

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
/* Bullets: a brass round with a hot trail, then a hole and sparks where it hits */
.cfx-bullet { position: absolute; left: calc(var(--u) * -46); top: calc(var(--u) * -5); width: calc(var(--u) * 46); height: calc(var(--u) * 10); transform-origin: 100% 50%;
  border-radius: 0 999px 999px 0; pointer-events: none; z-index: 5;
  background: linear-gradient(90deg, rgba(255,200,80,0) 0%, rgba(255,210,110,.55) 45%, #c9932e 72%, #f5d27a 86%, #8a6115 100%);
  filter: drop-shadow(0 0 calc(var(--u) * 6) rgba(255,190,60,.9)); }
.cfx-hole { position: absolute; width: calc(var(--u) * 30); height: calc(var(--u) * 30); margin: calc(var(--u) * -15) 0 0 calc(var(--u) * -15); border-radius: 50%; pointer-events: none; z-index: 4;
  background:
    radial-gradient(circle, #050505 0 26%, #2a2a2a 31%, rgba(90,90,90,.85) 38%, rgba(0,0,0,0) 56%),
    repeating-conic-gradient(from 12deg, rgba(20,20,20,.75) 0 5deg, rgba(0,0,0,0) 5deg 44deg); }
.cfx-shard { position: absolute; width: calc(var(--u) * 16); height: calc(var(--u) * 3); margin-top: calc(var(--u) * -1.5); border-radius: 2px; background: #ffd66b; box-shadow: 0 0 calc(var(--u) * 6) #ffb020; transform-origin: 0 50%; pointer-events: none; z-index: 5; }
@media (prefers-reduced-motion: reduce) { .cfx-overlay.bob, .cfx-overlay.pulse .cfx-box, .cfx-box.shine::after { animation: none; } }
`;

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
    color: "#f9c933", dstyle: "text", dsize: 1, speed: 1, sound: "off", volume: 0.6,
    // money
    label: "TOTAL MONEY", prefix: "$", suffix: "", bigwin: true, short: false, layout: "side",
    // kills & deaths
    dcolor: "#ffffff", colors: "kd", dtext: "num", ratio: true, streakOn: true, streakEvery: 5,
    killsLabel: "KILLS", deathsLabel: "DEATHS", ratioLabel: "K/D",
  };

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
    let v = { amount: 0, kills: 0, deaths: 0, streak: 0 };
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

    // ---- What's shown ----
    const keys = () => (s.kind === "kd" ? ["kills", "deaths", ...(s.ratio ? ["ratio"] : [])] : ["amount"]);
    const valueOf = (k) => (k === "ratio" ? v.kills / Math.max(1, v.deaths) : Number(v[k]) || 0);
    const labelOf = (k) => ({ amount: s.label, kills: s.killsLabel, deaths: s.deathsLabel, ratio: s.ratioLabel })[k] ?? "";
    function shortNum(n) {
      const a = Math.abs(n);
      const [d, u] = a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : a >= 1e4 ? [1e3, "K"] : [1, ""];
      return d === 1 ? Math.round(a).toLocaleString("en-US") : (a / d).toFixed(a / d >= 100 ? 0 : 1).replace(/\.0$/, "") + u;
    }
    const moneyBody = (n) => (s.short ? shortNum(n) : Math.abs(Math.round(n)).toLocaleString("en-US"));
    function textOf(k, n) {
      if (k === "ratio") return n.toFixed(2);
      if (k === "amount") return `${n < 0 ? "-" : ""}${s.prefix}${moneyBody(n)}${s.suffix}`;
      return String(Math.round(n));
    }
    const isGood = (k, diff) => (s.kind === "kd" && s.colors === "kd" ? k === "kills" : diff > 0);
    function deltaText(k, diff) {
      const sign = diff > 0 ? "+" : "-";
      if (k === "amount") return `${sign}${s.prefix}${moneyBody(diff)}${s.suffix}`;
      const word = s.dtext === "word" ? (k === "kills" ? " KILL" : " DEATH") + (Math.abs(diff) === 1 ? "" : "S") : "";
      return `${sign}${Math.abs(diff)}${word}`;
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
      const lay = s.kind === "kd" ? s.layout : s.layout === "line" ? "line" : "side";
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
        n.textContent = textOf(k, valueOf(k));
        c.append(l, n);
        box.appendChild(c);
        cells[k] = { cell: c, num: n, shown: valueOf(k), raf: 0 };
      }
    }

    // ---- Number drawing ----
    function countTo(k) {
      const c = cells[k];
      if (!c) return;
      const to = valueOf(k), from = c.shown;
      cancelAnimationFrame(c.raf);
      if (reduce || from === to) { c.shown = to; c.num.textContent = textOf(k, to); return; }
      const t0 = performance.now(), ms = 900 / speed();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / ms);
        c.shown = from + (to - from) * (1 - Math.pow(1 - p, 3));
        c.num.textContent = textOf(k, p === 1 ? to : c.shown);
        if (p < 1) c.raf = requestAnimationFrame(step); else c.shown = to;
      };
      c.raf = requestAnimationFrame(step);
    }
    function drawSlot(k, prevText) {
      const c = cells[k];
      if (!c) return;
      cancelAnimationFrame(c.raf);
      const t = textOf(k, valueOf(k));
      c.shown = valueOf(k);
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

    // ---- The +/- amount, in the chosen spot around the stat that changed ----
    function makeDelta(k, diff) {
      const sp = document.createElement("div");
      sp.className = "cfx-spot " + s.spot;
      const d = document.createElement("div");
      d.className = "cfx-delta " + (isGood(k, diff) ? "up" : "down") + (s.dstyle === "pill" ? " pill" : "");
      d.textContent = deltaText(k, diff);
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
      const ch = (i) => s.kind === "kd" ? (k === "deaths" && diff > 0 ? "💀" : diff > 0 ? "+1" : "-1") : i % 3 === 0 ? (diff > 0 ? "+" : "-") : s.prefix.trim() || "$";
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

    // Bullets fly in from one side and hit the wall around the stat: a hole,
    // sparks, and a little kick on the box.
    function bullets(k, diff) {
      const u = U();
      const rr = root.getBoundingClientRect(), cr = cells[k].cell.getBoundingClientRect();
      const fromLeft = Math.random() < 0.5;
      const n = Math.min(8, Math.max(3, Math.abs(diff) + 3));
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
          a.finished.then(() => {
            b.remove();
            impact(x, y, ang, u, isGood(k, diff));
          }).catch(() => b.remove());
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
      const sc = scale();
      play(place, [
        { transform: `translate(-50%, -50%) scale(${sc})` },
        { transform: `translate(calc(-50% + ${rnd() * 8 * u}px), calc(-50% + ${rnd() * 6 * u}px)) scale(${sc})` },
        { transform: `translate(-50%, -50%) scale(${sc})` },
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
        const u = U(), w = root.clientWidth, h = root.clientHeight;
        const ch = s.kind === "kd" ? (diff < 0 ? "↩️" : k === "kills" ? "🔥" : "💀") : diff > 0 ? "💵" : "💸";
        for (let i = 0; i < 22; i++) {
          const e = document.createElement("div");
          if (diff > 0 || s.kind === "kd") {
            e.className = "cfx-drop"; e.textContent = ch;
            e.style.left = Math.random() * 95 + "%";
            root.appendChild(e);
            done(play(e, [
              { transform: `translateY(0) rotate(${rnd() * 30}deg)` },
              { transform: `translate(${rnd() * 40 * u}px, ${h + 180 * u}px) rotate(${rnd() * 180}deg)` },
            ], { duration: 1400 + Math.random() * 900, delay: Math.random() * 500, easing: "cubic-bezier(.4,.1,.7,1)" }), e);
          } else {
            // Taking money away: bills fly off from the box.
            e.className = "cfx-fly"; e.textContent = ch;
            cells[k].cell.appendChild(e);
            const x = rnd() * w * 0.4, y = -Math.random() * h * 0.45 - 40 * u;
            done(play(e, [
              { transform: "translate(-50%,-50%) scale(.5)", opacity: 1 },
              { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1) rotate(${x / 6 / u}deg)`, opacity: 0 },
            ], { duration: 1200 + Math.random() * 500, delay: Math.random() * 300, easing: "ease-out" }), e);
          }
        }
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
        sparkles(cell, s.kind === "kd" && k === "deaths" && diff > 0 ? "💀" : diff > 0 ? "✨" : "💥");
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
    };
    function sound(name) {
      if (s.sound === "off") return;
      if (name === "shot" && s.anim !== "bullets") return;
      (SOUNDS[name] || (() => null))();
    }

    // Streak banner: every N kills without dying.
    function banner(n) {
      const b = document.createElement("div");
      b.className = "cfx-banner";
      b.textContent = `🔥 ${n} KILL STREAK!`;
      root.appendChild(b);
      if (cells.kills) { glow(cells.kills.cell, 1600); sparkles(cells.kills.cell, "✨", 10); }
      sound("ding");
      done(play(b, [
        { opacity: 0, transform: "translateX(-50%) scale(0) rotate(-10deg)" },
        { opacity: 1, transform: "translateX(-50%) scale(1.25) rotate(3deg)", offset: .15 },
        { opacity: 1, transform: "translateX(-50%) scale(1) rotate(0)", offset: .25 },
        { opacity: 1, transform: "translateX(-50%) scale(1)", offset: .8 },
        { opacity: 0, transform: "translateX(-50%) translateY(-30px) scale(1)" },
      ], { duration: 2600, easing: "ease-out" }), b);
    }

    function celebrate(k, diff, prevText) {
      if (!cells[k]) return;
      (ANIM[s.anim] || ANIM.bounce)(k, diff, prevText);
      if (s.anim !== "bullets") sound(isGood(k, diff) ? s.sound : "down");
      else if (!isGood(k, diff)) sound("down");
      else if (s.sound !== "gunshot") sound(s.sound);
      // Money: adding 1,000,000 or more also gets the gold glow and sparkles.
      if (s.kind === "money" && s.bigwin && diff >= 1000000 && s.anim !== "jackpot") { glow(cells[k].cell, 1400); sparkles(cells[k].cell, "✨"); }
    }

    // ---- Public ----
    function set(next, vals) {
      const oldV = v;
      s = { ...s, ...(next || {}) };
      v = { ...v, ...(vals || {}) };
      drawLook();
      const shape = JSON.stringify([s.kind, s.ratio, s.layout, s.label, s.killsLabel, s.deathsLabel, s.ratioLabel, s.prefix, s.suffix, s.short]);
      if (shape !== built || !started) {
        built = shape;
        build();
        return;
      }
      for (const k of keys()) {
        if (k === "ratio") continue;
        const diff = (Number(v[k]) || 0) - (Number(oldV[k]) || 0);
        if (diff) celebrate(k, diff, textOf(k, Number(oldV[k]) || 0));
      }
      if (cells.ratio && (v.kills !== oldV.kills || v.deaths !== oldV.deaths)) countTo("ratio");
      const every = Math.max(1, Number(s.streakEvery) || 5);
      if (s.kind === "kd" && s.streakOn && v.streak > oldV.streak && Math.floor(v.streak / every) > Math.floor(oldV.streak / every)) {
        later(() => banner(Math.floor(v.streak / every) * every), 400);
      }
    }
    function start() {
      started = true;
      build();
      play(box, [{ opacity: 0, transform: "translateY(-16px) scale(.9)" }, { opacity: 1, transform: "translateY(2px) scale(1.03)", offset: 0.7 }, { opacity: 1, transform: "none" }], { duration: 450, easing: "cubic-bezier(.2,.8,.2,1)", fill: "none" });
    }
    // Plays an animation with a pretend change; the numbers stay the same.
    function demo(k, diff) {
      if (!cells[k]) k = keys()[0];
      celebrate(k, diff, textOf(k, valueOf(k)));
    }
    function streakDemo() { banner(Math.max(1, Number(s.streakEvery) || 5)); }

    drawLook();
    build();
    return { set, start, demo, streakDemo, get settings() { return s; }, get values() { return v; } };
  }

  window.CounterFX = { mount, DEFAULTS };
})();
