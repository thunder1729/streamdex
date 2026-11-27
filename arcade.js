/* Streamdex Arcade: three coin minigames that run inside the 3D lobby.
   No libraries. Coins are paid through StreamdexLobbyBridge.awardCoins (daily cap + payout rate set in Admin > Multiplayer). */
(function () {
"use strict";
const B = window.StreamdexLobbyBridge;
if (!B) return;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const LANE_COL = ["#ff7ad9", "#ffd34d", "#62c8ff", "#6ff0a0"];

const css = `
#lbArcade{position:absolute;inset:0;z-index:3;display:grid;place-items:center;padding:12px;background:rgba(5,6,22,.78);touch-action:pan-y}
.ar-box{width:min(460px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;background:var(--ink2,#14173d);border:1.5px solid var(--line,rgba(244,240,232,.2));border-radius:18px;padding:14px;overflow:auto;position:relative}
.ar-head{display:flex;align-items:center;gap:10px}
.ar-head b{font-size:18px;flex:1}
.ar-x{font-size:20px;line-height:1;padding:6px 10px;border-radius:99px;background:rgba(244,240,232,.1);color:inherit;border:0;cursor:pointer}
.ar-x:hover{background:rgba(244,240,232,.22)}
.ar-cap{font-size:13px;opacity:.85}
.ar-meter{height:8px;border-radius:99px;background:rgba(244,240,232,.14);overflow:hidden}
.ar-meter i{display:block;height:100%;background:linear-gradient(90deg,#ffd34d,#ff5b1f);border-radius:99px;transition:width .5s}
.ar-menu{display:grid;gap:10px}
.ar-card{display:flex;gap:14px;align-items:center;text-align:left;padding:14px;border-radius:14px;background:rgba(244,240,232,.06);border:1.5px solid rgba(244,240,232,.16);color:inherit;cursor:pointer;transition:transform .12s,border-color .12s,background .12s}
.ar-card:hover,.ar-card:focus-visible{transform:translateY(-2px);border-color:#ffd34d;background:rgba(255,211,77,.1)}
.ar-card .ic{font-size:34px;width:54px;height:54px;display:grid;place-items:center;border-radius:14px;background:rgba(7,9,31,.7);flex:none}
.ar-card b{display:block;font-size:16px}
.ar-card small{display:block;opacity:.75;font-size:13px;margin-top:2px}
.ar-card em{font-style:normal;margin-left:auto;font-size:13px;font-weight:750;color:#ffd34d;white-space:nowrap;padding-left:8px}
.ar-note{font-size:13px;opacity:.8;text-align:center}
.ar-stage{display:grid;place-items:center;gap:8px}
.ar-hud{display:flex;justify-content:space-between;gap:10px;width:100%;font-weight:700;font-size:15px}
.ar-cv{width:min(100%,360px);aspect-ratio:3/4;border-radius:14px;background:#07091f;touch-action:none;display:block;border:1.5px solid rgba(244,240,232,.18)}
.ar-cv.tall{aspect-ratio:18/26}
.ar-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:min(100%,360px)}
.ar-tile{aspect-ratio:1;border-radius:12px;border:1.5px solid rgba(244,240,232,.2);background:linear-gradient(145deg,#2230d8,#14173d);font-size:30px;color:inherit;cursor:pointer;display:grid;place-items:center;transition:transform .18s,background .18s}
.ar-tile:hover{transform:scale(1.04)}
.ar-tile.up{background:#f4f0e8;transform:rotateY(0)}
.ar-tile.done{background:#1d6b45;border-color:#6ff0a0;cursor:default}
.ar-tile:disabled{opacity:1}
.ar-res{text-align:center;display:grid;gap:12px;justify-items:center;padding:6px 0}
.ar-res h3{margin:0;font-size:22px}
.ar-big{font-size:52px;font-weight:850;color:#ffd34d;line-height:1}
.ar-stats{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;font-size:14px;opacity:.9}
.ar-stats b{display:block;font-size:20px}
.ar-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.ar-rain{position:absolute;left:0;right:0;top:0;height:100%;pointer-events:none;overflow:hidden;border-radius:18px}
.ar-rain span{position:absolute;top:-30px;font-size:24px;animation:arfall 1.6s ease-in forwards}
@keyframes arfall{to{transform:translateY(520px) rotate(360deg);opacity:0}}
@media (prefers-reduced-motion:reduce){.ar-rain{display:none}.ar-card,.ar-tile{transition:none}}
`;
const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

/* ================= games =================
   run(stage, finish) -> { stop(), key?(event) }.  finish({ quality: 0..1, stats: [[label, value], ...] }) */

function runBeat(stage, finish) {
  const W = 360, H = 480, HIT = 400, SPEED = 290, WIN = .18, GOOD = .075;
  stage.innerHTML = `<div class="ar-hud"><span id="bS">Score 0</span><span id="bC">Combo 0</span></div><canvas class="ar-cv" width="${W}" height="${H}" aria-label="Beat Tap. Press D, F, J, K or tap the lanes."></canvas><div class="ar-note">D · F · J · K or tap the lanes</div>`;
  const cv = stage.querySelector("canvas"), g = cv.getContext("2d"), notes = [], fx = [], pressed = [0, 0, 0, 0];
  const beat = 60 / 112; let last = -1, t = 2.1;
  for (let i = 0; i < 48; i++, t += beat) {
    if (Math.random() < .78) { let l; do l = Math.floor(Math.random() * 4); while (l === last && Math.random() < .6); last = l; notes.push({ t, l, s: 0 }); }
    if (i % 4 === 3 && Math.random() < .5) { const l2 = (last + 1 + Math.floor(Math.random() * 3)) % 4; notes.push({ t, l: l2, s: 0 }); }
  }
  const end = notes[notes.length - 1].t + .8, N = notes.length;
  let sum = 0, combo = 0, best = 0, perf = 0, good = 0, miss = 0, label = "", labelAt = 0, raf = 0, done = false;
  const t0 = performance.now(), nowS = () => (performance.now() - t0) / 1000;
  const hit = l => {
    const now = nowS(); pressed[l] = now + .12;
    let n = null;
    for (const q of notes) if (!q.s && q.l === l && Math.abs(q.t - now) <= WIN && (!n || q.t < n.t)) n = q;
    if (!n) return;
    const d = Math.abs(n.t - now);
    n.s = 1; combo++; best = Math.max(best, combo);
    if (d < GOOD) { sum += 1; perf++; label = "Perfect!"; } else { sum += .6; good++; label = "Good"; }
    labelAt = now; fx.push({ l, at: now });
    stage.querySelector("#bS").textContent = "Score " + Math.round(sum / N * 100); stage.querySelector("#bC").textContent = "Combo " + combo;
  };
  const frame = () => {
    if (done) return;
    const now = nowS();
    for (const q of notes) if (!q.s && now - q.t > WIN) { q.s = 2; miss++; combo = 0; label = "Miss"; labelAt = now; stage.querySelector("#bC").textContent = "Combo 0"; }
    g.clearRect(0, 0, W, H);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0b0d2a"); bg.addColorStop(1, "#1a1f6b"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const lw = W / 4;
    for (let l = 0; l < 4; l++) {
      g.fillStyle = pressed[l] > now ? LANE_COL[l] + "44" : "rgba(244,240,232,.04)"; g.fillRect(l * lw, 0, lw, H);
      g.fillStyle = "rgba(244,240,232,.12)"; g.fillRect(l * lw, 0, 1, H);
    }
    g.fillStyle = "#f4f0e8"; g.fillRect(0, HIT - 2, W, 4);
    g.font = "bold 16px system-ui,sans-serif"; g.textAlign = "center";
    for (let l = 0; l < 4; l++) { g.fillStyle = pressed[l] > now ? LANE_COL[l] : "rgba(244,240,232,.55)"; g.fillText("DFJK"[l], l * lw + lw / 2, HIT + 32); }
    for (const q of notes) {
      if (q.s === 1) continue;
      const y = HIT - (q.t - now) * SPEED; if (y < -30 || y > H + 30) continue;
      g.globalAlpha = q.s === 2 ? .25 : 1; g.fillStyle = LANE_COL[q.l];
      g.beginPath(); g.roundRect(q.l * lw + 8, y - 12, lw - 16, 24, 8); g.fill();
    }
    g.globalAlpha = 1;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], a = (now - f.at) / .35; if (a >= 1) { fx.splice(i, 1); continue; }
      g.strokeStyle = LANE_COL[f.l]; g.globalAlpha = 1 - a; g.lineWidth = 4; g.beginPath(); g.arc(f.l * lw + lw / 2, HIT, 18 + a * 34, 0, 7); g.stroke();
    }
    g.globalAlpha = 1;
    if (label && now - labelAt < .5) { g.globalAlpha = 1 - (now - labelAt) / .5; g.fillStyle = label === "Miss" ? "#ff7a7a" : "#ffd34d"; g.font = "bold 26px system-ui,sans-serif"; g.fillText(label, W / 2, 250 - (now - labelAt) * 30); g.globalAlpha = 1; }
    if (now < 1.6) { g.fillStyle = "rgba(244,240,232,.9)"; g.font = "bold 22px system-ui,sans-serif"; g.fillText(now < .5 ? "Ready…" : "Get set…", W / 2, 200); }
    if (now > end) { done = true; return finish({ quality: sum / N, stats: [["Perfect", perf], ["Good", good], ["Missed", miss], ["Best combo", best]] }); }
    raf = requestAnimationFrame(frame);
  };
  const lane = e => clamp(Math.floor((e.clientX - cv.getBoundingClientRect().left) / cv.getBoundingClientRect().width * 4), 0, 3);
  cv.addEventListener("pointerdown", e => { e.preventDefault(); hit(lane(e)); });
  raf = requestAnimationFrame(frame);
  return { stop() { done = true; cancelAnimationFrame(raf); }, key(e) { const l = "dfjk".indexOf(e.key.toLowerCase()); if (l >= 0 && !e.repeat) { e.preventDefault(); hit(l); } } };
}

