// Streaming › Overlays › stream tools: draws all 18 tools on a 1920x1080
// canvas (tool.html for OBS, and the dashboard preview). Looks: tools.css.
//
//   const fx = ToolsFX.mount(rootElement, kind);
//   fx.set(settings, state, live, events);  // events play once each, by id
//   fx.fire(type, data);                    // play one now (previews)
//
// Settings and state are described in packages/shared/tools.ts. "live" is
// what the API reads fresh (stream chat names, voice channel, schedule…).
(function () {
  const FONTS = { lilita: '"Lilita One", "Arial Black", sans-serif', bangers: '"Bangers", "Arial Black", sans-serif', russo: '"Russo One", "Arial Black", sans-serif', blackops: '"Black Ops One", "Arial Black", sans-serif', bebas: '"Bebas Neue", "Arial Narrow", sans-serif', luckiest: '"Luckiest Guy", "Arial Black", sans-serif' };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rnd = () => Math.random() * 2 - 1;
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmtClock = (ms, up) => { const t = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; };
  const play = (el, frames, o) => el.animate(frames, { fill: "forwards", ...o });
  const gone = (a, el) => a.finished.then(() => el.remove()).catch(() => el.remove());
  const box = (s, extra = "") => `xb look-${s.look} ${extra}`;

  function mount(root, kind) {
    root.classList.add("xs");
    const U = () => parseFloat(getComputedStyle(root).getPropertyValue("--u")) || 1;

    // ---- Sounds (made on the fly) ----
    let ac = null, vol = 0.6;
    function actx() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } } if (ac.state === "suspended") ac.resume().catch(() => null); return ac; }
    function tone(f, t0, dur, type, g, f2) { const a = actx(); if (!a) return; const t = a.currentTime + t0, o = a.createOscillator(), gn = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, g * vol), t + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(gn).connect(a.destination); o.start(t); o.stop(t + dur + 0.05); }
    function noise(t0, dur, g, type, freq) { const a = actx(); if (!a) return; const t = a.currentTime + t0, len = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; const src = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain(); src.buffer = buf; f.type = type; f.frequency.value = freq; gn.gain.setValueAtTime(Math.max(0.0002, g * vol), t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); src.connect(f).connect(gn).connect(a.destination); src.start(t); }
    const SOUNDS = {
      off() {},
      fanfare() { tone(523, 0, 0.14, "square", 0.1); tone(659, 0.13, 0.14, "square", 0.1); tone(784, 0.26, 0.14, "square", 0.1); tone(1047, 0.39, 0.5, "square", 0.12); },
      ding() { tone(1320, 0, 0.7, "sine", 0.35); tone(2640, 0, 0.35, "sine", 0.08); },
      airhorn() { for (const f of [466, 554, 698]) tone(f, 0, 0.9, "sawtooth", 0.06); for (const f of [466, 554, 698]) tone(f, 1.0, 0.5, "sawtooth", 0.05); },
      pop() { tone(300, 0, 0.12, "sine", 0.5, 900); },
      blip() { tone(880, 0, 0.06, "square", 0.08); },
      coin() { tone(988, 0, 0.07, "square", 0.13); tone(1319, 0.07, 0.35, "square", 0.13); },
      drum() { for (let i = 0; i < 14; i++) noise(i * 0.09, 0.07, 0.35, "lowpass", 600); },
      tick() { tone(1000, 0, 0.05, "square", 0.08); },
      shot() { noise(0, 0.12, 0.5, "lowpass", 2500); },
      shutter() { noise(0, 0.04, 0.7, "highpass", 3000); noise(0.06, 0.09, 0.5, "bandpass", 1600); },
    };
    const sfx = (name) => (SOUNDS[name] || SOUNDS.off)();

    // ---- Shared effects ----
    function confetti(layer, n = 40, chars = ["🎉", "✨", "⭐", "💛"]) {
      const h = root.clientHeight;
      for (let i = 0; i < n; i++) {
        const e = document.createElement("div");
        e.className = "particle"; e.textContent = pickOne(chars);
        e.style.left = Math.random() * 96 + "%"; e.style.top = "-8%"; e.style.fontSize = `calc(var(--u) * ${40 + Math.random() * 40})`;
        layer.appendChild(e);
        gone(play(e, [{ transform: `translateY(0) rotate(${rnd() * 40}deg)` }, { transform: `translate(${rnd() * 60}px, ${h * 1.2}px) rotate(${rnd() * 360}deg)` }], { duration: 1600 + Math.random() * 1400, delay: Math.random() * 500, easing: "cubic-bezier(.4,.1,.7,1)" }), e);
      }
    }
    function burst(layer, x, y, chars, n = 18, dist = 300) {
      const u = U();
      for (let i = 0; i < n; i++) {
        const e = document.createElement("div");
        e.className = "particle"; e.textContent = pickOne(chars); e.style.left = x + "px"; e.style.top = y + "px"; e.style.fontSize = `calc(var(--u) * ${36 + Math.random() * 30})`;
        layer.appendChild(e);
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.3, d = dist * (0.5 + Math.random() * 0.6) * u;
        gone(play(e, [{ transform: "translate(-50%,-50%) scale(.3)", opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * d}px), calc(-50% + ${Math.sin(ang) * d * 0.8}px)) scale(1.1) rotate(${rnd() * 180}deg)`, opacity: 0 }], { duration: 1000 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.4,1)" }), e);
      }
    }
    const centerOf = (el) => { const r = el.getBoundingClientRect(), sr = root.getBoundingClientRect(); return [r.left - sr.left + r.width / 2, r.top - sr.top + r.height / 2]; };
    function shakeEl(el, amt = 10) {
      const u = U() * amt;
      play(el, [{ translate: "0 0" }, { translate: `${-u}px ${u * 0.5}px` }, { translate: `${u}px ${-u * 0.4}px` }, { translate: `${-u * 0.6}px ${u * 0.3}px` }, { translate: "0 0" }], { duration: 380, fill: "none" });
    }
    function bulletsAt(layer, target, n, soundOn) {
      const u = U(), rr = root.getBoundingClientRect(), cr = target.getBoundingClientRect(), fromLeft = Math.random() < 0.5;
      for (let i = 0; i < n; i++) setTimeout(() => {
        const x = cr.left - rr.left + (Math.random() * 1.4 - 0.2) * cr.width, y = cr.top - rr.top + (Math.random() * 1.5 - 0.25) * cr.height;
        const x0 = fromLeft ? -60 * u : rr.width + 60 * u, y0 = y + rnd() * rr.height * 0.35, ang = (Math.atan2(y - y0, x - x0) * 180) / Math.PI;
        const b = document.createElement("div"); b.className = "bullet"; layer.appendChild(b);
        b.animate([{ transform: `translate(${x0}px, ${y0}px) rotate(${ang}deg)` }, { transform: `translate(${x}px, ${y}px) rotate(${ang}deg)` }], { duration: 160, fill: "forwards" }).finished.then(() => {
          b.remove();
          const h = document.createElement("div"); h.className = "hole"; h.style.left = x + "px"; h.style.top = y + "px"; layer.appendChild(h);
          gone(h.animate([{ opacity: 0, transform: "scale(.3)" }, { opacity: 1, transform: "scale(1)", offset: 0.1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2400, fill: "forwards" }), h);
          for (let k = 0; k < 6; k++) { const sh = document.createElement("div"); sh.className = "shard"; sh.style.left = x + "px"; sh.style.top = y + "px"; layer.appendChild(sh); const back = ang + 180 + rnd() * 70; gone(sh.animate([{ opacity: 1, transform: `rotate(${back}deg) translateX(0)` }, { opacity: 0, transform: `rotate(${back}deg) translateX(${(40 + Math.random() * 60) * u}px) scaleX(.3)` }], { duration: 300, fill: "forwards" }), sh); }
          shakeEl(target, 4); if (soundOn) sfx("shot");
        }).catch(() => b.remove());
      }, i * 110);
    }
    const PAL = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6"];
    const colorOf = (n) => PAL[[...String(n)].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];

    // ================= The 18 tools =================
    // Each: mount(layer, s, st, live) → { fire(type, data), sync(st, live), stop() }
    const M = {};

    M.alerts = (layer, s) => {
      const wrap = document.createElement("div");
      wrap.className = "al-wrap " + s.pos;
      layer.appendChild(wrap);
      const queue = [];
      let busy = false;
      const ICON = { follow: "💜", sub: "⭐", gift: "🎁", raid: "🚀" };
      async function next() {
        if (busy || !queue.length) return;
        busy = true;
        const { type, name, count } = queue.shift();
        const el = document.createElement("div");
        el.className = box(s, "al");
        const msg = { follow: "Thanks for the follow!", sub: "just subscribed!", gift: `gifted ${count} subs!`, raid: `is raiding with ${count} viewers!` }[type];
        el.innerHTML = `<div class="al-icon">${ICON[type]}</div><div class="al-title acc xt"></div><div class="al-name xt"></div><div class="al-msg xt"></div>`;
        el.querySelector(".al-title").textContent = s[type + "Title"];
        el.querySelector(".al-name").textContent = name;
        el.querySelector(".al-msg").textContent = msg;
        wrap.appendChild(el);
        sfx(type === "follow" && s.sound === "fanfare" ? "ding" : s.sound);
        const IN = {
          slam: [[{ opacity: 0, transform: "scale(3)" }, { opacity: 1, transform: "scale(.9)", offset: 0.6 }, { opacity: 1, transform: "scale(1)" }], 500],
          slide: [[{ opacity: 0, transform: "translateX(-140%)" }, { opacity: 1, transform: "translateX(6%)", offset: 0.7 }, { opacity: 1, transform: "translateX(0)" }], 600],
          flip: [[{ opacity: 0, transform: "perspective(900px) rotateX(-95deg)" }, { opacity: 1, transform: "perspective(900px) rotateX(12deg)", offset: 0.7 }, { opacity: 1, transform: "perspective(900px) rotateX(0)" }], 650],
          explode: [[{ opacity: 0, transform: "scale(0) rotate(-10deg)" }, { opacity: 1, transform: "scale(1.15) rotate(3deg)", offset: 0.6 }, { opacity: 1, transform: "scale(1)" }], 550],
          bullets: [[{ opacity: 0, transform: "scale(2.5)" }, { opacity: 1, transform: "scale(.92)", offset: 0.65 }, { opacity: 1, transform: "scale(1)" }], 450],
          glitch: [[{ opacity: 0, transform: "translateX(-4%) skewX(-12deg)" }, { opacity: 1, transform: "translateX(3%) skewX(8deg)", offset: 0.2 }, { opacity: 0, offset: 0.3 }, { opacity: 1, transform: "translateX(-2%)", offset: 0.45 }, { opacity: 1, transform: "none" }], 600],
        }[s.style] || [[{ opacity: 0 }, { opacity: 1 }], 400];
        if (s.style === "bullets") { bulletsAt(layer, wrap, 5, s.sound !== "off"); await new Promise((r) => setTimeout(r, 650)); }
        if (s.style === "glitch") { el.querySelector(".al-name").classList.add("glitchy"); setTimeout(() => el.querySelector(".al-name")?.classList.remove("glitchy"), 700); }
        await play(el, IN[0], { duration: reduce ? 1 : IN[1], easing: "cubic-bezier(.2,.8,.2,1)" }).finished.catch(() => null);
        if (s.style === "slam" || s.style === "bullets") shakeEl(layer, 14);
        if (s.style === "explode") { const [x, y] = centerOf(el); burst(layer, x, y, ["🎉", "✨", ICON[type], "⭐"], 26, 520); }
        play(el.querySelector(".al-icon"), [{ transform: "scale(1) rotate(0)" }, { transform: "scale(1.2) rotate(-8deg)" }, { transform: "scale(1) rotate(0)" }], { duration: 900, iterations: 3, fill: "none" });
        await new Promise((r) => setTimeout(r, (Number(s.hold) || 5) * 1000));
        await play(el, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: s.style === "slide" ? "translateX(140%)" : "translateY(-40%) scale(.9)" }], { duration: 400, easing: "ease-in" }).finished.catch(() => null);
        el.remove();
        busy = false;
        next();
      }
      return { fire(t, d) { if (t === "alert") { queue.push({ type: d.type || "follow", name: d.name || "Someone", count: d.count || 1 }); next(); } }, stop() { queue.length = 0; } };
    };

    M.chat = (layer, s, st) => {
      const wrap = document.createElement("div");
      wrap.className = `ch-wrap ${s.side} ${s.style} ${s.chatFont === "big" ? "big" : ""} ${s.style === "panel" ? box(s) : ""}`;
      layer.appendChild(wrap);
      const drawn = new Set(), timers = [];
      const col = (n) => (s.names === "accent" ? s.color : colorOf(n));
      function draw(m, animate) {
        drawn.add(m.id);
        const el = document.createElement("div");
        el.className = "ch-msg" + (s.style === "bubbles" ? " " + box(s) : "");
        if (s.badges && m.badge) { const b = document.createElement("span"); b.className = "ch-badge"; b.textContent = m.badge; el.appendChild(b); }
        const nm = document.createElement("span"); nm.className = "ch-name"; nm.style.color = col(m.name); nm.textContent = m.name + ":"; el.appendChild(nm);
        el.appendChild(document.createTextNode(m.text));
        wrap.appendChild(el);
        while (wrap.children.length > s.max) wrap.firstElementChild.remove();
        if (animate && !reduce) {
          const fromX = s.side === "left" ? "-60%" : "60%";
          const A = { slide: [{ opacity: 0, transform: `translateX(${fromX})` }, { opacity: 1, transform: "none" }], pop: [{ opacity: 0, transform: "scale(.5)" }, { opacity: 1, transform: "scale(1.06)", offset: 0.7 }, { opacity: 1, transform: "none" }], fade: [{ opacity: 0 }, { opacity: 1 }], bounce: [{ opacity: 0, transform: "translateY(60%)" }, { opacity: 1, transform: "translateY(-12%)", offset: 0.6 }, { opacity: 1, transform: "none" }] }[s.anim];
          el.animate(A, { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" });
        }
        if (Number(s.fade)) timers.push(setTimeout(() => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: "forwards" }).finished.then(() => el.remove()).catch(() => null), s.fade * 1000));
      }
      const msgs = Array.isArray(st.msgs) ? st.msgs : [];
      for (const m of msgs.slice(-s.max)) draw(m, false);
      for (const m of msgs) drawn.add(m.id);
      return {
        sync(nst) {
          const fresh = (Array.isArray(nst.msgs) ? nst.msgs : []).filter((m) => !drawn.has(m.id));
          if (!(nst.msgs || []).length) { wrap.innerHTML = ""; drawn.clear(); }
          fresh.forEach((m, i) => setTimeout(() => { draw(m, true); if (i === 0) sfx(s.sound); }, i * 150));
        },
        stop() { timers.forEach(clearTimeout); },
      };
    };

    M.scenes = (layer, s, st, live, fromScene) => {
      root.classList.toggle("see", s.bg === "clear");
      const sc = document.createElement("div");
      sc.className = "sc";
      sc.innerHTML = `<div class="sc-bg ${s.bg}"></div><div class="sc-in"><div class="sc-title xt"></div><div class="sc-line xt"></div><div class="sc-timer xt"></div><div class="sc-chips"></div></div>`;
      if (s.bg === "grid") { const g = document.createElement("div"); g.className = "sc-grid"; sc.querySelector(".sc-bg").appendChild(g); }
      const scene = st.scene || "start";
      const T = { start: [s.startTitle, s.startLine], brb: [s.brbTitle, s.brbLine], end: [s.endTitle, s.endLine + (live.next ? `  ·  Next: ${live.next}` : "")] }[scene];
      const title = sc.querySelector(".sc-title"), timer = sc.querySelector(".sc-timer");
      title.textContent = T[0]; sc.querySelector(".sc-line").textContent = T[1];
      const fx = { glow: "glowtxt", float: "bob", pulse: "pulse" }[s.titleFx]; if (fx) title.classList.add(fx);
      timer.hidden = !s.showTimer || scene === "end";
      const chips = sc.querySelector(".sc-chips");
      const chip = (t, acc) => { const c = document.createElement("span"); c.className = "sc-chip xt" + (acc ? " acc-chip" : ""); c.textContent = t; chips.appendChild(c); };
      if (s.showGame && live.game) chip("🎮 " + live.game, true);
      if (s.showSocials) for (const x of live.socials || []) chip(x);
      if (s.showDiscord && live.discord) chip("💬 " + live.discord);
      layer.appendChild(sc);
      if (fromScene && !reduce) {
        const A = { wipe: [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], fade: [{ opacity: 0 }, { opacity: 1 }], zoom: [{ opacity: 0, transform: "scale(1.3)" }, { opacity: 1, transform: "none" }] }[s.trans];
        sc.animate(A, { duration: 700, easing: "cubic-bezier(.6,0,.2,1)" });
      }
      let cur = { ...st }, embers = 0, lastSec = null;
      const iv = setInterval(() => {
        const left = Math.max(0, (Number(cur.base) || 0) - (Date.now() - (Number(cur.t0) || Date.now())));
        timer.textContent = left > 0 ? fmtClock(left) : "Any second now…";
        const sec = Math.ceil(left / 1000);
        if (sec !== lastSec && sec === 0 && lastSec > 0) { sfx(s.sound); confetti(layer, 24); }
        lastSec = sec;
        if (s.bg === "embers" && ++embers % 2 === 0 && !reduce) {
          const e = document.createElement("div"); e.className = "particle";
          e.style.cssText = `left:${Math.random() * 100}%;bottom:-2%;width:calc(var(--u)*${6 + Math.random() * 8});height:calc(var(--u)*${6 + Math.random() * 8});border-radius:50%;background:${s.color};box-shadow:0 0 calc(var(--u)*14) ${s.color}`;
          sc.querySelector(".sc-bg").appendChild(e);
          gone(e.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: `translate(${rnd() * 80}px, -${root.clientHeight * 1.1}px)`, opacity: 0 }], { duration: 3000 + Math.random() * 3000, easing: "linear" }), e);
        }
      }, 200);
      return {
        sync(nst, nlive) {
          if ((nst.scene || "start") !== scene || JSON.stringify(nlive) !== JSON.stringify(live)) return "remount-scene";
          if (nst.base !== cur.base || Math.abs((nst.t0 || 0) - (cur.t0 || 0)) > 1500) { cur = { ...nst }; play(timer, [{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 400, fill: "none" }); }
        },
        stop() { clearInterval(iv); root.classList.remove("see"); },
      };
    };

    M.stats = (layer, s, st, live) => {
      const bar = document.createElement("div");
      bar.className = `sb ${s.pos} ` + box(s);
      layer.appendChild(bar);
      let L = live;
      // Timers count on their own between updates.
      const clockOf = (t, down = true) => { if (!t) return ""; const run = t.running ? Date.now() - (Number(t.t0) || Date.now()) : 0; return fmtClock(t.up || !down ? (Number(t.base) || 0) + run : Math.max(0, (Number(t.base) || 0) - run), !!t.up); };
      const items = () => [
        s.showMoney && L.money != null && ["money", "💰", "MONEY", L.money],
        s.showKd && L.kd != null && ["kd", "🎯", "K / D", L.kd],
        s.showRatio && L.ratio != null && ["ratio", "🎯", "K/D RATIO", L.ratio],
        s.showWl && L.wl != null && ["wl", "🏆", "W / L", L.wl],
        s.showWinrate && L.winrate != null && ["winrate", "🏆", "WIN %", L.winrate],
        s.showGoal && L.goal != null && ["goal", "📈", "GOAL", L.goal],
        s.showGame && L.game && ["game", "🎮", "PLAYING", L.game],
        s.showTimer && L.timer && ["timer", "⏱️", String(L.timer.label || "TIMER"), clockOf(L.timer)],
        s.showChallenge && L.challenge != null && ["challenge", "🏋️", String(L.challengeLabel || "CHALLENGE"), L.challenge],
        s.showSubathon && L.subathon && ["subathon", "⏳", "SUBATHON", clockOf(L.subathon)],
        s.showLatest && L.latest && ["latest", "💜", "LATEST", L.latest],
        s.showNext && L.next && ["next", "📅", "NEXT STREAM", L.next],
      ].filter(Boolean);
      const tick = setInterval(() => {
        for (const e of bar.querySelectorAll('[data-id="timer"] .sb-v')) e.textContent = clockOf(L.timer);
        for (const e of bar.querySelectorAll('[data-id="subathon"] .sb-v')) e.textContent = clockOf(L.subathon);
      }, 500);
      const itemEl = ([id, icon, label, val]) => { const e = document.createElement("span"); e.className = "sb-item xt"; e.dataset.id = id; e.innerHTML = `<span>${icon}</span><span class="sb-l acc"></span><span class="sb-v"></span>`; e.querySelector(".sb-l").textContent = label; e.querySelector(".sb-v").textContent = val; return e; };
      let iv = null, idx = 0;
      function draw() {
        bar.innerHTML = "";
        const list = items();
        bar.style.visibility = list.length ? "" : "hidden";
        if (!list.length) return;
        if (s.mode === "row") { const r = document.createElement("div"); r.className = "sb-row"; list.forEach((it) => r.appendChild(itemEl(it))); bar.appendChild(r); }
        else if (s.mode === "scroll") { const t = document.createElement("div"); t.className = "sb-track"; t.style.setProperty("--dur", list.length * 5 + "s"); [...list, ...list].forEach((it) => t.appendChild(itemEl(it))); bar.appendChild(t); }
        else { const c = document.createElement("div"); c.className = "sb-cycle"; c.appendChild(itemEl(list[idx % list.length])); bar.appendChild(c); }
      }
      draw();
      if (s.mode === "cycle") iv = setInterval(() => {
        const list = items(); if (list.length < 2) return;
        const c = bar.querySelector(".sb-cycle"); if (!c) return;
        const old = c.firstElementChild; idx++;
        const nw = itemEl(list[idx % list.length]); c.appendChild(nw);
        if (!reduce) { old.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-120%)", opacity: 0 }], { duration: 450, fill: "forwards", easing: "ease-in" }).finished.then(() => old.remove()); nw.animate([{ transform: "translateY(120%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 450, easing: "ease-out" }); } else old.remove();
      }, (Number(s.every) || 5) * 1000);
      return {
        sync(nst, nlive) {
          const changed = ["money", "kd", "ratio", "wl", "winrate", "goal", "game", "challenge", "latest", "next", "timer", "subathon"].filter((k) => JSON.stringify(nlive[k]) !== JSON.stringify(L[k]));
          if (!changed.length) return;
          L = nlive;
          const list = items(), i = list.findIndex((x) => x[0] === changed[0]);
          if (s.mode === "cycle" && i >= 0) idx = i;
          draw();
          for (const id of changed) if (id !== "timer" && id !== "subathon") for (const e of bar.querySelectorAll(`[data-id="${id}"] .sb-v`)) e.classList.add("sb-flash");
          if (changed.some((k) => k !== "timer" && k !== "subathon")) sfx(s.sound);
        },
        stop() { clearInterval(iv); clearInterval(tick); },
      };
    };

    M.giveaway = (layer, s, st, live) => {
      const g = document.createElement("div");
      g.className = box(s, "gv");
      g.innerHTML = `<div class="gv-label acc xt"></div><div class="gv-prize xt"></div><div class="gv-how xt"></div><div class="gv-stats xt"><span class="gv-e"></span><span class="gv-t"></span></div><div class="gv-bar"><div class="gv-fill"></div></div>`;
      g.querySelector(".gv-label").textContent = s.label;
      g.querySelector(".gv-how").textContent = s.how;
      g.querySelector(".gv-t").hidden = g.querySelector(".gv-bar").hidden = !s.showTimer;
      if (s.idle === "float") g.classList.add("bob"); if (s.idle === "pulse") g.classList.add("pulse");
      if (s.idle === "glow") g.querySelector(".gv-prize").classList.add("glowtxt");
      layer.appendChild(g);
      let S = st, L = live, drawing = false;
      const info = () => {
        if (s.source === "discord") { const gw = L.gw; return gw ? { prize: gw.prize, entries: gw.entries, left: Math.max(0, gw.endsAt - Date.now()), total: gw.total, ended: gw.ended } : null; }
        const total = Number(S.base) || 1, left = S.running ? Math.max(0, total - (Date.now() - (Number(S.t0) || Date.now()))) : 0;
        return { prize: s.prize, entries: Number(S.entries) || 0, left, total, ended: !S.running && !!S.winner, winner: S.winner };
      };
      const paint = () => {
        if (drawing) return;
        const i = info();
        g.style.visibility = i ? "" : "hidden";
        if (!i) return;
        g.querySelector(".gv-prize").textContent = i.prize;
        g.querySelector(".gv-e").textContent = `👥 ${Number(i.entries).toLocaleString()} entries`;
        g.querySelector(".gv-t").textContent = i.ended ? (s.source === "discord" ? "🏆 Winners in Discord" : `🏆 ${i.winner}`) : `⏱️ ${fmtClock(i.left)}`;
        g.querySelector(".gv-fill").style.width = Math.min(100, (i.left / (i.total || 1)) * 100) + "%";
      };
      paint();
      const iv = setInterval(paint, 300);
      return {
        sync(nst, nlive) { const before = Number((s.source === "discord" ? L.gw?.entries : S.entries) || 0); S = nst; L = nlive; paint(); const after = Number((s.source === "discord" ? L.gw?.entries : S.entries) || 0); if (after > before) play(g.querySelector(".gv-e"), [{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 350, fill: "none" }); },
        fire(t, d) {
          if (t !== "draw" || drawing) return;
          drawing = true;
          const kids = [...g.children];
          kids.forEach((c) => (c.style.display = "none"));
          const roll = document.createElement("div"); roll.className = "gv-roll xt"; g.appendChild(roll);
          const label = document.createElement("div"); label.className = "gv-label acc xt"; label.textContent = "🎲 PICKING A WINNER…"; g.prepend(label);
          if (s.sound !== "off") sfx("drum");
          const names = d.names && d.names.length ? d.names : [d.winner];
          let delay = 50, t2 = 0;
          const spin = () => { roll.textContent = pickOne(names); t2 += delay; delay *= 1.12; if (t2 < 2600) setTimeout(spin, delay); else land(); };
          const land = () => {
            roll.textContent = d.winner; label.textContent = "🏆 WINNER!"; g.classList.add("glow"); sfx(s.sound);
            play(roll, [{ transform: "scale(.5)" }, { transform: "scale(1.3)", offset: 0.6 }, { transform: "scale(1)" }], { duration: 600, fill: "none" });
            confetti(layer, 46);
            setTimeout(() => { roll.remove(); label.remove(); g.classList.remove("glow"); kids.forEach((c) => (c.style.display = "")); drawing = false; paint(); }, 8000);
          };
          spin();
        },
        stop() { clearInterval(iv); },
      };
    };

    M.leader = (layer, s, st, live) => {
      const lb = document.createElement("div");
      lb.className = `lb ${s.side} ` + box(s);
      lb.innerHTML = `<div class="lb-title acc xt"></div><div class="lb-rows"></div>`;
      layer.appendChild(lb);
      let L = live, board = 0;
      const TITLES = { chat: ["💬 TOP CHATTERS", ""], votw: ["⭐ CHAT THIS WEEK", ""], xp: ["📈 TOP XP", " lvl"] };
      const boards = () => [s.showChat && "chat", s.showVotw && "votw", s.showXp && "xp"].filter((b) => b && (L.boards?.[b] || []).length);
      const rowsEl = lb.querySelector(".lb-rows");
      function draw(flip) {
        const list = boards(); lb.style.visibility = list.length ? "" : "hidden"; if (!list.length) return;
        const key = list[board % list.length], rows = (L.boards[key] || []).slice(0, s.rows), top = rows[0]?.[1] || 1;
        lb.querySelector(".lb-title").textContent = TITLES[key][0];
        const before = new Map([...rowsEl.children].map((r) => [r.dataset.name, r.getBoundingClientRect().top]));
        rowsEl.innerHTML = "";
        rows.forEach(([name, val], i) => {
          const r = document.createElement("div"); r.className = "lb-row xt"; r.dataset.name = name;
          r.innerHTML = `<div class="lb-bar" style="width:${s.bars ? (val / top) * 100 : 0}%"></div><div class="lb-rank">${["🥇", "🥈", "🥉"][i] || i + 1}</div><div class="lb-name"></div><div class="lb-val"></div>`;
          r.querySelector(".lb-name").textContent = name; r.querySelector(".lb-val").textContent = Number(val).toLocaleString() + TITLES[key][1];
          rowsEl.appendChild(r);
          if (flip && before.has(name) && !reduce) { const dy = before.get(name) - r.getBoundingClientRect().top; if (dy) r.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 600, easing: "cubic-bezier(.2,.8,.2,1)" }); }
          else if (!flip && !reduce) r.animate([{ opacity: 0, transform: "translateX(30%)" }, { opacity: 1, transform: "none" }], { duration: 400, delay: i * 80, easing: "ease-out", fill: "backwards" });
        });
      }
      draw(false);
      const iv = setInterval(() => { board++; draw(false); }, (Number(s.every) || 8) * 1000);
      return { sync(nst, nlive) { if (JSON.stringify(nlive) === JSON.stringify(L)) return; L = nlive; draw(true); }, fire(t) { if (t === "next") { board++; draw(false); } }, stop() { clearInterval(iv); } };
    };

    M.next = (layer, s, st, live) => {
      const n = document.createElement("div");
      n.className = box(s, "nx");
      if (s.idle === "float") n.classList.add("bob"); if (s.idle === "pulse") n.classList.add("pulse");
      const nx = live.next;
      n.innerHTML = `<div class="nx-label acc xt"></div><div class="nx-when xt"></div><div class="nx-line xt nx-game"></div><div class="nx-line xt nx-cd"></div>`;
      n.querySelector(".nx-label").textContent = s.label;
      n.querySelector(".nx-when").textContent = nx ? nx.whenText : "Check the schedule";
      if (s.idle === "glow") n.querySelector(".nx-when").classList.add("glowtxt");
      const game = n.querySelector(".nx-game"); game.textContent = nx && nx.game ? "🎮 " + nx.game : ""; game.hidden = !(s.showGame && nx && nx.game);
      const cd = n.querySelector(".nx-cd"); cd.hidden = !s.showCountdown || !nx;
      const at = nx ? Date.now() + nx.inMs : 0;
      const paint = () => { if (!nx) return; const ms = Math.max(0, at - Date.now()), d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4); cd.textContent = ms ? `⏰ in ${d ? d + "d " : ""}${h}h ${m}m` : "🔴 Live now!"; };
      paint();
      layer.appendChild(n);
      const iv = setInterval(paint, 15000);
      const sz = Number(s.size) || 1;
      const enter = () => !reduce && n.animate([{ opacity: 0, transform: `translate(-50%, -30%) scale(${sz})` }, { opacity: 1, transform: `translate(-50%, -50%) scale(${sz})` }], { duration: 600, easing: "cubic-bezier(.2,.8,.2,1)" });
      enter();
      return { sync(nst, nlive) { if ((nlive.next?.whenText || "") !== (nx?.whenText || "") || (nlive.next?.game || "") !== (nx?.game || "")) return "remount"; }, fire() { enter(); }, stop() { clearInterval(iv); } };
    };

    M.subathon = (layer, s, st) => {
      const n = document.createElement("div");
      n.className = box(s, "nx");
      n.innerHTML = `<div class="nx-label acc xt"></div><div class="nx-time xt"></div><div class="nx-line xt"></div>`;
      n.querySelector(".nx-label").textContent = s.label;
      n.querySelector(".nx-line").textContent = [Number(s.perFollow) ? `+${s.perFollow} min per follow` : "", `+${s.perSub} min per sub`, Number(s.cap) ? `max ${s.cap}h` : ""].filter(Boolean).join(" · ");
      layer.appendChild(n);
      const time = n.querySelector(".nx-time");
      let S = st, lastSec = null;
      const left = () => Math.max(0, S.running ? (Number(S.base) || 0) - (Date.now() - (Number(S.t0) || Date.now())) : Number(S.base) || 0);
      const iv = setInterval(() => {
        const ms = left(); time.textContent = fmtClock(ms); const sec = Math.ceil(ms / 1000);
        const urgent = s.finalFlash && S.running && sec <= 10 && sec > 0;
        time.classList.toggle("urgent", urgent);
        if (urgent && sec !== lastSec) { play(time, [{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 300, fill: "none" }); if (s.sound !== "off") sfx("tick"); }
        lastSec = sec;
      }, 200);
      return {
        sync(nst) { S = nst; },
        fire(t, d) {
          if (t !== "add") return;
          const mins = Math.round(Math.abs(d.ms) / 60000), neg = d.ms < 0;
          const dd = document.createElement("div"); dd.className = "nx-delta"; dd.style.color = neg ? "var(--down)" : "";
          dd.textContent = `${neg ? "−" : "+"}${mins >= 60 ? fmtClock(Math.abs(d.ms), true) : mins + ":00"} ${{ follow: "💜", sub: "⭐", gift: "🎁" }[d.type] || ""}`;
          n.appendChild(dd);
          gone(play(dd, [{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "scale(1.2)", offset: 0.2 }, { opacity: 1, transform: "scale(1)", offset: 0.35 }, { opacity: 1, offset: 0.7 }, { opacity: 0, transform: "translateY(-80%)" }], { duration: 2000, easing: "ease-out" }), dd);
          if (!neg) play(time, [{ transform: "scale(1)", color: "var(--up)" }, { transform: "scale(1.15)", color: "var(--up)" }, { transform: "scale(1)" }], { duration: 600, fill: "none" });
          sfx(s.sound);
        },
        stop() { clearInterval(iv); },
      };
    };

    M.cam = (layer, s) => {
      const c = document.createElement("div");
      c.className = "cam " + s.style;
      c.style.setProperty("--th", `calc(var(--u) * ${s.thick})`);
      c.innerHTML = `${root.dataset.preview ? '<div class="cam-feed"><span>🧑‍💻</span></div>' : ""}${s.style === "hud" ? '<div class="cam-scan"></div>' : ""}<div class="cam-fr"></div>`;
      if (s.showTag) { const t = document.createElement("div"); t.className = `cam-tag ${s.tagPos} xt ` + box(s); t.innerHTML = (s.liveDot ? '<span class="cam-live"></span>' : "") + "<span></span>"; t.lastElementChild.textContent = s.name; c.appendChild(t); }
      layer.appendChild(c);
      let raf = 0, ang = 0;
      if (s.style === "rainbow" && !reduce) { const spin = () => { ang = (ang + 1.2) % 360; c.style.setProperty("--ang", ang + "deg"); raf = requestAnimationFrame(spin); }; spin(); }
      return { fire() { c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }, stop() { cancelAnimationFrame(raf); } };
    };

    M.clip = (layer, s) => ({
      fire(t, d) {
        if (t !== "clip") return;
        const big = !!d.big;
        sfx(s.sound);
        if (s.show === "hidden") return;
        if (s.show !== "badge") { const f = document.createElement("div"); f.className = "clip-flash" + (big ? " big" : ""); layer.appendChild(f); gone(play(f, [{ opacity: 1 }, { opacity: 0 }], { duration: 700, easing: "ease-out" }), f); }
        if (s.show !== "flash") {
          const b = document.createElement("div");
          b.className = `clip-badge ${s.spot} xt ` + box(s);
          b.textContent = (big ? "⭐ " : "📌 ") + (big ? s.bigWords : s.words);
          layer.appendChild(b);
          gone(play(b, [{ opacity: 0, transform: "scale(.4) rotate(-8deg)" }, { opacity: 1, transform: "scale(1.15) rotate(3deg)", offset: 0.15 }, { opacity: 1, transform: "scale(1)", offset: 0.25 }, { opacity: 1, offset: 0.85 }, { opacity: 0, transform: "scale(.9)" }], { duration: 2600, easing: "ease-out" }), b);
        }
      },
      stop() {},
    });

    M.cmds = (layer, s) => {
      const w = document.createElement("div");
      w.className = `cm ${s.spot} ` + box(s);
      w.innerHTML = `<div class="cm-label acc xt"></div><div class="cm-tip xt"></div>`;
      w.querySelector(".cm-label").textContent = s.label;
      layer.appendChild(w);
      const tipEl = w.querySelector(".cm-tip");
      const tips = [s.tip1, s.tip2, s.tip3, s.tip4].filter((x) => x && String(x).trim());
      w.style.visibility = tips.length ? "" : "hidden";
      const fmt = (t) => { const m = t.match(/^(!\S+)\s*[—-]?\s*(.*)$/); return m ? `<b class="acc">${esc(m[1])}</b> <span>${esc(m[2])}</span>` : esc(t); };
      let i = 0, paused = false, typing = 0;
      function show(animate) {
        if (!tips.length) return;
        const t = tips[i % tips.length];
        clearInterval(typing);
        if (!animate || reduce) { tipEl.innerHTML = fmt(t); return; }
        if (s.trans === "type") { let k = 0; tipEl.textContent = ""; typing = setInterval(() => { k++; tipEl.innerHTML = fmt(t.slice(0, k)) + '<span class="caret">▌</span>'; if (k >= t.length) { clearInterval(typing); tipEl.innerHTML = fmt(t); } }, 40); return; }
        const out = s.trans === "flip" ? [{ transform: "perspective(600px) rotateX(0)" }, { transform: "perspective(600px) rotateX(90deg)" }] : [{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(-30%)", opacity: 0 }];
        const inn = s.trans === "flip" ? [{ transform: "perspective(600px) rotateX(-90deg)" }, { transform: "perspective(600px) rotateX(0)" }] : [{ transform: "translateX(30%)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }];
        tipEl.animate(out, { duration: 220, easing: "ease-in" }).finished.then(() => { tipEl.innerHTML = fmt(t); tipEl.animate(inn, { duration: 260, easing: "ease-out" }); }).catch(() => null);
      }
      show(false);
      const iv = setInterval(() => { if (!paused) { i++; show(true); } }, (Number(s.every) || 8) * 1000);
      return {
        fire(t) { if (t === "pause") { paused = !paused; play(w, [{ opacity: paused ? 1 : 0.5 }, { opacity: paused ? 0.5 : 1 }], { duration: 200 }); return; } i++; show(true); },
        stop() { clearInterval(iv); clearInterval(typing); },
      };
    };

    M.qr = (layer, s) => {
      const q = document.createElement("div");
      q.className = `qr ${s.spot} ` + box(s);
      if (s.idle === "float") q.classList.add("bob"); if (s.idle === "pulse") q.classList.add("pulse");
      q.innerHTML = `<div class="qr-label acc xt"></div><div class="qr-code"></div><div class="qr-cap xt"></div>`;
      q.querySelector(".qr-label").textContent = s.label; q.querySelector(".qr-cap").textContent = s.caption;
      if (s.idle === "glow") q.querySelector(".qr-label").classList.add("glowtxt");
      layer.appendChild(q);
      try { new window.QRCode(q.querySelector(".qr-code"), { text: s.link || " ", width: 512, height: 512, colorDark: s.qrColor === "accent" ? s.color : "#000000", colorLight: "#ffffff", correctLevel: window.QRCode.CorrectLevel.M }); } catch { q.querySelector(".qr-code").textContent = "QR"; }
      const sz = Number(s.size) || 1;
      let iv = 0, hideT = 0;
      const showIt = () => { q.hidden = false; if (!reduce) q.animate([{ opacity: 0, transform: `scale(${sz * 0.6})` }, { opacity: 1, transform: `scale(${sz * 1.06})`, offset: 0.7 }, { opacity: 1, transform: `scale(${sz})` }], { duration: 500, easing: "ease-out" }); if (Number(s.when)) { clearTimeout(hideT); hideT = setTimeout(() => (q.hidden = true), 20000); } };
      if (Number(s.when)) { q.hidden = true; iv = setInterval(showIt, s.when * 60000); }
      return { fire() { showIt(); }, stop() { clearInterval(iv); clearTimeout(hideT); } };
    };

    M.squad = (layer, s, st, live) => {
      const w = document.createElement("div");
      w.className = `sq ${s.side} ${s.layout} ` + box(s);
      w.innerHTML = `<div class="sq-label acc xt"></div><div class="sq-list"></div>`;
      layer.appendChild(w);
      const list = w.querySelector(".sq-list");
      let people = [];
      function draw(next) {
        const had = new Set(people.map((p) => p.name));
        people = next || [];
        w.style.visibility = people.length ? "" : "hidden";
        w.querySelector(".sq-label").textContent = `${s.label} · ${people.length}`;
        list.innerHTML = "";
        let joined = false;
        for (const p of people) {
          const r = document.createElement("div"); r.className = "sq-p";
          const av = p.avatar ? `<span class="sq-av" style="background:#222 url('${esc(p.avatar)}') center/cover"></span>` : `<span class="sq-av" style="background:${colorOf(p.name)}">${esc(p.name[0]?.toUpperCase() || "?")}</span>`;
          r.innerHTML = `${av}${s.showNames ? '<span class="sq-n xt"></span>' : ""}${p.muted ? '<span class="sq-mute">🔇</span>' : ""}`;
          if (s.showNames) r.querySelector(".sq-n").textContent = p.name;
          list.appendChild(r);
          if (had.size && !had.has(p.name)) { joined = true; if (!reduce) r.animate([{ opacity: 0, transform: "scale(.5)" }, { opacity: 1, transform: "scale(1.1)", offset: 0.7 }, { opacity: 1, transform: "none" }], { duration: 450 }); }
        }
        if (joined) sfx(s.sound);
      }
      draw(live.people);
      return { sync(nst, nlive) { if (JSON.stringify(nlive.people || []) !== JSON.stringify(people)) draw(nlive.people); }, stop() {} };
    };

    M.poll = (layer, s, st) => {
      const p = document.createElement("div");
      p.className = "pl " + box(s);
      const opts = [s.o1, s.o2, s.o3, s.o4].map((x, i) => [x, i]).filter(([x]) => x && String(x).trim());
      p.innerHTML = `<div class="pl-q xt"></div><div class="pl-opts"></div><div class="pl-foot xt"><span class="pl-how"></span><span class="pl-time acc"></span></div>`;
      p.querySelector(".pl-q").textContent = "📊 " + s.question;
      p.querySelector(".pl-how").textContent = s.how;
      const COLS = ["#22d3ee", "#f472b6", "#facc15", "#4ade80"];
      for (const [label, i] of opts) {
        const r = document.createElement("div"); r.className = "pl-o"; r.dataset.i = i;
        r.innerHTML = `<div class="pl-fill ${s.bars}" style="background-color:${COLS[i]}"></div><span class="pl-n xt">${i + 1}</span><span class="pl-l xt"></span><span class="pl-pct xt"></span>`;
        r.querySelector(".pl-l").textContent = label;
        p.querySelector(".pl-opts").appendChild(r);
      }
      layer.appendChild(p);
      let S = st;
      function paint() {
        p.style.visibility = S.open || S.ended ? "" : "hidden";
        const votes = S.votes || [0, 0, 0, 0];
        const total = opts.reduce((a, [, i]) => a + (votes[i] || 0), 0) || 1;
        const best = Math.max(...opts.map(([, i]) => votes[i] || 0));
        for (const r of p.querySelectorAll(".pl-o")) {
          const i = Number(r.dataset.i), v = votes[i] || 0, pct = Math.round((v / total) * 100);
          r.querySelector(".pl-fill").style.width = pct + "%";
          r.querySelector(".pl-pct").textContent = `${pct}% · ${v}`;
          r.classList.toggle("win", !!S.ended && v === best && best > 0);
        }
        const left = Number(s.len) ? Math.max(0, Number(s.len) - (Date.now() - (Number(S.t0) || Date.now()))) : null;
        p.querySelector(".pl-time").textContent = S.ended ? "🏁 Poll closed" : left === null ? "⏱ Open" : `⏱ ${fmtClock(left)}`;
      }
      paint();
      const iv = setInterval(paint, 250);
      return {
        sync(nst) { S = nst; paint(); },
        fire(t) {
          if (t === "start") return "remount";
          if (t === "end") { paint(); sfx(s.sound); const w = p.querySelector(".pl-o.win"); if (w) { const [x, y] = centerOf(w); burst(layer, x, y, ["🎉", "✨", "⭐"], 18, 280); } }
        },
        stop() { clearInterval(iv); },
      };
    };

    M.wheel = (layer, s) => {
      const slices = [s.s1, s.s2, s.s3, s.s4, s.s5, s.s6, s.s7, s.s8].map((x) => String(x || "").trim()).filter(Boolean);
      const w = document.createElement("div");
      w.className = "wh";
      w.innerHTML = `<div class="wh-label acc xt"></div><div class="wh-wrap"><canvas class="wh-c" width="900" height="900"></canvas><div class="wh-ptr"></div><div class="wh-hub"></div></div><div class="wh-res xt ${box(s)}" hidden></div>`;
      w.querySelector(".wh-label").textContent = s.label;
      layer.appendChild(w);
      const cv = w.querySelector(".wh-c"), ctx = cv.getContext("2d"), n = Math.max(1, slices.length), seg = (Math.PI * 2) / n;
      const pal = { rainbow: PAL, accent: [s.color, "#1b1d22", s.color, "#2c2f36"], casino: ["#b91c1c", "#111111"] }[s.scheme] || PAL;
      const fontFam = (FONTS[s.font] || FONTS.lilita).split(",")[0].replace(/"/g, "");
      let angle = 0, spinning = false;
      function drawWheel() {
        ctx.clearRect(0, 0, 900, 900);
        ctx.save(); ctx.translate(450, 450); ctx.rotate(angle);
        slices.forEach((t, i) => {
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 430, i * seg, (i + 1) * seg); ctx.closePath();
          ctx.fillStyle = pal[i % pal.length]; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = "#0b0b0d"; ctx.stroke();
          ctx.save(); ctx.rotate(i * seg + seg / 2); ctx.textAlign = "right"; ctx.textBaseline = "middle";
          const dark = ["#facc15", "#4ade80", "#22d3ee", "#f9c933", "#ffffff"].includes(pal[i % pal.length]);
          ctx.font = `${Math.max(26, Math.min(46, 520 / Math.max(8, t.length)))}px "${fontFam}", sans-serif`;
          ctx.lineWidth = 8; ctx.strokeStyle = dark ? "rgba(255,255,255,.6)" : "#000"; ctx.strokeText(t, 400, 0);
          ctx.fillStyle = dark ? "#111" : "#fff"; ctx.fillText(t, 400, 0); ctx.restore();
        });
        ctx.restore();
        ctx.beginPath(); ctx.arc(450, 450, 436, 0, Math.PI * 2); ctx.lineWidth = 14; ctx.strokeStyle = "#0b0b0d"; ctx.stroke();
      }
      document.fonts.ready.then(drawWheel); drawWheel();
      const res = w.querySelector(".wh-res");
      const idxAt = (a) => { const top = (((-Math.PI / 2 - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); return Math.floor(top / seg); };
      return {
        fire(t, d) {
          if (t !== "spin" || spinning || !slices.length) return;
          spinning = true; res.hidden = true;
          const index = Math.max(0, Math.min(slices.length - 1, Number(d.index) || 0));
          // Land with the chosen slice under the pointer (the server picked it).
          const topWanted = index * seg + seg * (0.2 + Math.random() * 0.6);
          const aWanted = -Math.PI / 2 - topWanted, full = Math.PI * 2;
          const start = angle, extra = (((aWanted - start) % full) + full) % full, target = start + full * 6 + extra;
          const dur = reduce ? 10 : 4200, t0 = performance.now();
          let lastIdx = -1;
          const step = (now) => {
            const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
            angle = start + (target - start) * e; drawWheel();
            const idx = idxAt(angle); if (idx !== lastIdx) { lastIdx = idx; if (s.sound === "tick") sfx("tick"); play(w.querySelector(".wh-ptr"), [{ transform: "translateX(-50%) rotate(0)" }, { transform: "translateX(-50%) rotate(-18deg)" }, { transform: "translateX(-50%) rotate(0)" }], { duration: 120, fill: "none" }); }
            if (p < 1) requestAnimationFrame(step);
            else {
              spinning = false;
              res.textContent = "🎯 " + slices[index]; res.hidden = false;
              play(res, [{ opacity: 0, transform: "translate(-50%, -50%) scale(.4)" }, { opacity: 1, transform: "translate(-50%, -50%) scale(1.15)", offset: 0.6 }, { opacity: 1, transform: "translate(-50%, -50%) scale(1)" }], { duration: 500 });
              sfx(s.sound === "tick" ? "fanfare" : s.sound); confetti(layer, 30);
              setTimeout(() => (res.hidden = true), 8000);
            }
          };
          requestAnimationFrame(step);
        },
        stop() {},
      };
    };

    M.dice = (layer, s) => {
      const w = document.createElement("div"); w.className = "dc"; layer.appendChild(w);
      const res = document.createElement("div"); res.className = "dc-res xt " + box(s); res.hidden = true; layer.appendChild(res);
      const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
      const face = (n) => `<div class="dc-face f${n}">${Array.from({ length: 9 }, (_, i) => `<i${PIPS[n].includes(i + 1) ? ' class="on"' : ""}></i>`).join("")}</div>`;
      const ROT = { 1: "rotateX(0deg) rotateY(0deg)", 2: "rotateY(-90deg)", 3: "rotateX(-90deg)", 4: "rotateX(90deg)", 5: "rotateY(90deg)", 6: "rotateY(180deg)" };
      let busy = false, hideT = 0;
      const showRes = (txt) => { res.textContent = txt; res.hidden = false; play(res, [{ opacity: 0, transform: "translateX(-50%) scale(.4)" }, { opacity: 1, transform: "translateX(-50%) scale(1.15)", offset: 0.6 }, { opacity: 1, transform: "translateX(-50%) scale(1)" }], { duration: 450 }); clearTimeout(hideT); hideT = setTimeout(() => { res.hidden = true; w.innerHTML = ""; }, 9000); };
      return {
        fire(t, d) {
          if (busy) return; busy = true; res.hidden = true; w.innerHTML = "";
          if (t === "roll") {
            const nums = (d.nums || [1]).map((x) => Math.max(1, Math.min(6, Number(x) || 1)));
            nums.forEach((n, i) => {
              const el = document.createElement("div"); el.className = `dc-die ${s.dieColor}`;
              el.innerHTML = `<div class="dc-cube">${[1, 2, 3, 4, 5, 6].map(face).join("")}</div>`;
              w.appendChild(el);
              const cube = el.querySelector(".dc-cube"), spins = `rotateX(${720 + Math.floor(Math.random() * 3) * 360}deg) rotateY(${720 + Math.floor(Math.random() * 3) * 360}deg) `;
              if (!reduce) el.animate([{ transform: "translateY(-160%) rotate(-30deg)" }, { transform: "translateY(10%) rotate(10deg)", offset: 0.7 }, { transform: "none" }], { duration: 1100, delay: i * 120, easing: "cubic-bezier(.3,.6,.3,1)", fill: "backwards" });
              cube.animate([{ transform: "rotateX(0) rotateY(0)" }, { transform: spins + ROT[n] }], { duration: reduce ? 1 : 1200, delay: i * 120, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" });
            });
            if (s.sound !== "off") for (let i = 0; i < 5; i++) setTimeout(() => sfx("pop"), i * 120);
            setTimeout(() => { busy = false; const total = nums.reduce((a, b) => a + b, 0); showRes(nums.length > 1 ? `🎲 ${nums.join(" + ")} = ${total}` : `🎲 ${total}`); sfx(s.sound === "pop" ? "ding" : s.sound); }, 1500);
          } else if (t === "flip") {
            const heads = !!d.heads;
            const c = document.createElement("div"); c.className = "dc-coin";
            c.innerHTML = `<div class="dc-side h">👑</div><div class="dc-side t">⚔️</div>`;
            w.appendChild(c);
            const turns = 6 + Math.floor(Math.random() * 3);
            c.animate([{ transform: "translateY(0) rotateY(0)" }, { transform: `translateY(-55%) rotateY(${turns * 180 + 90}deg)`, offset: 0.5 }, { transform: `translateY(0) rotateY(${(turns * 2 + (heads ? 0 : 1)) * 180}deg)` }], { duration: reduce ? 1 : 1400, easing: "cubic-bezier(.3,.5,.4,1)", fill: "forwards" });
            sfx(s.sound === "off" ? "off" : "coin");
            setTimeout(() => { busy = false; showRes(`🪙 ${heads ? s.heads : s.tails}!`); sfx(s.sound === "coin" ? "ding" : s.sound); }, 1500);
          } else busy = false;
        },
        stop() { clearTimeout(hideT); },
      };
    };

    M.predict = (layer, s, st) => {
      const p = document.createElement("div");
      p.className = "pr " + box(s);
      p.innerHTML = `<div class="pr-q xt"></div><div class="pr-sides"><div class="pr-side a"><div class="pr-name xt"></div><div class="pr-coins xt"></div><div class="pr-sub xt"></div></div><div class="pr-vs xt">VS</div><div class="pr-side b"><div class="pr-name xt"></div><div class="pr-coins xt"></div><div class="pr-sub xt"></div></div></div><div class="pr-bar"><div class="pr-ya"></div></div><div class="pr-foot xt"></div>`;
      p.style.setProperty("--ya", s.yesColor); p.style.setProperty("--nb", s.noColor);
      p.querySelector(".pr-q").textContent = "🔮 " + s.question;
      p.querySelector(".a .pr-name").textContent = s.yes; p.querySelector(".b .pr-name").textContent = s.no;
      layer.appendChild(p);
      let S = st;
      function paint() {
        p.style.visibility = S.phase && S.phase !== "idle" ? "" : "hidden";
        const [a, b] = S.pool || [0, 0], tot = a + b || 1, bt = S.bettors || [0, 0];
        let phase = S.phase;
        const left = Number(s.len) ? Math.max(0, Number(s.len) - (Date.now() - (Number(S.t0) || Date.now()))) : null;
        if (phase === "open" && left === 0) phase = "locked";
        p.querySelector(".a .pr-coins").textContent = `🪙 ${a.toLocaleString()}`; p.querySelector(".b .pr-coins").textContent = `🪙 ${b.toLocaleString()}`;
        p.querySelector(".a .pr-sub").textContent = `${Math.round((a / tot) * 100)}% · ${bt[0]} bets`; p.querySelector(".b .pr-sub").textContent = `${Math.round((b / tot) * 100)}% · ${bt[1]} bets`;
        p.querySelector(".pr-ya").style.width = (a + b ? (a / tot) * 100 : 50) + "%";
        const top = S.top && S.top[0] ? ` · Biggest bet: ${S.top[0]} 🪙 ${S.top[1]}` : "";
        p.querySelector(".pr-foot").textContent = phase === "open" ? `Type !bet ${String(s.yes).toLowerCase()} 100 or !bet ${String(s.no).toLowerCase()} 50${left === null ? "" : " · " + fmtClock(left)}${top}` : phase === "locked" ? "🔒 Bets locked — good luck!" : phase === "done" ? `🏆 ${S.winner === 0 ? s.yes : s.no} won! 🪙 ${(a + b).toLocaleString()} paid out` : "";
        p.querySelector(".a").classList.toggle("won", phase === "done" && S.winner === 0);
        p.querySelector(".b").classList.toggle("won", phase === "done" && S.winner === 1);
        p.querySelector(".a").classList.toggle("lost", phase === "done" && S.winner === 1);
        p.querySelector(".b").classList.toggle("lost", phase === "done" && S.winner === 0);
      }
      paint();
      const iv = setInterval(paint, 250);
      return {
        sync(nst) { S = nst; paint(); },
        fire(t, d) {
          if (t === "open") return "remount";
          if (t !== "settle") return;
          paint(); sfx(s.sound);
          const [x, y] = centerOf(p.querySelector(Number(d.side) === 1 ? ".b" : ".a"));
          burst(layer, x, y, ["🪙", "✨", "💰"], 22, 320);
        },
        stop() { clearInterval(iv); },
      };
    };

    M.welcome = (layer, s) => {
      const stack = document.createElement("div"); stack.className = `wl ${s.spot}`; layer.appendChild(stack);
      return {
        fire(t, d) {
          if (t !== "welcome") return;
          const el = document.createElement("div"); el.className = "wl-msg xt " + box(s);
          el.innerHTML = `<span class="wl-wave">${d.back ? "🔁" : "👋"}</span><span></span>`;
          el.lastElementChild.textContent = String(d.back ? s.backWords : s.words).replace("{name}", d.name || "friend");
          stack.appendChild(el);
          const fromX = String(s.spot).endsWith("l") ? "-120%" : "120%";
          const A = { slide: [{ opacity: 0, transform: `translateX(${fromX})` }, { opacity: 1, transform: "translateX(4%)", offset: 0.7 }, { opacity: 1, transform: "none" }], pop: [{ opacity: 0, transform: "scale(.3)" }, { opacity: 1, transform: "scale(1.1)", offset: 0.7 }, { opacity: 1, transform: "none" }], bounce: [{ opacity: 0, transform: "translateY(-120%)" }, { opacity: 1, transform: "translateY(10%)", offset: 0.6 }, { opacity: 1, transform: "translateY(-4%)", offset: 0.8 }, { opacity: 1, transform: "none" }], wave: [{ opacity: 0, transform: "rotate(-8deg) scale(.6)" }, { opacity: 1, transform: "rotate(4deg) scale(1.05)", offset: 0.6 }, { opacity: 1, transform: "none" }] }[s.anim];
          if (!reduce && A) el.animate(A, { duration: 500, easing: "cubic-bezier(.2,.8,.2,1)" });
          play(el.querySelector(".wl-wave"), [{ transform: "rotate(0)" }, { transform: "rotate(25deg)" }, { transform: "rotate(-15deg)" }, { transform: "rotate(0)" }], { duration: 700, iterations: 2, fill: "none" });
          sfx(s.sound);
          setTimeout(() => gone(el.animate([{ opacity: 1 }, { opacity: 0, transform: `translateX(${fromX})` }], { duration: 400, fill: "forwards" }), el), (Number(s.hold) || 5) * 1000);
        },
        stop() {},
      };
    };

    // ================= Keeping it in step =================
    let S = {}, ST = {}, LIVE = {}, api = null, layer = null, lastSeq = null, look = "";
    function applyLook() {
      root.style.setProperty("--acc", S.color || "#f9c933");
      root.style.setProperty("--font", FONTS[S.font] || FONTS.lilita);
      root.style.setProperty("--ow", String({ thick: 1, thin: 0.5, none: 0 }[S.outline] ?? 1));
      root.style.setProperty("--rad", `calc(var(--u) * ${{ round: 18, square: 4, pill: 60 }[S.corners] ?? 18})`);
      root.style.setProperty("--sz", String(Number(S.size) || 1));
      vol = Number(S.volume) || 0.6;
    }
    function remount(fromScene) {
      api?.stop?.();
      layer?.remove();
      layer = document.createElement("div");
      layer.className = "xl";
      root.appendChild(layer);
      applyLook();
      api = (M[kind] || M.clip)(layer, S, ST, LIVE, fromScene) || {};
    }
    function set(settings, state, live, events) {
      S = settings || S; LIVE = live || {};
      const nextLook = JSON.stringify(S);
      if (nextLook !== look || !api) { look = nextLook; ST = state || ST; remount(false); }
      else if (state) {
        ST = state;
        const r = api.sync ? api.sync(ST, LIVE) : null;
        if (r === "remount") remount(false);
        if (r === "remount-scene") remount(true);
      }
      const list = Array.isArray(events) ? events : [];
      const top = list.reduce((m, e) => Math.max(m, e.id), 0);
      if (lastSeq === null) { lastSeq = top; return; }
      for (const e of list) if (e.id > lastSeq) fire(e.type, e.data || {});
      lastSeq = Math.max(lastSeq, top);
    }
    function fire(type, data) {
      if (!api) return;
      const r = api.fire ? api.fire(type, data || {}) : null;
      if (r === "remount") remount(false);
    }
    return { set, fire, get kind() { return kind; } };
  }

  window.ToolsFX = { mount };
})();
