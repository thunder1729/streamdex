/* Streamdex Lobby: walk around in 3D and trade cards face to face.
   Trades use the same escrow rules as the Trade tab (through StreamdexLobbyBridge in index.html). */
(function () {
"use strict";

/* ===== SETUP: paste your Realtime Database URL between the quotes (see SETUP.md) ===== */
const LOBBY_DB_URL = "https://streamdex-40c93-default-rtdb.firebaseio.com";
/* Set to true after you export models from Blender into the models folder. */
const USE_BLENDER_MODELS = false;
/* ===================================================================================== */

const B = window.StreamdexLobbyBridge, R3 = window.Lobby3D;
if (!B || !R3) return;
const { M, rgb } = R3;
const ROOMS = 5, ROOM_CAP = 12, MAX_CARDS = 5, SEND_MS = 200, BEAT_MS = 15000, STALE_MS = 45000;
const ARENA = 12.5, SPEED = 4.6;
const EMOTES = { wave: "👋", yes: "👍", love: "🔥", trade: "🔁 Trade?" };
const $ = s => root.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const colorFor = id => { const h = [...String(id)].reduce((t, c) => (t*31 + c.charCodeAt(0)) % 360, 7); const f = n => { const k = (n + h/30) % 12; return Math.round(255*(.6 - .32*Math.max(-1, Math.min(k-3, 9-k, 1)))).toString(16).padStart(2, "0"); }; return "#" + f(0) + f(8) + f(4); };

/* ---------- styles + markup ---------- */
const css = `
/* while the lobby is open the page behind it is hidden, so it can't stretch the screen on phones */
body.lb-open>*:not(#lobby):not(.toast):not(script):not(style){display:none!important}
#lobby{position:fixed;inset:0;z-index:80;background:#0b0d2a;color:var(--paper,#f4f0e8);overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
#lobby[hidden],#lobby [hidden]{display:none!important}
#lbCanvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}
#lbLabels{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.lb-top,.lb-note,.lb-bottom,#lbStick{z-index:1}
.lb-ask,.lb-trade{z-index:2}
.lb-tag{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:4px;white-space:nowrap}
.lb-tag b{font-size:13px;padding:4px 10px;border-radius:99px;background:rgba(7,9,31,.78);border:1px solid rgba(244,240,232,.22)}
.lb-tag em{font-style:normal;font-size:20px;font-weight:700;padding:4px 12px;border-radius:14px;background:#f4f0e8;color:#0b0d2a}
.lb-top{position:absolute;left:0;right:0;top:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:calc(10px + env(safe-area-inset-top)) 12px 10px;pointer-events:none}
.lb-top>*{pointer-events:auto}
.lb-pill{font-size:14px;font-weight:650;padding:8px 14px;border-radius:99px;background:rgba(7,9,31,.8);border:1px solid rgba(244,240,232,.2);color:inherit}
.lb-top .lb-gap{flex:1}
.lb-note{position:absolute;left:50%;transform:translateX(-50%);top:calc(62px + env(safe-area-inset-top));width:max-content;max-width:calc(100% - 24px);text-align:center;font-size:14px;padding:8px 14px;border-radius:12px;background:rgba(255,91,31,.94);color:#14060a;font-weight:650;pointer-events:none}
.lb-bottom{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px 12px calc(14px + env(safe-area-inset-bottom));pointer-events:none}
.lb-bottom>*{pointer-events:auto}
.lb-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.lb-help{font-size:13px;opacity:.7;text-align:center;pointer-events:none}
.lb-ask{position:absolute;left:50%;top:30%;transform:translateX(-50%);width:min(360px,calc(100% - 32px));background:var(--ink2,#14173d);border:1.5px solid var(--line,rgba(244,240,232,.2));border-radius:16px;padding:20px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.lb-ask p{margin:0 0 14px;font-weight:650}
.lb-trade{position:absolute;inset:0;display:grid;place-items:center;padding:12px;background:rgba(5,6,22,.66)}
.lb-box{width:min(900px,100%);max-height:100%;display:flex;flex-direction:column;gap:12px;background:var(--ink2,#14173d);border:1.5px solid var(--line,rgba(244,240,232,.2));border-radius:18px;padding:16px;overflow:auto;touch-action:pan-y}
.lb-sides{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.lb-side{border:1.5px solid var(--line,rgba(244,240,232,.2));border-radius:14px;padding:10px;min-width:0}
.lb-side.ok{border-color:#6ff0a0;box-shadow:0 0 0 1px #6ff0a0 inset}
.lb-side h4{margin:0 0 8px;font-size:15px;display:flex;justify-content:space-between;gap:8px}
.lb-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;min-height:150px;align-content:start}
.lb-card{position:relative;min-width:0;border-radius:9px;cursor:default;text-align:left}
.lb-card .card{width:100%!important;pointer-events:none}
button.lb-card{padding:0;background:none;border:0;color:inherit;cursor:pointer}
button.lb-card.sel{outline:3px solid #6ff0a0;outline-offset:2px}
.lb-empty{grid-column:1/-1;opacity:.65;font-size:14px;padding:24px 4px;text-align:center}
.lb-bag{display:grid;grid-auto-flow:column;grid-auto-columns:104px;gap:10px;overflow-x:auto;padding:5px;touch-action:pan-x;flex:none}
.lb-foot{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.lb-foot .st{margin-right:auto;font-size:14px;font-weight:650}
@media (max-width:620px){.lb-cards{grid-template-columns:repeat(2,1fr);min-height:90px}}
.lb-stick,.lb-jump{display:none}
/* ----- phones and tablets only (the main pointer is a finger) ----- */
@media (pointer:coarse){
#lobby{-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
#lobby button,#lobby select{touch-action:manipulation}
.lb-stick{display:block;position:absolute;bottom:calc(22px + env(safe-area-inset-bottom));width:118px;height:118px;border-radius:50%;background:rgba(244,240,232,.08);border:1.5px solid rgba(244,240,232,.3);touch-action:none}
#lbStick{left:calc(16px + env(safe-area-inset-left))}
#lbLook{right:calc(16px + env(safe-area-inset-right))}
.lb-stick i{position:absolute;left:35.5px;top:35.5px;width:44px;height:44px;border-radius:50%;background:rgba(244,240,232,.7);pointer-events:none}
.lb-stick span{position:absolute;left:0;right:0;bottom:-18px;text-align:center;font-size:12px;font-weight:650;opacity:.75;pointer-events:none}
.lb-jump{display:block;position:absolute;right:calc(39px + env(safe-area-inset-right));bottom:calc(154px + env(safe-area-inset-bottom));width:72px;height:72px;border-radius:50%;font-size:15px;font-weight:750;color:inherit;background:rgba(7,9,31,.8);border:1.5px solid rgba(244,240,232,.4)}
.lb-top{padding-left:calc(12px + env(safe-area-inset-left));padding-right:calc(12px + env(safe-area-inset-right))}
.lb-bottom{display:contents}
.lb-help,.lb-jump-key{display:none}
.lb-emotes{position:absolute;z-index:1;left:0;right:0;top:calc(62px + env(safe-area-inset-top));flex-wrap:nowrap;gap:6px;padding:0 8px}
.lb-emotes .lb-pill{min-height:44px;min-width:48px;padding:8px 12px;white-space:nowrap}
#lbNear{position:absolute;z-index:1;left:50%;transform:translateX(-50%);bottom:calc(244px + env(safe-area-inset-bottom));min-height:48px;max-width:calc(100% - 24px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb-note{top:calc(116px + env(safe-area-inset-top));font-size:13px}
#lobby.lb-busy .lb-stick,#lobby.lb-busy .lb-jump,#lobby.lb-busy .lb-emotes{display:none}
.lb-trade{padding:calc(8px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left));grid-template:minmax(0,1fr)/minmax(0,1fr)}
.lb-box{align-self:center;padding:12px 12px 0;gap:10px;overscroll-behavior:contain}
.lb-bag{touch-action:pan-x pan-y;min-height:max-content}
.lb-foot{position:sticky;bottom:0;margin:0 -12px;padding:10px 12px 12px;background:var(--ink2,#14173d);border-top:1px solid var(--line,rgba(244,240,232,.2))}
.lb-foot .st{flex-basis:100%}
.lb-foot .btn{flex:1;min-height:46px}
}
/* phones held sideways: short screen */
@media (pointer:coarse) and (max-height:500px){
.lb-emotes{left:50%;right:auto;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top))}
.lb-emotes .lb-pill{min-width:44px;padding:8px 10px}
.lb-top #lbWho{display:none}
.lb-note{top:calc(62px + env(safe-area-inset-top))}
.lb-stick{width:104px;height:104px}
.lb-stick i{left:28.5px;top:28.5px}
.lb-jump{width:62px;height:62px;right:calc(37px + env(safe-area-inset-right));bottom:calc(138px + env(safe-area-inset-bottom))}
#lbNear{bottom:calc(20px + env(safe-area-inset-bottom));max-width:calc(100% - 300px)}
.lb-cards{grid-template-columns:repeat(auto-fill,minmax(70px,1fr));min-height:70px}
.lb-bag{grid-auto-columns:72px}
.lb-foot .st{flex-basis:auto}
.lb-foot .btn{flex:none}
}
`;
const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
const root = document.createElement("div");
root.id = "lobby"; root.hidden = true;
root.setAttribute("role", "application"); root.setAttribute("aria-label", "Trading lobby");
root.innerHTML = `
<canvas id="lbCanvas"></canvas><div id="lbLabels"></div>
<div class="lb-top"><button class="btn sm ghost lb-pill" data-lb="exit">&larr; Back</button><span class="lb-pill" id="lbWho">Connecting…</span><span class="lb-gap"></span>
  <label class="lb-pill" id="lbRoomWrap" hidden>Room <select id="lbRoom"></select></label></div>
<div class="lb-note" id="lbNote" hidden></div>
<div class="lb-stick" id="lbStick" aria-hidden="true"><i></i><span>Move</span></div>
<div class="lb-stick" id="lbLook" aria-hidden="true"><i></i><span>Look</span></div>
<button type="button" class="lb-jump" data-lb="jump">Jump</button>
<div class="lb-bottom">
  <button class="btn" data-lb="near" id="lbNear" hidden></button>
  <div class="lb-row lb-emotes">${Object.entries(EMOTES).map(([k, v]) => `<button class="lb-pill" data-emote="${k}">${v}</button>`).join("")}<button class="lb-pill lb-jump-key" data-lb="jump">Jump</button></div>
  <div class="lb-help">WASD or arrows to move · drag to look · E to trade · Space to jump</div>
</div>
<div class="lb-ask" id="lbAsk" hidden role="alertdialog"></div>
<div class="lb-trade" id="lbTrade" hidden role="dialog" aria-label="Trade table"></div>`;
document.body.appendChild(root);
const canvas = $("#lbCanvas");

/* ---------- state ---------- */
let backScroll = 0, gfx = null, models = {}, running = false, raf = 0, last = 0, net = null, session = null, gen = 0;
const me = { x: 0, z: 6, r: Math.PI, y: 0, vy: 0, moving: false, emote: null, color: "#ff5b1f", name: "You" };
const peers = new Map(), keys = new Set(), stick = { x: 0, y: 0 }, look = { x: 0, y: 0 };
const cam = { yaw: 0, pitch: .45, dist: 7.5 };
let nearId = null;
const TABLES = [[-6,-3],[6,-3],[-6,5],[6,5]];
const SOLIDS = [[0,-2,2.4], ...TABLES.map(([x,z]) => [x,z,1.35])];

/* ---------- world ---------- */
const C = Object.fromEntries(Object.entries({ floor:"#171a4d", tile:"#1f2368", wall:"#121442", blue:"#2230d8", orange:"#ff5b1f", ink:"#07091f", vinyl:"#101018", paper:"#f4f0e8", pink:"#ff7ad9", gold:"#ffd34d", violet:"#c084ff", sky:"#62c8ff", mint:"#6ff0a0", wood:"#6a4a8c" }).map(([k, v]) => [k, rgb(v)]));
function model(name, x, y, z, ry, tint) {
  const parts = models[name];
  if (!parts) return false;
  const m = M.trs(x, y, z, ry);
  for (const p of parts) gfx.draw(p.mesh, m, p.tint && tint ? tint : p.color, p.glow);
  return true;
}
function drawWorld(t) {
  const d = (s, x, y, z, sx, sy, sz, col, glow, ry = 0) => gfx.draw(s, M.trs(x, y, z, ry, sx, sy, sz), col, glow);
  d("box", 0, -.25, 0, 28, .5, 28, C.floor);
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) if ((i + j) & 1) d("box", i*2, .004, j*2, 1.94, .006, 1.94, C.tile);
  /* walls: only the far ones are drawn, so the camera never gets blocked */
  const ex = Math.sin(cam.yaw), ez = Math.cos(cam.yaw);
  [[0,-14,28,.4,0,-1],[0,14,28,.4,0,1],[-14,0,.4,28,-1,0],[14,0,.4,28,1,0]].forEach(([x,z,w,dp,nx,nz]) => {
    if (nx*ex + nz*ez > .25) { d("box", x, .2, z, w, .4, dp, C.blue); return; }
    d("box", x, 2, z, w, 4, dp, C.wall);
    d("box", x*.98, 3.6, z*.98, nx ? .1 : 27, .12, nx ? 27 : .1, C.orange, 1);
    d("box", x*.98, .25, z*.98, nx ? .1 : 27, .12, nx ? 27 : .1, C.blue, 1);
    [C.pink, C.gold, C.violet, C.sky, C.mint].forEach((col, i) => { const o = (i-2)*4.4; d("box", x*.975 + (nz ? o : 0), 2, z*.975 + (nx ? o : 0), nx ? .08 : 1.5, 2.1, nx ? 1.5 : .08, col, .75); });
  });
  /* centre stage with a spinning record */
  d("cyl", 0, .2, -2, 5, .4, 5, C.blue);
  d("cyl", 0, .42, -2, 4.6, .06, 4.6, C.ink);
  if (!model("record", 0, .5, -2, t*.9)) {
    d("cyl", 0, .5, -2, 3.8, .1, 3.8, C.vinyl);
    d("cyl", 0, .556, -2, 1.3, .015, 1.3, C.orange);
    d("box", 0, .568, -2, 1.05, .012, .13, C.paper, .3, t*.9);
    d("cyl", 0, .6, -2, .14, .12, .14, C.paper);
  }
  [C.pink, C.gold, C.violet, C.sky].forEach((col, i) => { const a = t*.5 + i*Math.PI/2; d("box", Math.sin(a)*1.5, 2.2 + Math.sin(t*1.7+i)*.15, -2 + Math.cos(a)*1.5, .66, .92, .05, col, .55, a); });
  TABLES.forEach(([x,z]) => {
    if (model("table", x, 0, z, 0)) return;
    d("cyl", x, .06, z, 1.2, .12, 1.2, C.ink);
    d("cyl", x, .48, z, .28, .86, .28, C.wood);
    d("cyl", x, .95, z, 2.2, .14, 2.2, C.wood);
    d("cyl", x, 1.025, z, 1.9, .02, 1.9, C.blue, .35);
    d("box", x-.3, 1.05, z, .32, .02, .46, C.gold, .6, .3);
    d("box", x+.34, 1.05, z+.1, .32, .02, .46, C.pink, .6, -.4);
  });
  [[-11.5,-11.5],[11.5,-11.5],[-11.5,11.5],[11.5,11.5]].forEach(([x,z], i) => {
    d("box", x, 1.1, z, 1.5, 2.2, 1.5, C.ink);
    const pulse = 1 + Math.max(0, Math.sin(t*4 + i))*.08;
    d("ball", x - Math.sign(x)*.7, 1.45, z - Math.sign(z)*.7, .7*pulse, .7*pulse, .7*pulse, C.orange, .5);
  });
}
function drawAvatar(p, t) {
  const col = p.rgb || (p.rgb = rgb(p.color));
  const bob = p.moving ? Math.abs(Math.sin(t*10))*.09 : Math.sin(t*2 + p.x)*.025, y = (p.y || 0) + bob;
  gfx.draw("cyl", M.trs(p.x, .015, p.z, 0, .9, .01, .9), C.ink, 1, .45);
  const s = Math.sin(p.r), c = Math.cos(p.r);
  const at = (shape, lx, ly, lz, sx, sy, sz, color, glow) => gfx.draw(shape, M.trs(p.x + lx*c + lz*s, y + ly, p.z - lx*s + lz*c, p.r, sx, sy, sz), color, glow);
  if (!model("avatar", p.x, y, p.z, p.r, col)) {
    at("ball", 0, .52, 0, .66, .5, .54, col);
    at("cyl", 0, .76, 0, .66, .48, .54, col);
    at("ball", 0, 1.0, 0, .66, .4, .54, col);
    at("ball", 0, 1.52, 0, .66, .64, .64, C.paper);
    at("ball", -.12, 1.57, .29, .09, .13, .07, C.ink);
    at("ball", .12, 1.57, .29, .09, .13, .07, C.ink);
    at("box", 0, 1.40, .31, .18, .035, .03, C.ink);
  }
  /* floating hands */
  const waving = p.emote && p.emote.k === "wave", sw = p.moving ? Math.sin(t*10)*.2 : 0;
  at("ball", -.52, .8, sw, .22, .22, .22, C.paper);
  at("ball", .52 + (waving ? Math.sin(t*14)*.14 : 0), waving ? 1.65 : .8, -sw, .22, .22, .22, C.paper);
}

/* ---------- labels ---------- */
const tags = new Map();
function setTag(id, p, isMe) {
  let el = tags.get(id);
  if (!el) { el = document.createElement("div"); el.className = "lb-tag"; el.innerHTML = "<em hidden></em><b></b>"; $("#lbLabels").appendChild(el); tags.set(id, el); }
  const s = gfx.project(p.x, 2.15 + (p.y || 0), p.z);
  el.hidden = !s; if (!s) return;
  const name = (isMe ? "You" : p.name) + (p.bot ? " (bot)" : "") + (p.busy && !isMe ? " · trading" : "");
  if (el.lastChild.textContent !== name) el.lastChild.textContent = name;
  const live = p.emote && Date.now() - p.emote.at < 3000;
  el.firstChild.hidden = !live;
  if (live) el.firstChild.textContent = EMOTES[p.emote.k] || "";
  el.style.transform = `translate(${s[0]}px,${s[1]}px) translate(-50%,-100%)`;
  el.style.zIndex = Math.round(1000 - s[2]*10);
}
function dropTag(id) { tags.get(id)?.remove(); tags.delete(id); }

/* ---------- loop ---------- */
function step(dt, t) {
  let ix = stick.x, iz = stick.y;
  if (!session) {
    if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
    if (keys.has("d") || keys.has("arrowright")) ix += 1;
    if (keys.has("w") || keys.has("arrowup")) iz -= 1;
    if (keys.has("s") || keys.has("arrowdown")) iz += 1;
  } else ix = iz = 0;
  if (keys.has("q")) cam.yaw -= 1.8*dt;
  if (keys.has("r")) cam.yaw += 1.8*dt;
  if (!session) { cam.yaw -= look.x*2.4*dt; cam.pitch = clamp(cam.pitch + look.y*1.3*dt, .15, 1.15); }
  const len = Math.hypot(ix, iz);
  me.moving = len > .12;
  if (me.moving) {
    const k = SPEED*dt/Math.max(1, len), c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
    const dx = (ix*c + iz*s)*k, dz = (-ix*s + iz*c)*k;
    me.x = clamp(me.x + dx, -ARENA, ARENA); me.z = clamp(me.z + dz, -ARENA, ARENA);
    for (const [ox,oz,or] of SOLIDS) { const ax = me.x-ox, az = me.z-oz, d = Math.hypot(ax, az), min = or + .35; if (d < min) { const f = min/(d || 1); me.x = ox + (ax || .01)*f; me.z = oz + az*f; } }
    me.r = Math.atan2(dx, dz);
  }
  if (me.y > 0 || me.vy > 0) { me.vy -= 16*dt; me.y = Math.max(0, me.y + me.vy*dt); if (!me.y) me.vy = 0; }
  const ease = 1 - Math.exp(-10*dt);
  let best = null, bd = 3.2;
  for (const [id, p] of peers) {
    const dx = p.tx - p.x, dz = p.tz - p.z;
    p.moving = Math.hypot(dx, dz) > .06;
    p.x += dx*ease; p.z += dz*ease;
    p.r += Math.atan2(Math.sin(p.tr - p.r), Math.cos(p.tr - p.r))*ease;
    p.y = p.jumpAt ? Math.max(0, Math.sin((Date.now() - p.jumpAt)/450*Math.PI))*.7 : 0;
    if (p.jumpAt && Date.now() - p.jumpAt > 450) p.jumpAt = 0;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d < bd && !p.busy) { bd = d; best = id; }
  }
  if (session) best = null;
  if (best !== nearId) { nearId = best; const b = $("#lbNear"); b.hidden = !best; if (best) b.textContent = "Trade with " + peers.get(best).name; }
  net?.tick?.(dt);
}
function frame(now) {
  if (!running) return;
  const dt = Math.min(.05, (now - last)/1000 || 0), t = now/1000; last = now;
  step(dt, t);
  if (gfx) {
    const cp = Math.cos(cam.pitch), target = [me.x, 1.2, me.z];
    gfx.begin([me.x + Math.sin(cam.yaw)*cp*cam.dist, 1.2 + Math.sin(cam.pitch)*cam.dist, me.z + Math.cos(cam.yaw)*cp*cam.dist], target);
    drawWorld(t);
    drawAvatar(me, t); setTag("_me", me, true);
    for (const [id, p] of peers) { drawAvatar(p, t); setTag(id, p, false); }
  }
  raf = requestAnimationFrame(frame);
}