function runMatch(stage, finish) {
  const ICONS = ["🎸", "🥁", "🎹", "🎷", "🎺", "🎻"], TIME = 45;
  const deck = [...ICONS, ...ICONS].sort(() => Math.random() - .5);
  stage.innerHTML = `<div class="ar-hud"><span id="mT">Time ${TIME}</span><span id="mP">Pairs 0 / 6</span></div><div class="ar-grid">${deck.map((v, i) => `<button class="ar-tile" data-i="${i}" aria-label="Card ${i + 1}">?</button>`).join("")}</div><div class="ar-note">Find all six pairs before time runs out. Faster is worth more.</div>`;
  const tiles = [...stage.querySelectorAll(".ar-tile")], t0 = performance.now(), timers = new Set();
  let first = -1, lock = false, pairs = 0, moves = 0, over = false, tick = 0;
  const later = (f, ms) => { const h = setTimeout(() => { timers.delete(h); f(); }, ms); timers.add(h); };
  const left = () => Math.max(0, TIME - (performance.now() - t0) / 1000);
  const end = () => { if (over) return; over = true; clearInterval(tick); const l = left(); finish({ quality: pairs / 6 * (pairs === 6 ? .55 + .45 * l / TIME : .55), stats: [["Pairs", pairs + " / 6"], ["Moves", moves], ["Time left", Math.ceil(l) + "s"]] }); };
  tick = setInterval(() => { const l = left(); stage.querySelector("#mT").textContent = "Time " + Math.ceil(l); if (l <= 0) end(); }, 200);
  const up = (i, on) => { tiles[i].classList.toggle("up", on); tiles[i].textContent = on ? deck[i] : "?"; };
  stage.addEventListener("click", e => {
    const b = e.target.closest(".ar-tile"); if (!b || over || lock) return;
    const i = +b.dataset.i; if (i === first || b.classList.contains("done")) return;
    up(i, true);
    if (first < 0) { first = i; return; }
    moves++; const a = first; first = -1;
    if (deck[a] === deck[i]) { [a, i].forEach(k => { tiles[k].classList.add("done"); tiles[k].classList.remove("up"); }); pairs++; stage.querySelector("#mP").textContent = `Pairs ${pairs} / 6`; if (pairs === 6) later(end, 500); }
    else { lock = true; later(() => { up(a, false); up(i, false); lock = false; }, 650); }
  });
  return { stop() { over = true; clearInterval(tick); timers.forEach(clearTimeout); } };
}

