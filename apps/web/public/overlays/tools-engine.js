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
  const FONTS = { lilita: '"Lilita One", "Arial Black", sans-serif', bangers: '"Bangers", "Arial Black", sans-serif', russo: '"Russo One", "Arial Black", sans-serif', blackops: '"Black Ops One", "Arial Black", sans-serif', bebas: '"Bebas Neue", "Arial Narrow", sans-serif', luckiest: '"Luckiest Guy", "Arial Black", sans-serif', teko: '"Teko", "Arial Narrow", sans-serif', barlow: '"Barlow Condensed", "Arial Narrow", sans-serif', fredoka: '"Fredoka", "Arial Rounded MT Bold", sans-serif', marker: '"Permanent Marker", "Comic Sans MS", cursive' };
  // Canvas text needs the weight each font comes in.
  const FONT_W = { teko: 600, barlow: 700, fredoka: 600 };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rnd = () => Math.random() * 2 - 1;
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmtClock = (ms, up) => { const t = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; };
  const play = (el, frames, o) => el.animate(frames, { fill: "forwards", ...o });
  const gone = (a, el) => a.finished.then(() => el.remove()).catch(() => el.remove());
  const box = (s, extra = "") => `xb look-${s.look} ${extra}`;
  // Where a chat message was typed: small platform marks for the Chat box.
  const PLAT = {
    kick: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#53fc18"/><path d="M9 7h5v7l5-7h5l-6 9 6 9h-5l-5-7v7H9z" fill="#0b0b0b"/></svg>',
    twitch: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#9146ff"/><path fill-rule="evenodd" d="M9 6 7 10v15h5v3h3l3-3h4l5-5V6zm16 13-3 3h-5l-3 3v-3h-4V8h15z" fill="#fff"/><path d="M19 11h2v6h-2zm-5 0h2v6h-2z" fill="#fff"/></svg>',
    youtube: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#ff0033"/><path d="M13 10.5v11l9-5.5z" fill="#fff"/></svg>',
    tiktok: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#111"/><path d="M18 7h3.2c.3 2.4 1.8 3.9 4.1 4.1v3.3c-1.6 0-3-.5-4.1-1.3v6.6a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v3.4a2.3 2.3 0 1 0 1.5 2.1z" fill="#25f4ee" transform="translate(-.8 -.6)"/><path d="M18 7h3.2c.3 2.4 1.8 3.9 4.1 4.1v3.3c-1.6 0-3-.5-4.1-1.3v6.6a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v3.4a2.3 2.3 0 1 0 1.5 2.1z" fill="#fe2c55" transform="translate(.8 .6)"/><path d="M18 7h3.2c.3 2.4 1.8 3.9 4.1 4.1v3.3c-1.6 0-3-.5-4.1-1.3v6.6a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v3.4a2.3 2.3 0 1 0 1.5 2.1z" fill="#fff"/></svg>',
    discord: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#5865f2"/><path d="M23 10.5a14 14 0 0 0-3.5-1.1l-.4.9a13 13 0 0 0-6.2 0l-.4-.9A14 14 0 0 0 9 10.5c-2.2 3.3-2.8 6.5-2.5 9.7a14 14 0 0 0 4.3 2.2l.9-1.5-1.4-.7.3-.3a10 10 0 0 0 8.8 0l.3.3-1.4.7.9 1.5a14 14 0 0 0 4.3-2.2c.4-3.7-.6-6.9-2.5-9.7zM12.9 18.3c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.6 1.7-1.5 1.7zm6.2 0c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7z" fill="#fff"/></svg>',
  };

  // ---- Apps on this PC (Command alerts) ----
  const appLabel = (app, v) => ({ lumia: `Lumia › run command "${v}"`, "lumia-alert": `Lumia › play alert "${v}"`, sbot: `Streamer.bot › run action "${v}"`, "obs-scene": `OBS › switch to scene "${v}"`, "obs-src": `OBS › show "${v}" for 5 seconds` })[app] || app;

  async function lumia(H, type, value, note) {
    const token = H.get("lumia");
    if (!token) return note("Lumia: paste your Lumia token on the Chat Commands page, then copy the OBS link again.");
    const url = `http://localhost:${Number(H.get("lumiaport")) || 39231}/api/send?token=${encodeURIComponent(token)}`;
    const body = JSON.stringify({ type, params: { value } });
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      note(r.ok ? `Lumia: sent "${value}"` : `Lumia said ${r.status}`);
    } catch {
      // Lumia may not allow other pages to read its answer: send it anyway.
      fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body }).then(() => note(`Lumia: sent "${value}"`)).catch(() => note("Lumia: couldn't reach it. Is Lumia Stream open?"));
    }
  }

  // Streamer.bot's WebSocket server (Servers › WebSocket Server › start it).
  let sb = null, sbQueue = [];
  function streamerbot(H, name, args, note) {
    const send = (ws, n = name, a = args) => ws.send(JSON.stringify({ request: "DoAction", id: String(Date.now()) + Math.random(), action: { name: n }, args: a }));
    if (sb && sb.readyState === 1) { send(sb); note(`Streamer.bot: ran "${name}"`); return; }
    sbQueue.push([name, args]);
    if (sb && sb.readyState === 0) return;
    try { sb = new WebSocket(`ws://127.0.0.1:${Number(H.get("sbport")) || 8080}/`); } catch { return note("Streamer.bot: couldn't reach it."); }
    sb.onopen = () => { for (const [n, a] of sbQueue.splice(0)) { send(sb, n, a); note(`Streamer.bot: ran "${n}"`); } };
    sb.onerror = () => { sbQueue = []; note("Streamer.bot: couldn't reach it. Start its WebSocket Server."); };
    sb.onclose = () => { sb = null; };
  }

  // OBS's own WebSocket (Tools › WebSocket Server Settings), version 5.
  let obs = null, obsReady = null, obsWait = new Map(), obsN = 0;
  const b64sha = async (t) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))));
  function obsConnect(H) {
    if (obsReady) return obsReady;
    obsReady = new Promise((ok, bad) => {
      let ws;
      try { ws = new WebSocket(`ws://127.0.0.1:${Number(H.get("obsport")) || 4455}`); } catch (e) { obsReady = null; return bad(e); }
      ws.onmessage = async (ev) => {
        const m = JSON.parse(ev.data);
        if (m.op === 0) {
          const id = { op: 1, d: { rpcVersion: 1 } };
          if (m.d.authentication) {
            const pw = H.get("obs") || "";
            id.d.authentication = await b64sha((await b64sha(pw + m.d.authentication.salt)) + m.d.authentication.challenge);
          }
          ws.send(JSON.stringify(id));
        } else if (m.op === 2) { obs = ws; ok(ws); }
        else if (m.op === 7) { const w = obsWait.get(m.d.requestId); if (w) { obsWait.delete(m.d.requestId); w(m.d); } }
      };
      ws.onclose = (ev) => { obs = null; obsReady = null; bad(new Error(ev.code === 4009 ? "wrong password" : "closed")); };
      ws.onerror = () => {};
    });
    return obsReady;
  }
  async function obsCall(H, requestType, requestData) {
    const ws = await obsConnect(H);
    const requestId = "r" + ++obsN;
    return new Promise((ok) => { obsWait.set(requestId, ok); ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } })); setTimeout(() => ok({ requestStatus: { result: false } }), 4000); });
  }
  async function obsDo(H, d, note) {
    try {
      if (d.app === "obs-scene") {
        // A browser source with "Advanced access" can switch scenes with no password.
        if (!H.get("obs") && window.obsstudio && window.obsstudio.setCurrentScene) { window.obsstudio.setCurrentScene(d.appv); return note(`OBS: switched to "${d.appv}"`); }
        const r = await obsCall(H, "SetCurrentProgramScene", { sceneName: d.appv });
        return note(r.requestStatus?.result ? `OBS: switched to "${d.appv}"` : `OBS: no scene called "${d.appv}"`);
      }
      const scene = (await obsCall(H, "GetCurrentProgramScene", {})).responseData?.currentProgramSceneName;
      const item = (await obsCall(H, "GetSceneItemId", { sceneName: scene, sourceName: d.appv })).responseData?.sceneItemId;
      if (item == null) return note(`OBS: "${d.appv}" isn't in the scene "${scene}"`);
      await obsCall(H, "SetSceneItemEnabled", { sceneName: scene, sceneItemId: item, sceneItemEnabled: true });
      note(`OBS: showing "${d.appv}"`);
      setTimeout(() => obsCall(H, "SetSceneItemEnabled", { sceneName: scene, sceneItemId: item, sceneItemEnabled: false }).catch(() => null), 5000);
    } catch (e) {
      note(`OBS: couldn't connect (${e && e.message === "wrong password" ? "wrong password" : "turn on its WebSocket server"}).`);
    }
  }
  function sendToApp(d, H, note) {
    const v = String(d.appv || d.cmd || "").trim();
    if (!v) return;
    if (d.app === "lumia") lumia(H, "chat-command", v, note);
    else if (d.app === "lumia-alert") lumia(H, "alert", v, note);
    else if (d.app === "sbot") streamerbot(H, v, { user: d.user || "", command: d.cmd || "" }, note);
    else if (d.app === "obs-scene" || d.app === "obs-src") obsDo(H, { ...d, appv: v }, note);
  }

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
      levelup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, "triangle", 0.3)); },
      laser() { tone(1600, 0, 0.3, "sawtooth", 0.15, 140); },
      boo() { tone(392, 0, 0.35, "sawtooth", 0.12); tone(370, 0.38, 0.35, "sawtooth", 0.12); tone(349, 0.76, 0.9, "sawtooth", 0.12, 300); },
      buzzer() { tone(110, 0, 0.6, "square", 0.15); tone(116, 0, 0.6, "square", 0.12); },
      whoosh() { noise(0, 0.6, 0.5, "bandpass", 900); },
      drumroll() { for (let i = 0; i < 28; i++) noise(i * 0.045, 0.05, 0.3, "lowpass", 500); noise(1.3, 1.2, 0.4, "highpass", 4000); },
      applause() { for (let i = 0; i < 70; i++) noise(Math.random() * 1.8, 0.04, 0.18, "bandpass", 1500 + Math.random() * 2000); },
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
        if (s.platformIcons !== false && PLAT[m.platform]) { const p = document.createElement("span"); p.className = "ch-plat"; p.title = m.platform; p.innerHTML = PLAT[m.platform]; el.appendChild(p); }
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
      // The dashboard preview always shows it, so you can see what you're
      // changing; on stream it pops up on its timer.
      const timed = Number(s.when) > 0 && !root.dataset.preview;
      let iv = 0, hideT = 0;
      const showIt = () => { q.hidden = false; if (!reduce) q.animate([{ opacity: 0, transform: `scale(${sz * 0.6})` }, { opacity: 1, transform: `scale(${sz * 1.06})`, offset: 0.7 }, { opacity: 1, transform: `scale(${sz})` }], { duration: 500, easing: "ease-out" }); if (timed) { clearTimeout(hideT); hideT = setTimeout(() => (q.hidden = true), 20000); } };
      if (timed) { q.hidden = true; iv = setInterval(showIt, s.when * 60000); }
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

    // Spin wheel: drawn on a canvas. Pegs push the pointer aside as they pass
    // (with a tick each), it slows like a real wheel and rocks back a little.
    // Every color and part comes from the settings (packages/shared/tools.ts).
    const wheelKeep = { angle: 0 };
    M.wheel = (layer, s) => {
      const slices = Array.from({ length: 16 }, (_, i) => String(s[`s${i + 1}`] ?? "").trim()).filter(Boolean);
      const colors = String(s.colors || "#e5484d,#f5a524,#30a46c,#3e63dd").split(",").filter((c) => /^#[0-9a-f]{6}$/i.test(c));
      const w = document.createElement("div");
      w.className = "wh";
      w.innerHTML = `<div class="wh-label acc xt"></div><div class="wh-wrap"><canvas class="wh-c" width="1000" height="1000"></canvas><div class="wh-res xt ${box(s)}" hidden></div></div>`;
      const lab = w.querySelector(".wh-label");
      lab.textContent = s.label || ""; lab.hidden = !s.label;
      layer.appendChild(w);
      const cv = w.querySelector(".wh-c"), ctx = cv.getContext("2d"), res = w.querySelector(".wh-res");
      const S = 1000, C = 500, R_OUT = 470, n = Math.max(1, slices.length), seg = (Math.PI * 2) / n;
      const rim = Math.max(0, Math.min(60, Number(s.rimWidth) || 0)), R = R_OUT - rim;
      const P = { top: -Math.PI / 2, right: 0, bottom: Math.PI / 2, left: Math.PI }[s.pointerSide] ?? -Math.PI / 2;
      const neon = s.fill === "neon", hub = Math.max(0, Number(s.hubSize) || 0);
      const fontOf = (px) => `${FONT_W[s.font] || 400} ${px}px ${FONTS[s.font] || FONTS.lilita}`;
      const lum = (hex) => { const v = parseInt(String(hex).slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0); };
      const upper = (t) => (s.upper ? t.toUpperCase() : t);

      // The turning part and the still part are drawn once, then just rotated.
      const wedges = document.createElement("canvas"); wedges.width = wedges.height = S;
      const base = document.createElement("canvas"); base.width = base.height = S;
      function build() {
        const g = wedges.getContext("2d");
        g.clearRect(0, 0, S, S); g.save(); g.translate(C, C);
        slices.forEach((t, i) => {
          const col = colors[i % colors.length] || "#888888";
          g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, i * seg, (i + 1) * seg); g.closePath();
          g.fillStyle = neon ? (i % 2 ? "#131a28" : "#0c111c") : col; g.fill();
          if (neon) { g.save(); g.beginPath(); g.arc(0, 0, R - 12, i * seg + 0.03, (i + 1) * seg - 0.03); g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 20; g.stroke(); g.restore(); }
        });
        if (s.dividers) for (let i = 0; i < n; i++) {
          g.save(); g.rotate(i * seg); g.beginPath(); g.moveTo(0, 0); g.lineTo(R, 0);
          g.strokeStyle = s.dividerColor; g.lineWidth = Number(s.dividerWidth) || 4; if (neon) { g.shadowColor = s.dividerColor; g.shadowBlur = 10; } g.stroke(); g.restore();
        }
        const pad = s.pegs ? 40 : 26, room = R - pad - Math.max(hub, 30) - 24;
        slices.forEach((t, i) => {
          const col = colors[i % colors.length] || "#888888", txt = upper(t);
          let size = Math.min(64, 40 + 120 / n, 640 / Math.max(6, txt.length)) * (Number(s.textSize) || 100) / 100;
          g.save(); g.rotate(i * seg + seg / 2); g.font = fontOf(size);
          while (g.measureText(txt).width > room && size > 16) { size -= 2; g.font = fontOf(size); }
          g.textAlign = "right"; g.textBaseline = "middle";
          g.fillStyle = neon ? col : s.autoText ? (lum(col) > 0.45 ? "#15171b" : "#ffffff") : s.textColor;
          if (neon) { g.shadowColor = col; g.shadowBlur = 12; }
          g.fillText(txt, R - pad, s.font === "teko" ? 4 : 2); g.restore();
        });
        if (s.pegs) for (let i = 0; i < n; i++) { const a = i * seg; g.beginPath(); g.arc(Math.cos(a) * (R - 16), Math.sin(a) * (R - 16), 8, 0, Math.PI * 2); g.fillStyle = s.pegColor; g.fill(); }
        g.restore();
        const b = base.getContext("2d"); b.clearRect(0, 0, S, S);
        if (s.shadow) { b.save(); b.beginPath(); b.arc(C, C + 10, R_OUT, 0, Math.PI * 2); b.fillStyle = "rgba(0,0,0,.45)"; b.filter = "blur(14px)"; b.fill(); b.restore(); }
        if (rim > 0) { b.beginPath(); b.arc(C, C, R_OUT, 0, Math.PI * 2); b.fillStyle = s.rimColor; b.fill(); }
      }

      let angle = wheelKeep.angle, vel = 0, flap = 0, flapV = 0, spinning = false, winIdx = -1, winOn = false, lastPeg = null, anim = null, raf = 0, idleFrames = 0;
      function draw(now) {
        ctx.clearRect(0, 0, S, S);
        ctx.drawImage(base, 0, 0);
        ctx.save(); ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.clip();
        ctx.save(); ctx.translate(C, C); ctx.rotate(angle); ctx.drawImage(wedges, -C, -C); ctx.restore();
        if (Math.abs(vel) > 0.06 && !reduce) for (let k = 1; k <= 3; k++) { ctx.save(); ctx.globalAlpha = 0.2; ctx.translate(C, C); ctx.rotate(angle - (vel * k) / 3 * 0.9); ctx.drawImage(wedges, -C, -C); ctx.restore(); }
        if (winOn) {
          const pulse = 0.5 + 0.5 * Math.sin(now / 120);
          ctx.save(); ctx.translate(C, C); ctx.rotate(angle);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, winIdx * seg, (winIdx + 1) * seg); ctx.closePath();
          ctx.globalAlpha = 0.12 + 0.14 * pulse; ctx.fillStyle = s.winColor; ctx.fill();
          ctx.globalAlpha = 0.9; ctx.lineWidth = 8; ctx.strokeStyle = s.winColor; ctx.stroke(); ctx.restore();
        }
        ctx.restore();
        if (s.shine) {
          ctx.save(); ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.clip();
          const gl = ctx.createLinearGradient(C - 300, C - 420, C + 120, C + 160);
          gl.addColorStop(0, "rgba(255,255,255,.2)"); gl.addColorStop(0.45, "rgba(255,255,255,.04)"); gl.addColorStop(0.46, "rgba(255,255,255,0)");
          ctx.fillStyle = gl; ctx.fillRect(0, 0, S, S); ctx.restore();
        }
        if (s.lights && rim >= 12) {
          const count = 24, rB = R_OUT - rim / 2, sz = Math.max(3, Math.min(9, rim / 2 - 3));
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2, x = C + Math.cos(a) * rB, y = C + Math.sin(a) * rB;
            const on = winOn ? Math.floor(now / 160) % 2 === 0 : spinning ? (i + Math.floor(now / 70)) % 4 === 0 : (i + Math.floor(now / 600)) % 2 === 0;
            ctx.save(); ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fillStyle = s.lightsColor;
            if (on) { ctx.shadowColor = s.lightsColor; ctx.shadowBlur = 18; } else ctx.globalAlpha = 0.22;
            ctx.fill(); ctx.restore();
          }
        }
        if (hub > 0) {
          ctx.beginPath(); ctx.arc(C, C, hub, 0, Math.PI * 2); ctx.fillStyle = s.hubColor; ctx.fill();
          if (s.hubText) {
            const len = String(s.hubText).length, px = hub * (len === 1 ? 1.2 : len === 2 ? 0.9 : 0.65);
            ctx.save(); ctx.font = fontOf(px); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = s.hubTextColor;
            ctx.fillText(upper(String(s.hubText)), C, C + px * 0.08); ctx.restore();
          }
        }
        // The pointer, pushed aside by the pegs.
        const k = (Number(s.pointerSize) || 100) / 100;
        ctx.save(); ctx.translate(C, C); ctx.rotate(P + Math.PI / 2); ctx.translate(0, -(C - 12)); ctx.rotate(flap); ctx.scale(k, k);
        ctx.beginPath(); ctx.moveTo(-28, 4); ctx.lineTo(28, 4); ctx.lineTo(0, 96); ctx.closePath();
        ctx.lineJoin = "round"; ctx.lineWidth = 8; ctx.strokeStyle = s.pointerColor; ctx.stroke(); ctx.fillStyle = s.pointerColor; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 18, 8, 0, Math.PI * 2); ctx.fillStyle = lum(s.pointerColor) > 0.45 ? "#15171b" : "#ffffff"; ctx.fill();
        ctx.restore();
      }
      function pointer() {
        const Wd = 0.075, MAX = 0.55;
        let phi = (((angle - P) % seg) + seg) % seg; if (phi > seg / 2) phi -= seg;
        let target = 0;
        if (s.pegs) {
          if (vel >= 0 && phi > -Wd && phi <= 0) target = (-MAX * (phi + Wd)) / Wd;
          if (vel < 0 && phi < Wd && phi >= 0) target = (MAX * (Wd - phi)) / Wd;
        }
        const peg = Math.floor((angle - P) / seg);
        if (lastPeg !== null && peg !== lastPeg && spinning && s.sound === "tick") sfx("tick");
        lastPeg = peg;
        if ((vel >= 0 && target < flap) || (vel < 0 && target > flap)) { flap = target; flapV = 0; }
        else { flapV += (0 - flap) * 0.35; flapV *= 0.62; flap += flapV; }
      }
      function frame(now) {
        if (anim) anim(now); else vel *= 0.9;
        pointer();
        draw(now);
        // Keep going while something moves; otherwise rest (lights keep blinking).
        const moving = anim || winOn || Math.abs(flap) > 0.002 || Math.abs(vel) > 0.0005 || (s.lights && rim >= 12);
        idleFrames = moving ? 0 : idleFrames + 1;
        raf = idleFrames > 2 ? 0 : requestAnimationFrame(frame);
      }
      const wake = () => { idleFrames = 0; if (!raf) raf = requestAnimationFrame(frame); };
      build(); wake();
      document.fonts.ready.then(() => { build(); wake(); });
      let hideRes = 0, winOff = 0;
      return {
        fire(t, d) {
          if (t !== "spin" || spinning || !slices.length) return;
          clearTimeout(hideRes); clearTimeout(winOff);
          res.hidden = true; winOn = false; winIdx = -1; spinning = true;
          // Land with the slice the server picked under the pointer.
          const index = Math.max(0, Math.min(slices.length - 1, Number(d.index) || 0));
          const want = P - (index * seg + seg * (0.18 + Math.random() * 0.64)), full = Math.PI * 2, start = angle;
          const extra = (((want - start) % full) + full) % full, secs = Number(s.spinTime) || 7;
          const turns = reduce ? 0 : Math.max(3, Math.round(secs * 0.9)), settle = reduce ? 0 : Math.min(seg * 0.12, 0.05);
          const end = start + turns * full + extra, over = end + settle, dur = reduce ? 300 : secs * 1000, back = reduce ? 0 : 520, t0 = performance.now();
          anim = (now) => {
            const tt = now - t0, prev = angle;
            if (tt < dur) angle = start + (over - start) * (1 - Math.pow(1 - tt / dur, 3.4));
            else if (tt < dur + back) { const p = (tt - dur) / back; angle = over + (end - over) * p * p * (3 - 2 * p); }
            else {
              angle = end; anim = null; vel = 0; spinning = false;
              wheelKeep.angle = angle % full;
              winIdx = index; winOn = true;
              res.textContent = slices[index]; res.hidden = false;
              play(res, [{ opacity: 0, transform: "translate(-50%, -50%) scale(.4)" }, { opacity: 1, transform: "translate(-50%, -50%) scale(1.12)", offset: 0.6 }, { opacity: 1, transform: "translate(-50%, -50%) scale(1)" }], { duration: 500 });
              sfx(s.sound === "tick" ? "fanfare" : s.sound);
              winOff = setTimeout(() => { winOn = false; wake(); }, 6000);
              hideRes = setTimeout(() => (res.hidden = true), 8000);
              return;
            }
            vel = angle - prev;
          };
          wake();
        },
        stop() { cancelAnimationFrame(raf); raf = 0; clearTimeout(hideRes); clearTimeout(winOff); wheelKeep.angle = angle % (Math.PI * 2); },
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

    // Command alerts: chat commands' sounds and pop-ups, and the link to apps
    // on this PC. Passwords come from the part of the OBS link after #
    // (lumia=…&obs=…&obsport=4455&sbport=8080), which never leaves this PC.
    M.cmdfx = (layer, s) => {
      const wrap = document.createElement("div");
      wrap.className = s.spot === "tl" ? "cf-wrap tl" : `al-wrap ${s.spot === "top" ? "top" : s.spot === "bottom" ? "bottom" : "center"}`;
      layer.appendChild(wrap);
      const preview = root.dataset.preview === "1";
      const H = new URLSearchParams(location.hash.slice(1));
      const note = (t) => {
        if (!preview && !H.has("debug")) return;
        const n = document.createElement("div"); n.className = "cf-note"; n.textContent = t; layer.appendChild(n);
        setTimeout(() => n.remove(), 4000);
      };
      const queue = [];
      let busy = false;
      function popup(d) {
        const el = document.createElement("div");
        el.className = "al xt " + box(s);
        el.innerHTML = `<div class="al-icon"></div><div class="al-name"></div>`;
        el.firstElementChild.textContent = d.emoji || "✨";
        el.lastElementChild.textContent = d.text || "";
        el.lastElementChild.style.fontSize = `calc(var(--u) * ${String(d.text || "").length > 24 ? 64 : 96})`;
        wrap.replaceChildren(el);
        const A = {
          pop: [{ opacity: 0, transform: "scale(.2)" }, { opacity: 1, transform: "scale(1.08)", offset: 0.7 }, { opacity: 1, transform: "none" }],
          slide: [{ opacity: 0, transform: "translateX(-140%)" }, { opacity: 1, transform: "none" }],
          bounce: [{ opacity: 0, transform: "translateY(-260%)" }, { opacity: 1, transform: "translateY(8%)", offset: 0.55 }, { opacity: 1, transform: "translateY(-4%)", offset: 0.75 }, { opacity: 1, transform: "none" }],
          shake: [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1) rotate(-4deg)", offset: 0.3 }, { transform: "rotate(4deg)", offset: 0.5 }, { transform: "rotate(-3deg)", offset: 0.7 }, { opacity: 1, transform: "none" }],
          spin: [{ opacity: 0, transform: "rotate(-360deg) scale(.2)" }, { opacity: 1, transform: "none" }],
        }[d.style] || null;
        if (A && !reduce) el.animate(A, { duration: d.style === "shake" ? 700 : 550, easing: "cubic-bezier(.2,.8,.2,1)" });
        return new Promise((done) => setTimeout(() => {
          const out = el.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.9)" }], { duration: 350, fill: "forwards" });
          Promise.race([out.finished, new Promise((r) => setTimeout(r, 450))]).catch(() => null).then(() => { el.remove(); done(); });
        }, (Number(s.hold) || 3) * 1000));
      }
      async function next() {
        if (busy) return;
        busy = true;
        while (queue.length) await popup(queue.shift());
        busy = false;
      }
      function sound(d) {
        if (!s.sounds) return;
        if (d.soundUrl) { try { const a = new Audio(d.soundUrl); a.volume = Math.min(1, vol); a.play().catch(() => null); } catch {} return; }
        if (d.sound && d.sound !== "none") sfx(d.sound);
      }
      // More than one copy of this overlay in OBS (one per scene): only one
      // plays the sound and sends to the apps. OBS tells each copy whether
      // it's on stream right now; copies share this PC's storage.
      let onAir = true;
      addEventListener("obsSourceActiveChanged", (e) => { onAir = !!(e.detail && e.detail.active); });
      const g = new URLSearchParams(location.search).get("g") || "";
      function claim(id, what) {
        if (preview || id == null) return true;
        try {
          const k = `sp-cmdfx:${g}:${id}:${what}`;
          if (localStorage.getItem(k)) return false;
          localStorage.setItem(k, String(Date.now()));
          if (Math.random() < 0.05) for (let i = localStorage.length - 1; i >= 0; i--) { const key = localStorage.key(i); if (key && key.startsWith("sp-cmdfx:") && Date.now() - Number(localStorage.getItem(key)) > 600000) localStorage.removeItem(key); }
          return true;
        } catch { return true; }
      }
      return {
        fire(t, d) {
          if (t !== "fire") return;
          if (onAir && claim(d._id, "sound")) sound(d);
          if (s.popups && d.popup) { queue.push(d); if (queue.length > 5) queue.shift(); next(); }
          if (d.app && d.app !== "none") {
            if (preview) note(`Would send: ${appLabel(d.app, d.appv)}`);
            else if (s.apps && claim(d._id, "app")) sendToApp(d, H, note);
          }
        },
        stop() { queue.length = 0; },
      };
    };

    // AFK popups: !brb, !coffee… A card, banner or full-screen popup with a
    // countdown until !back clears it. state: { cur, t0, len }.
    M.afk = (layer, s, st) => {
      const preview = root.dataset.preview === "1";
      const hexA = (hex, a) => { const v = parseInt(String(hex || "#111418").slice(1), 16); return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`; };
      let list = [];
      try { list = JSON.parse(s.list || "[]"); } catch { list = []; }
      const w = document.createElement("div");
      const flags = [!s.showIcon && "no-icon", !s.showSub && "no-sub", !s.showTimer && "no-timer", !s.showBar && "no-bar"].filter(Boolean).join(" ");
      w.className = `afk ${s.pos || "bl"} ${flags}`;
      w.style.setProperty("--pbg", hexA(s.bg, (Number(s.bgOpacity) ?? 94) / 100));
      w.style.setProperty("--ptx", s.textColor || "#fff");
      w.style.setProperty("--prad", `calc(var(--w) * ${(Number(s.radius) || 0) / 10})`);
      w.style.setProperty("--k", String((Number(s.scale) || 100) / 100));
      const style = s.style === "banner" || s.style === "full" ? s.style : "card";
      const ring = `<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="3"/><circle class="arc" cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg><div class="ico"></div></div>`;
      const inner = {
        card: `<div class="ico"></div><div class="t"></div><div class="s"></div><div class="foot"><div class="clock"></div><div class="bar"><i></i></div></div>`,
        banner: `<div class="bar"><i></i></div><div class="ico"></div><div class="mid"><div class="t"></div><div class="s"></div></div><div class="clock"></div>`,
        full: `${ring}<div class="t"></div><div class="clock"></div><div class="s"></div>`,
      }[style];
      w.innerHTML = `<div class="afk-dim"></div><div class="afk-pop afk-${style}">${inner}</div><div class="afk-back"><small></small><span></span></div>`;
      layer.appendChild(w);
      const pop = w.querySelector(".afk-pop"), dim = w.querySelector(".afk-dim"), back = w.querySelector(".afk-back");
      const fam = FONTS[s.font] || FONTS.teko;
      for (const el of pop.querySelectorAll(".t, .clock")) el.style.fontFamily = fam;
      back.querySelector("span").style.fontFamily = fam;
      back.querySelector("small").textContent = s.backWords || "WELCOME BACK";

      let cur = null, t0 = 0, len = 0, iv = 0, backT = 0;
      function tick() {
        if (!cur) return;
        const left = len - (Date.now() - t0), frac = Math.max(0, Math.min(1, left / len));
        const clock = pop.querySelector(".clock");
        clock.textContent = left > 0 ? (style === "full" ? "Back in " : "") + fmtClock(left) : "Any second now · +" + fmtClock(-left, true);
        const bar = pop.querySelector(".bar i"); if (bar) bar.style.transform = `scaleX(${frac})`;
        const arc = pop.querySelector(".arc"); if (arc) arc.style.strokeDashoffset = String(100 - frac * 100);
      }
      function show(item, start, ms) {
        cur = item; t0 = start; len = Math.max(1000, ms);
        w.style.setProperty("--c", s.eachColor !== false && /^#[0-9a-f]{6}$/i.test(item.c || "") ? item.c : s.color || "#d4a24c");
        for (const e of pop.querySelectorAll(".ico")) e.textContent = item.ico || "";
        pop.querySelector(".t").textContent = item.t || "";
        pop.querySelector(".s").textContent = item.s || "";
        tick();
        requestAnimationFrame(() => { pop.classList.add("on"); if (style === "full" && s.dim) dim.classList.add("on"); });
        clearInterval(iv); iv = setInterval(tick, 250);
      }
      function hide() { cur = null; clearInterval(iv); pop.classList.remove("on"); dim.classList.remove("on"); }
      function fromState(x) {
        if (x && x.cur) show(x.cur, Number(x.t0) || Date.now(), Number(x.len) || 300000);
        else if (preview && list[0]) show(list[0], Date.now(), (Number(list[0].min) || 5) * 60000); // a sample to style
        else hide();
      }
      fromState(st);
      let curId = st && st.cur ? st.cur.id : null;
      return {
        sync(nst) {
          const id = nst && nst.cur ? nst.cur.id : null;
          if (id === curId) return;
          curId = id;
          if (id) fromState(nst); else if (!preview) hide();
        },
        fire(t, d) {
          if (t === "start") sfx(s.sound);
          if (t === "back") {
            hide();
            back.querySelector("span").textContent = "Gone " + fmtClock(Number(d.gone) || 0, true);
            back.classList.add("on");
            clearTimeout(backT); backT = setTimeout(() => { back.classList.remove("on"); if (preview) fromState(null); }, 2600);
          }
        },
        stop() { clearInterval(iv); clearTimeout(backT); },
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
      for (const e of list) if (e.id > lastSeq) fire(e.type, { ...(e.data || {}), _id: e.id });
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