/* ---------- shared UI ---------- */
function note(text) { const n = $("#lbNote"); n.hidden = !text; n.textContent = text || ""; }
function who() { const n = peers.size + 1; $("#lbWho").textContent = net?.practice ? "Practice room" : `Live · ${n} ${n === 1 ? "person" : "people"} here`; }
function ask(html, buttons) {
  const a = $("#lbAsk");
  if (!html) { a.hidden = true; a.innerHTML = ""; syncControls(); return; }
  a.innerHTML = `<p>${html}</p><div class="lb-row">${buttons.map((b, i) => `<button class="btn sm ${i ? "ghost" : ""}" data-ans="${i}">${esc(b[0])}</button>`).join("")}</div>`;
  a.hidden = false; syncControls();
  a.onclick = e => { const b = e.target.closest("[data-ans]"); if (!b) return; ask(); buttons[+b.dataset.ans][1](); };
}
function syncControls() {
  const busy = !$("#lbAsk").hidden || !!session;
  root.classList.toggle("lb-busy", busy);
  if (busy) sticks.forEach(s => s.reset());
}
function emote(k) { me.emote = { k, at: Date.now() }; net?.publish(true); }
function jump() { if (!me.y && !session) { me.vy = 5; me.jumpAt = Date.now(); net?.publish(true); } }