function runCatch(stage, finish) {
  const W = 360, H = 480, TIME = 30, CY = 432, CW = 76;
  stage.innerHTML = `<div class="ar-hud"><span id="cS">Points 0</span><span id="cL">♥♥♥</span><span id="cT">${TIME}</span></div><canvas class="ar-cv" width="${W}" height="${H}" aria-label="Crate Catch. Move the crate with the mouse, your finger, or the arrow keys."></canvas><div class="ar-note">Catch the records, dodge the cracked ones. Gold is worth 3.</div>`;
  const cv = stage.querySelector("canvas"), g = cv.getContext("2d"), items = [], keys = new Set(), fx = [];
  let x = W / 2, tx = W / 2, pts = 0, lives = 3, caught = 0, golds = 0, spawn = .6, raf = 0, done = false, last = performance.now(), el = 0;
  const setX = e => { const r = cv.getBoundingClientRect(); tx = clamp((e.clientX - r.left) / r.width * W, CW / 2, W - CW / 2); };
  cv.addEventListener("pointerdown", e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); setX(e); });
  cv.addEventListener("pointermove", e => { if (e.pointerType === "mouse" || e.buttons) setX(e); });
  const stop = () => { done = true; cancelAnimationFrame(raf); };
  const finishNow = () => { stop(); finish({ quality: Math.min(1, pts / 34), stats: [["Records", caught], ["Gold", golds], ["Points", pts], ["Lives left", lives]] }); };
  const frame = now => {
    if (done) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now; el += dt;
    const k = (keys.has("arrowright") || keys.has("d") ? 1 : 0) - (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
    if (k) tx = clamp(tx + k * 340 * dt, CW / 2, W - CW / 2);
    x += (tx - x) * (1 - Math.exp(-18 * dt));
    spawn -= dt;
    if (spawn <= 0 && el < TIME - .8) { spawn = Math.max(.32, .62 - el * .01); const r = Math.random(); items.push({ x: 24 + Math.random() * (W - 48), y: -20, t: r < .68 ? 0 : r < .8 ? 1 : 2, v: 150 + el * 3.4 + Math.random() * 40, a: Math.random() * 6 }); }
    for (let i = items.length - 1; i >= 0; i--) {
      const q = items[i]; q.y += q.v * dt; q.a += dt * 4;
      if (q.y > CY - 14 && q.y < CY + 18 && Math.abs(q.x - x) < CW / 2 + 8) {
        items.splice(i, 1);
        if (q.t === 2) { lives--; fx.push({ x: q.x, y: CY, c: "#ff7a7a", s: "−♥", at: el }); stage.querySelector("#cL").textContent = "♥".repeat(Math.max(0, lives)) + "♡".repeat(3 - Math.max(0, lives)); }
        else { const p = q.t ? 3 : 1; pts += p; q.t ? golds++ : caught++; fx.push({ x: q.x, y: CY, c: q.t ? "#ffd34d" : "#f4f0e8", s: "+" + p, at: el }); stage.querySelector("#cS").textContent = "Points " + pts; }
      } else if (q.y > H + 24) items.splice(i, 1);
    }
    stage.querySelector("#cT").textContent = Math.max(0, Math.ceil(TIME - el));
    g.clearRect(0, 0, W, H);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0b0d2a"); bg.addColorStop(1, "#1f2368"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (const q of items) {
      g.save(); g.translate(q.x, q.y);
      if (q.t === 2) { g.fillStyle = "#3b1020"; g.beginPath(); g.arc(0, 0, 15, 0, 7); g.fill(); g.strokeStyle = "#ff5b5b"; g.lineWidth = 3; g.beginPath(); g.moveTo(-8, -8); g.lineTo(8, 8); g.moveTo(8, -8); g.lineTo(-8, 8); g.stroke(); }
      else { g.fillStyle = q.t ? "#ffd34d" : "#101018"; g.beginPath(); g.arc(0, 0, 15, 0, 7); g.fill(); g.strokeStyle = q.t ? "#fff3b0" : "#3a3a55"; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 10, 0, 7); g.stroke(); g.fillStyle = q.t ? "#ff5b1f" : "#ff5b1f"; g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill(); g.fillStyle = "rgba(255,255,255,.55)"; g.fillRect(Math.cos(q.a) * 11 - 1.5, Math.sin(q.a) * 11 - 1.5, 3, 3); }
      g.restore();
    }
    g.fillStyle = "#6a4a8c"; g.beginPath(); g.roundRect(x - CW / 2, CY, CW, 30, [4, 4, 12, 12]); g.fill();
    g.fillStyle = "#ffd34d"; g.fillRect(x - CW / 2, CY, CW, 6);
    g.fillStyle = "#2230d8"; g.fillRect(x - CW / 2 + 8, CY + 12, CW - 16, 4);
    g.font = "bold 18px system-ui,sans-serif"; g.textAlign = "center";
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i], a = (el - f.at) / .7; if (a >= 1) { fx.splice(i, 1); continue; } g.globalAlpha = 1 - a; g.fillStyle = f.c; g.fillText(f.s, f.x, f.y - 20 - a * 40); }
    g.globalAlpha = 1;
    if (lives <= 0 || el >= TIME) return finishNow();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { stop, key(e) { const k = e.key.toLowerCase(); if (["arrowleft", "arrowright", "a", "d"].includes(k)) { e.preventDefault(); e.type === "keyup" ? keys.delete(k) : keys.add(k); } } };
}