/* ---------- trade table (same UI for live and practice) ----------
   A "ready" is a fingerprint of BOTH sides. If anyone changes a card, the old ready no longer matches. */
const slim = c => ({ id: c.id, raw: c.raw || c.id.replace(/^t:/, ""), name: c.name, artist: c.artist, niche: c.niche, plays: c.plays || 0, pop: c.pop || 0, affPct: c.affPct || 0, type: c.type || "Normal", no: c.no || 0, miss: !!c.miss, art: c.art || "" });
const key = list => list.map(c => [c.id, c.name, c.artist, c.niche].join("\u0001")).sort().join("\u0002");
const signature = (aCards, bCards) => key(aCards) + "\u0003" + key(bCards);
const parseCards = s => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a.slice(0, MAX_CARDS).filter(c => c && typeof c.id === "string" && typeof c.niche === "number" && c.niche >= 0 && c.niche <= 100).map(c => slim({ ...c, art: /^(https:|data:image\/)/.test(c.art || "") ? c.art : "" })) : []; } catch { return []; } };

function openSession(s) { /* s: {role, partner, mine:[], theirs:[], myReady, theirReady, state, setCards, setReady, close, lock} */
  session = s; me.busy = true; keys.clear(); ask();
  net.publish(true); renderTrade();
}
function endSession(message) {
  if (!session) return;
  clearInterval(session.timer);
  session = null; me.busy = false;
  const t = $("#lbTrade"); t.hidden = true; t.innerHTML = "";
  syncControls();
  net?.publish(true);
  if (message) B.toast(message);
}
function cardBtn(c, pickable, sel) {
  const tag = pickable ? "button" : "div";
  return `<${tag} class="lb-card${sel ? " sel" : ""}" ${pickable ? `type="button" data-pick="${esc(c.id)}" aria-pressed="${sel}" aria-label="${esc(c.name)} by ${esc(c.artist)}"` : ""}>${B.cardHTML(c)}</${tag}>`;
}
const sigNow = s => s.role === "a" ? signature(s.mine, s.theirs) : signature(s.theirs, s.mine);
function renderTrade() {
  const s = session; if (!s) return;
  const sig = sigNow(s), mineOk = s.myReady === sig, theirOk = s.theirReady === sig, locked = s.state === "sending" || s.state === "done";
  const full = s.mine.length && s.theirs.length;
  const status = s.state === "done" ? "Trade complete!" : locked ? "Swapping cards…" : s.count ? `Both ready. Trading in ${s.count}…` : !full ? "Each side needs at least one card." : mineOk ? `Waiting for ${s.partner} to press Ready…` : theirOk ? `${s.partner} is ready. Check their cards, then press Ready.` : "Check both sides, then press Ready.";
  const side = (title, list, ok, empty) => `<section class="lb-side${ok ? " ok" : ""}"><h4><span>${esc(title)}</span><span>${ok ? "✓ Ready" : `${list.length} of ${MAX_CARDS}`}</span></h4><div class="lb-cards">${list.length ? list.map(c => cardBtn(c, false)).join("") : `<div class="lb-empty">${esc(empty)}</div>`}</div></section>`;
  const el = $("#lbTrade"), scroll = el.querySelector(".lb-bag")?.scrollLeft || 0, top = el.querySelector(".lb-box")?.scrollTop || 0;
  const bag = s.bag.slice().sort((x, y) => x.niche - y.niche);
  el.innerHTML = `<div class="lb-box">
    <div class="lb-sides">${side("You give", s.mine, mineOk && !!full, "Tap your cards below")}${side(s.partner + " gives", s.theirs, theirOk && !!full, "Waiting for them to add cards")}</div>
    <div class="lb-bag" aria-label="Your cards">${bag.length ? bag.map(c => cardBtn(c, !locked, s.mine.some(m => m.id === c.id))).join("") : `<div class="lb-empty">You have no cards yet. Open a pack first.</div>`}</div>
    <div class="lb-foot"><span class="st" role="status">${esc(status)}</span><button class="btn sm ghost" data-lb="leave" ${locked ? "disabled" : ""}>Leave trade</button><button class="btn sm" data-lb="ready" ${locked || !full ? "disabled" : ""}>${mineOk && full ? "Not ready" : "Ready"}</button></div></div>`;
  el.hidden = false;
  el.querySelector(".lb-bag").scrollLeft = scroll; el.querySelector(".lb-box").scrollTop = top;
}
/* runs whenever either side changes: starts or stops the 3 second countdown */
function checkReady() {
  const s = session; if (!s || s.state !== "open") { if (s) renderTrade(); return; }
  const sig = sigNow(s), both = s.mine.length && s.theirs.length && s.myReady === sig && s.theirReady === sig;
  if (!both) { clearInterval(s.timer); s.timer = 0; s.count = 0; s.countSig = ""; }
  else if (s.countSig !== sig) {
    clearInterval(s.timer); s.count = 3; s.countSig = sig;
    s.timer = setInterval(() => {
      if (session !== s) return clearInterval(s.timer);
      if (--s.count <= 0) { clearInterval(s.timer); s.count = 0; if (s.role === "a" && s.state === "open") s.lock(sig); }
      renderTrade();
    }, 1000);
  }
  renderTrade();
}
function toggleCard(id) {
  const s = session; if (!s || s.state !== "open") return;
  const i = s.mine.findIndex(c => c.id === id);
  if (i >= 0) s.mine.splice(i, 1);
  else {
    if (s.mine.length >= MAX_CARDS) return B.toast(`Up to ${MAX_CARDS} cards each way.`);
    const c = s.bag.find(c => c.id === id); if (!c) return;
    s.mine.push(slim(c));
  }
  s.myReady = ""; s.setCards(s.mine); checkReady();
}