const GAMES = {
  beat: { name: "Beat Tap", icon: "🎵", blurb: "Hit the notes on the line. About 30 seconds.", max: 40, run: runBeat },
  match: { name: "Vinyl Match", icon: "🃏", blurb: "Flip cards and match six pairs. 45 seconds.", max: 30, run: runMatch },
  catch: { name: "Crate Catch", icon: "📦", blurb: "Catch falling records, dodge the cracked ones.", max: 40, run: runCatch }
};

/* ================= overlay ================= */
let host = null, isOpen = false, view = "", cur = null, cfgFn = () => ({}), today = null, runId = 0;
const enabled = () => { const c = cfgFn(), g = c.games || {}; return c.arcade !== false ? Object.keys(GAMES).filter(k => g[k] !== false) : []; };
const rate = () => clamp(+cfgFn().arcadeRate, 0, 300) / 100 || 0;
const canEarn = () => { const i = B.info(); return !!(i.user && i.handle && !i.demo); };
const capLine = () => today ? `Today: ${today.today} / ${today.cap} coins` : (canEarn() ? "Checking your daily total…" : "");
const meter = () => today && today.cap > 0 ? `<div class="ar-meter" aria-hidden="true"><i style="width:${clamp(today.today / today.cap * 100, 0, 100)}%"></i></div>` : "";