/* ---------- practice room: bots, nothing is saved ---------- */
function practiceNet(reason) {
  const sample = (id, name, artist, niche) => slim({ id, name, artist, niche, plays: 12, pop: Math.round(10 ** (2 + niche/100*4.7)), type: "Normal", no: 1 });
  const BOT_CARDS = [sample("bot:1","Paper Satellites","The Sample Band",8), sample("bot:2","Basement Weather","Demo Artist",27), sample("bot:3","Static Garden","Practice Club",41), sample("bot:4","Night Bus Loop","Test Pressing",66), sample("bot:5","Open Window","The Placeholders",88)];
  const bots = [["bot-a","VinylFox",-3,1],["bot-b","CrateOwl",4,2]];
  let clock = 0;
  const timers = [], later = (ms, f) => timers.push(setTimeout(f, ms));
  return {
    practice: true,
    start() {
      bots.forEach(([id, name, x, z]) => peers.set(id, { id, name, bot: true, x, z, tx: x, tz: z, r: 0, tr: 0, color: colorFor(id) }));
      note(reason + " The bots and their cards are pretend, and nothing is saved.");
      who();
    },
    tick(dt) {
      clock -= dt; if (clock > 0) return; clock = 3.5;
      for (const p of peers.values()) if (!p.busy && Math.random() < .6) {
        const x = clamp(p.x + (Math.random()-.5)*5, -9, 9), z = clamp(p.z + (Math.random()-.5)*4, 1, 9);
        if (SOLIDS.some(([ox,oz,or]) => Math.hypot(x-ox, z-oz) < or+1)) continue;
        p.tx = x; p.tz = z; p.tr = Math.atan2(x-p.x, z-p.z);
      }
    },
    publish() {},
    invite(id) {
      const p = peers.get(id); p.busy = true; p.tx = p.x; p.tz = p.z;
      const own = B.cards().map(slim);
      const mineBag = own.length ? own : [sample("me:1","Your Practice Card","Sample",19), sample("me:2","Another Practice Card","Sample",52), sample("me:3","Third Practice Card","Sample",79)];
      const s = { role: "a", partner: p.name, bag: mineBag, mine: [], theirs: [], myReady: "", theirReady: "", state: "open",
        setCards() { s.theirReady = ""; later(700, () => { if (session !== s) return; if (!s.theirs.length && s.mine.length) s.theirs = [BOT_CARDS[Math.floor(Math.random()*BOT_CARDS.length)]]; checkReady(); }); },
        setReady() { later(900, () => { if (session !== s || !s.myReady) return; s.theirReady = sigNow(s); checkReady(); }); },
        close() { p.busy = false; endSession(); },
        lock() { s.state = "done"; renderTrade(); later(1400, () => { if (session !== s) return; p.busy = false; endSession("Practice trade complete. Your real cards didn't change."); }); } };
      openSession(s);
    },
    stop() { timers.forEach(clearTimeout); }
  };
}

/* ---------- live room (Firebase Realtime Database) ---------- */
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => { s.remove(); no(new Error("script")); }; document.head.appendChild(s); }); }
function liveNet(db, user) {
  const uid = user.uid, base = db.ref("lobby"), offs = [], names = new Map(), timers = new Set();
  let room = "", myRef = null, sent = 0, lastSent = "", stopped = false, offset = 0, joining = 0, pendingInvite = null, asking = null;
  const now = () => Date.now() + offset;
  const on = (ref, ev, fn) => { ref.on(ev, fn, err => { console.warn("lobby", err); note("The lobby database refused a request. Check that you published the rules from database.rules.json."); }); const off = () => ref.off(ev, fn); offs.push(off); return off; };
  const later = (ms, f) => { const t = setTimeout(() => { timers.delete(t); f(); }, ms); timers.add(t); return t; };
  const packMe = () => ({ x: +me.x.toFixed(2), z: +me.z.toFixed(2), r: +me.r.toFixed(2), b: !!me.busy, e: me.emote && Date.now() - me.emote.at < 3000 ? me.emote.k + ":" + me.emote.at : "", j: me.jumpAt && Date.now() - me.jumpAt < 500 ? me.jumpAt : 0, t: firebase.database.ServerValue.TIMESTAMP });
  let roomOffs = [];
  function leaveRoom() { roomOffs.forEach(f => f()); roomOffs = []; if (myRef) { myRef.onDisconnect().cancel(); myRef.remove(); myRef = null; } [...peers.keys()].forEach(id => { peers.delete(id); dropTag(id); }); }
  const fresh = v => v && now() - (v.t || 0) < STALE_MS;
  async function nameFor(id) { /* names come from the account profile, not from whatever a player sends */
    if (!names.has(id)) names.set(id, B.handleFor(id).catch(() => { names.delete(id); return ""; }));
    return names.get(id);
  }
  async function upsert(snap) {
    const id = snap.key, v = snap.val(), inRoom = room;
    if (id === uid) return;
    const name = await nameFor(id);
    if (stopped || room !== inRoom || !name) return;
    if (!fresh(v)) { peers.delete(id); dropTag(id); return who(); }
    let p = peers.get(id);
    if (!p) { p = { id, x: v.x, z: v.z, r: v.r, color: colorFor(id) }; peers.set(id, p); }
    p.name = name; p.tx = clamp(+v.x || 0, -ARENA, ARENA); p.tz = clamp(+v.z || 0, -ARENA, ARENA); p.tr = +v.r || 0; p.busy = !!v.b; p.seen = v.t;
    if (v.e && v.e !== p.eRaw) { p.eRaw = v.e; p.emote = { k: v.e.split(":")[0], at: Date.now() }; }
    if (v.j && v.j !== p.jRaw) { p.jRaw = v.j; p.jumpAt = Date.now(); }
    who();
  }
  async function join(wanted) {
    const mine = ++joining;
    leaveRoom();
    let pick = wanted;
    if (!pick) for (let i = 1; i <= ROOMS && !pick; i++) {
      const v = (await base.child("rooms/" + i).once("value")).val() || {};
      if (Object.entries(v).filter(([id, p]) => id !== uid && fresh(p)).length < ROOM_CAP) pick = String(i);
    } else {
      const v = (await base.child("rooms/" + pick).once("value")).val() || {};
      if (Object.entries(v).filter(([id, p]) => id !== uid && fresh(p)).length >= ROOM_CAP) { B.toast("That room is full."); return join(""); }
    }
    if (stopped || mine !== joining) return;
    if (!pick) { note("Every room is full right now. Try again in a few minutes."); return; }
    room = pick; $("#lbRoom").value = pick;
    const ref = base.child(`rooms/${room}`), mineRef = ref.child(uid);
    await mineRef.onDisconnect().remove();
    if (stopped || mine !== joining) return;
    myRef = mineRef; await myRef.set(packMe());
    for (const ev of ["child_added", "child_changed"]) roomOffs.push(on(ref, ev, upsert));
    roomOffs.push(on(ref, "child_removed", s => { peers.delete(s.key); dropTag(s.key); who(); }));
    note(""); who();
  }

  /* one shared trade session, seen from side "a" (inviter) or "b" */
  function runSession(sid, role, partnerId, partnerName) {
    const ref = base.child("sessions/" + sid), other = role === "a" ? "b" : "a";
    let tradeId = "", finishing = false, accepting = false, watch = 0;
    const s = { role, partner: partnerName, bag: B.cards(), mine: [], theirs: [], myReady: "", theirReady: "", state: "open" };
    const dc = ref.child("state").onDisconnect(); dc.set("closed");
    let off = () => {};
    const finish = (msg, closeRemote) => {
      if (finishing) return; finishing = true;
      off(); clearInterval(watch); dc.cancel();
      if (closeRemote) ref.child("state").set("closed").catch(() => {});
      if (session === s) endSession(msg);
      if (role === "a") later(8000, () => ref.remove().catch(() => {}));
    };
    s.setCards = list => ref.child("offers/" + role).set({ cards: JSON.stringify(list.map(slim)), ready: "" }).catch(() => B.toast("Couldn't update the table."));
    s.setReady = v => ref.child(`offers/${role}/ready`).set(v);
    s.close = () => finish("", true);
    s.abort = () => { if (s.state === "open") finish("", true); else finish("You left during the swap. Check the Trade tab to see how it ended.", false); };
    /* side a: put cards in escrow as a normal Trade-tab offer aimed at the partner */
    s.lock = async sig => {
      if (s.state !== "open" || sig !== sigNow(s)) return;
      s.state = "sending"; renderTrade();
      const give = s.mine.slice(), get = s.theirs.slice();
      try {
        await ref.child("state").set("sending");
        tradeId = await B.sendOffer(partnerId, partnerName, give, get);
      } catch (e) { return finish(B.errorText(e), true); }
      await ref.child("tradeId").set(tradeId).catch(() => {});
      follow(25000);
    };
    /* both sides: watch the real trade record until it settles. Side a takes its cards back if it stalls. */
    function follow(limit) {
      const start = Date.now(); let busy = false;
      clearInterval(watch);
      watch = setInterval(async () => {
        if (busy) return; busy = true;
        const t = B.trade(tradeId);
        if (t && t.status !== "pending") {
          clearInterval(watch);
          if (t.status === "accepted") { s.state = "done"; if (session === s) renderTrade(); if (role === "b") ref.child("state").set("done").catch(() => {}); later(1500, () => finish(`Trade complete with ${partnerName}.`, false)); }
          else finish("The trade didn't go through. No cards changed hands.", false);
        } else if (role === "a" && Date.now() - start > limit) {
          await B.cancel(tradeId);
          if (Date.now() - start > limit + 8000) { clearInterval(watch); finish("The swap timed out. Check the Trade tab and cancel the offer if it is still there.", true); }
        } else if (role === "b" && Date.now() - start > limit + 10000) { clearInterval(watch); finish("The swap timed out. Check the Trade tab.", false); }
        busy = false;
      }, 700);
    }
    /* side b: accept ONLY if the real offer matches exactly what this player pressed Ready on */
    async function acceptIfExact(id) {
      if (accepting) return; accepting = true; tradeId = id;
      const agreed = s.myReady;
      for (let i = 0; i < 40 && !B.trade(id); i++) await new Promise(r => setTimeout(r, 300));
      const t = B.trade(id);
      if (!t || t.status !== "pending") return finish("The trade didn't arrive. Check the Trade tab.", true);
      if (!agreed || t.from !== partnerId || t.to !== uid || signature(t.offer, t.want) !== agreed) { await B.decline(id); return finish("Blocked: the offer didn't match what you agreed to. No cards changed hands.", true); }
      s.state = "sending"; if (session === s) renderTrade();
      await B.accept(id);
      follow(8000);
    }
    off = on(ref, "value", snap => {
      const v = snap.val();
      if (finishing) return;
      if (!v) return finish("The trade was closed.", false);
      const o = (v.offers || {})[other] || {};
      s.theirs = parseCards(o.cards); s.theirReady = o.ready || "";
      if (v.tradeId && role === "b") return void acceptIfExact(v.tradeId);
      if (v.state === "closed") {
        if (role === "a" && tradeId) return void B.cancel(tradeId); /* follow() reports the result */
        if (s.state === "open") return finish(`${partnerName} left the trade.`, false);
        if (role === "b" && !accepting) return finish(`${partnerName} left the trade.`, false);
        return;
      }
      if (role === "b" && v.state === "sending" && s.state === "open") { s.state = "sending"; clearInterval(s.timer); s.count = 0; renderTrade(); later(30000, () => { if (!accepting) finish("The swap timed out. Check the Trade tab.", true); }); return; }
      checkReady();
    });
    openSession(s);
    s.setCards([]);
  }

  return {
    practice: false,
    async start() {
      $("#lbRoom").innerHTML = Array.from({ length: ROOMS }, (_, i) => `<option value="${i+1}">${i+1}</option>`).join("");
      $("#lbRoomWrap").hidden = false;
      $("#lbRoom").onchange = e => { if (!session) join(e.target.value).catch(failed); else e.target.value = room; };
      B.watchTrades();
      on(db.ref(".info/serverTimeOffset"), "value", s => offset = s.val() || 0);
      const inbox = base.child("invites/" + uid);
      on(inbox, "child_added", async snap => {
        const from = snap.key, v = snap.val() || {}, ref = base.child("sessions/" + v.sid);
        const drop = () => inbox.child(from).remove().catch(() => {});
        const name = await nameFor(from);
        if (stopped) return;
        if (!name || !v.sid || now() - v.t > 30000) return drop();
        if (session || asking || pendingInvite || !B.tradeEnabled()) { ref.child("state").set("closed").catch(() => {}); return drop(); }
        asking = from; me.busy = true; this.publish(true);
        const answer = async yes => {
          clearTimeout(expire); asking = null; me.busy = false; drop();
          try {
            const sv = (await ref.once("value")).val();
            if (!sv || sv.state !== "invited" || sv.a !== from || sv.b !== uid) { if (yes) B.toast("That request expired."); return this.publish(true); }
            if (!yes || stopped) { await ref.child("state").set("closed"); return this.publish(true); }
            await ref.child("state").set("open");
            runSession(v.sid, "b", from, name);
          } catch { B.toast("Couldn't join that trade."); this.publish(true); }
        };
        const expire = later(25000, () => { ask(); answer(false); });
        ask(`<b>${esc(name)}</b> wants to trade with you.`, [["Trade", () => answer(true)], ["No thanks", () => answer(false)]]);
      });
      /* connection drops remove us from the room, so rejoin when it comes back */
      let wasDown = false;
      on(db.ref(".info/connected"), "value", s => { if (!s.val()) wasDown = true; else if (wasDown && room) { wasDown = false; join(room).catch(failed); } });
      await join("");
    },
    publish(force) {
      if (!myRef) return;
      const t = Date.now(); if (!force && t - sent < SEND_MS) return;
      const d = packMe(), k = JSON.stringify({ ...d, t: 0 });
      if (!force && k === lastSent && t - sent < BEAT_MS) return;
      sent = t; lastSent = k; myRef.set(d).catch(() => {});
    },
    tick() { this.publish(false); for (const [id, p] of peers) if (now() - p.seen > STALE_MS) { peers.delete(id); dropTag(id); who(); } },
    async invite(partnerId) {
      const p = peers.get(partnerId);
      if (!p || session || pendingInvite || asking) return;
      if (!B.tradeEnabled()) return B.toast("Trading is switched off for now.");
      if (B.openOffers() >= 10) return B.toast("You have 10 open offers. Cancel one in the Trade tab first.");
      const ref = base.child("sessions").push(), sid = ref.key, inbox = base.child(`invites/${partnerId}/${uid}`);
      let off = () => {}, timer = 0;
      const stop = (msg, close) => { if (!pendingInvite) return; pendingInvite = null; clearTimeout(timer); off(); inbox.remove().catch(() => {}); if (close) ref.child("state").set("closed").catch(() => {}); ask(); me.busy = false; this.publish(true); if (msg) B.toast(msg); };
      pendingInvite = () => stop("", true);
      me.busy = true; this.publish(true);
      try {
        await ref.set({ a: uid, b: partnerId, state: "invited", t: firebase.database.ServerValue.TIMESTAMP });
        await inbox.set({ sid, t: firebase.database.ServerValue.TIMESTAMP });
      } catch { return stop("Couldn't send the request.", false); }
      if (!pendingInvite) return;
      ask(`Asking <b>${esc(p.name)}</b> to trade…`, [["Cancel", () => stop("", true)]]);
      timer = later(28000, () => stop(`${p.name} didn't answer.`, true));
      off = on(ref.child("state"), "value", s => {
        if (!pendingInvite) return;
        if (s.val() === "open") { pendingInvite = null; clearTimeout(timer); off(); ask(); runSession(sid, "a", partnerId, p.name); }
        else if (s.val() === "closed") stop(`${p.name} can't trade right now.`, false);
      });
    },
    stop() { stopped = true; pendingInvite?.(); leaveRoom(); offs.forEach(f => f()); timers.forEach(clearTimeout); $("#lbRoomWrap").hidden = true; }
  };
}
function failed(e) { console.warn("lobby", e); note("Couldn't connect to the live lobby. Check your database URL and rules (SETUP.md)."); $("#lbWho").textContent = "Not connected"; }