async function refreshToday() { try { today = canEarn() && B.arcadeToday ? await B.arcadeToday() : null; } catch { today = null; } if (isOpen && view === "menu") showMenu(); }

function shell(title, inner) {
  host.innerHTML = `<div class="ar-box"><div class="ar-head"><b>${esc(title)}</b><span class="ar-cap">${esc(capLine())}</span><button class="ar-x" data-ar="close" aria-label="Close arcade">&times;</button></div>${meter()}<div id="arBody">${inner}</div></div>`;
}
function showMenu() {
  stopGame(); view = "menu";
  const list = enabled();
  const cards = list.map(k => { const G = GAMES[k], top = Math.round(G.max * rate()); return `<button class="ar-card" data-play="${k}"><span class="ic">${G.icon}</span><span><b>${esc(G.name)}</b><small>${esc(G.blurb)}</small></span><em>up to ${top} 🪙</em></button>`; }).join("");
  shell("Arcade", `<div class="ar-menu">${cards || '<div class="ar-note">The arcade is closed right now.</div>'}</div><div class="ar-note" style="margin-top:10px">${canEarn() ? "Coins go straight to your marketplace balance." : "You're not signed in, so these are just for fun. Sign in to earn coins."}</div>`);
}
function stopGame() { runId++; if (cur) { cur.stop(); cur = null; } }
function play(key) {
  if (!enabled().includes(key)) return;
  stopGame(); view = "game";
  const G = GAMES[key], id = runId;
  shell(G.name, `<div class="ar-stage" id="arStage"></div><div class="ar-row" style="margin-top:8px"><button class="btn sm ghost" data-ar="menu">Quit</button></div>`);
  cur = G.run(host.querySelector("#arStage"), async res => {
    if (id !== runId) return;
    cur = null; view = "result";
    const want = Math.round(G.max * clamp(res.quality, 0, 1) * rate());
    shell(G.name, `<div class="ar-res"><h3>Round over</h3><div class="ar-stats">${res.stats.map(([a, b]) => `<span>${esc(a)}<b>${esc(b)}</b></span>`).join("")}</div><div class="ar-note" id="arPay">Counting your coins…</div></div>`);
    let got = 0, msg = "";
    if (!want) msg = "No coins this time. Try again!";
    else if (!canEarn()) msg = `You would have earned ${want} coins. Sign in to keep them next time.`;
    else try {
      const r = await B.awardCoins(want, key); if (id !== runId) return;
      got = r.amt; today = { today: r.today, cap: r.cap };
      msg = got <= 0 ? "You've hit today's arcade limit. Come back tomorrow!" : got < want ? `Daily limit reached, so you got ${got} of ${want} coins.` : "Added to your balance.";
    } catch (e) { msg = (e && e.code === "arcade-signin") ? "Sign in to earn coins." : "Couldn't add the coins. Check your connection."; }
    if (id !== runId) return;
    shell(G.name, `<div class="ar-res"><h3>${res.quality >= .85 ? "Amazing run!" : res.quality >= .5 ? "Nice one!" : "Good try!"}</h3><div class="ar-big">${got ? "+" + got : "0"} 🪙</div><div class="ar-stats">${res.stats.map(([a, b]) => `<span>${esc(a)}<b>${esc(b)}</b></span>`).join("")}</div><div class="ar-note">${esc(msg)}</div><div class="ar-row"><button class="btn sm" data-play="${key}">Play again</button><button class="btn sm ghost" data-ar="menu">Menu</button></div></div>`);
    if (got) rain();
    if (host.onCoins) host.onCoins();
  });
}
function rain() {
  const box = host.querySelector(".ar-box"); if (!box) return;
  const r = document.createElement("div"); r.className = "ar-rain";
  for (let i = 0; i < 16; i++) { const s = document.createElement("span"); s.textContent = "🪙"; s.style.left = Math.random() * 94 + "%"; s.style.animationDelay = Math.random() * .5 + "s"; r.appendChild(s); }
  box.appendChild(r); setTimeout(() => r.remove(), 2300);
}