async function connect() {
  const mine = ++gen;
  const practice = reason => { net = practiceNet(reason); net.start(); };
  const info = B.info();
  if (info.demo) return practice("You're in the demo.");
  if (!info.user || !info.handle) return practice("Sign in and finish your account to meet real players.");
  if (!LOBBY_DB_URL) return practice("Live multiplayer isn't set up yet.");
  if (!B.tradeEnabled()) return practice("Trading is switched off right now.");
  try {
    if (!firebase.database) await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js");
    if (mine !== gen) return;
    net = liveNet(firebase.app().database(LOBBY_DB_URL), info.user);
    me.color = colorFor(info.user.uid); me.rgb = null;
    await net.start();
  } catch (e) {
    if (mine !== gen) return;
    failed(e);
  }
}

async function loadModels() {
  if (!USE_BLENDER_MODELS) return;
  await Promise.all(["avatar", "table", "record"].map(async name => {
    try {
      const res = await fetch(`models/${name}.glb`); if (!res.ok) throw new Error(res.status);
      models[name] = R3.parseGLB(await res.arrayBuffer()).map(p => ({ ...p, mesh: gfx.mesh(p.data) }));
    } catch (e) { console.warn(`Lobby: using the built-in ${name} (couldn't load models/${name}.glb)`, e.message); }
  }));
}