const api = {
  mount(root, opts) {
    cfgFn = opts.cfg; host = document.createElement("div"); host.id = "lbArcade"; host.hidden = true; host.setAttribute("role", "dialog"); host.setAttribute("aria-label", "Arcade");
    host.onCoins = opts.onCoins; root.appendChild(host);
    host.addEventListener("click", e => {
      e.stopPropagation();
      const p = e.target.closest("[data-play]"), a = e.target.closest("[data-ar]");
      if (p) return play(p.dataset.play);
      if (a) a.dataset.ar === "close" ? api.close() : showMenu();
    });
    const onKey = e => {
      if (!isOpen) return;
      if (e.key === "Escape" && e.type === "keydown") { e.preventDefault(); return cur ? showMenu() : api.close(); }
      cur?.key?.(e);
    };
    window.addEventListener("keydown", onKey, true); window.addEventListener("keyup", onKey, true);
  },
  open(key) {
    if (!host || isOpen) return; isOpen = true; host.hidden = false;
    if (key && enabled().includes(key)) play(key); else showMenu();
    refreshToday();
  },
  close() { if (!isOpen) return; isOpen = false; stopGame(); host.hidden = true; host.innerHTML = ""; },
  isOpen: () => isOpen,
  games: GAMES
};
window.StreamdexArcade = api;
})();