/* ---------- open / close ---------- */
function open() {
  if (running) return;
  if (!gfx) {
    try { gfx = R3.create(canvas); } catch (e) { console.warn(e); }
    if (!gfx) return B.toast("This browser can't show 3D graphics (WebGL).");
    loadModels();
  }
  backScroll = window.scrollY; root.hidden = false; document.body.classList.add("noscroll", "lb-open");
  Object.assign(me, { x: (Math.random()-.5)*4, z: 5 + Math.random()*2, r: Math.PI, y: 0, vy: 0, busy: false, emote: null });
  cam.yaw = 0; nearId = null; $("#lbNear").hidden = true; $("#lbWho").textContent = "Connecting…";
  running = true; last = performance.now(); raf = requestAnimationFrame(frame);
  connect();
  canvas.setAttribute("tabindex", "-1"); canvas.focus();
}
function close() {
  if (!running) return;
  running = false; gen++; cancelAnimationFrame(raf);
  if (session) { if (session.abort) session.abort(); else session.close(); }
  endSession();
  net?.stop(); net = null;
  peers.clear(); tags.forEach(t => t.remove()); tags.clear(); keys.clear(); sticks.forEach(s => s.reset()); ask(); note("");
  root.hidden = true; document.body.classList.remove("noscroll", "lb-open"); window.scrollTo(0, backScroll);
}

/* ---------- input ---------- */
root.addEventListener("click", e => {
  e.stopPropagation(); /* keep lobby clicks away from the main site's handlers */
  const el = e.target.closest("[data-lb],[data-emote],[data-pick]"); if (!el) return;
  if (el.dataset.emote) return emote(el.dataset.emote);
  if (el.dataset.pick) return toggleCard(el.dataset.pick);
  const a = el.dataset.lb;
  if (a === "exit") close();
  else if (a === "jump") { if (!el.classList.contains("lb-jump") || e.detail === 0) jump(); }
  else if (a === "near" && nearId) net?.invite(nearId);
  else if (a === "leave") session?.close();
  else if (a === "ready" && session && session.state === "open") { const sig = sigNow(session); session.myReady = session.myReady === sig ? "" : sig; session.setReady(session.myReady); checkReady(); }
});
let drag = null;
canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", e => { if (!drag || e.pointerId !== drag.id) return; cam.yaw -= (e.clientX - drag.x)*.006; cam.pitch = clamp(cam.pitch + (e.clientY - drag.y)*.004, .15, 1.15); drag.x = e.clientX; drag.y = e.clientY; });
["pointerup","pointercancel"].forEach(ev => canvas.addEventListener(ev, () => drag = null));
canvas.addEventListener("wheel", e => { cam.dist = clamp(cam.dist + e.deltaY*.008, 4.5, 13); e.preventDefault(); }, { passive: false });
/* each joystick follows its own finger, so you can move and look at the same time */
function makeStick(pad, out) {
  const knob = pad.firstElementChild;
  let finger = null;
  const reset = () => { finger = null; out.x = out.y = 0; knob.style.transform = ""; };
  const move = e => {
    const r = pad.getBoundingClientRect(), reach = r.width*.34;
    let x = (e.clientX - r.left - r.width/2)/reach, y = (e.clientY - r.top - r.height/2)/reach;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    knob.style.transform = `translate(${x*reach}px,${y*reach}px)`;
    const dead = Math.hypot(x, y) < .15; /* ignore tiny thumb wobbles */
    out.x = dead || session ? 0 : x; out.y = dead || session ? 0 : y;
  };
  pad.addEventListener("pointerdown", e => { if (finger !== null) return; e.preventDefault(); finger = e.pointerId; pad.setPointerCapture(finger); move(e); });
  pad.addEventListener("pointermove", e => { if (e.pointerId === finger) move(e); });
  ["pointerup","pointercancel","lostpointercapture"].forEach(ev => pad.addEventListener(ev, e => { if (e.pointerId === finger) reset(); }));
  return { reset };
}
const sticks = [makeStick($("#lbStick"), stick), makeStick($("#lbLook"), look)];
/* Phones don't send a "click" for a second finger, so Jump reacts to the touch itself */
$(".lb-jump").addEventListener("pointerdown", e => { e.preventDefault(); jump(); });
root.addEventListener("contextmenu", e => e.preventDefault());
window.addEventListener("keydown", e => {
  if (!running) return;
  if (e.target.tagName === "SELECT") return;
  e.stopPropagation();
  const k = e.key.toLowerCase();
  if (k === "escape") { if (session) { if (session.state === "open") session.close(); } else close(); return; }
  if (session) return;
  if (k === "e" && nearId && !e.repeat) return net?.invite(nearId);
  if (k === " " && e.target.tagName !== "BUTTON") { e.preventDefault(); return jump(); }
  if (k.startsWith("arrow")) e.preventDefault();
  keys.add(k);
}, true);
window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => { keys.clear(); sticks.forEach(s => s.reset()); });
/* hidden tabs leave the room, so idle players don't use up the free connection limit */
let resume = false, hideTimer = 0;
document.addEventListener("visibilitychange", () => {
  clearTimeout(hideTimer);
  if (document.hidden && running) hideTimer = setTimeout(() => { if (!session) { resume = true; close(); } }, 60000);
  else if (!document.hidden && resume) { resume = false; open(); }
});

/* ---------- the new tab: added next to the existing ones ---------- */
function addTabs() {
  const allowed = B.tradeEnabled();
  document.querySelectorAll(".tabbar").forEach(bar => {
    const have = bar.querySelector("[data-lobby-tab]");
    if (!allowed) return have?.remove();
    if (have || !bar.children.length) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "tab"; b.dataset.lobbyTab = ""; b.textContent = "Lobby";
    b.addEventListener("click", open);
    const trade = bar.querySelector('[data-act="tab-trade"]');
    if (trade) trade.after(b); else bar.appendChild(b);
  });
}
const watcher = new MutationObserver(addTabs);
document.querySelectorAll(".tabbar").forEach(bar => watcher.observe(bar, { childList: true }));
addTabs();
window.StreamdexLobby = { open, close };
})();
