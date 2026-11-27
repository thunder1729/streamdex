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
const MAX_CARDS = 5, SEND_MS = 200, BEAT_MS = 15000, STALE_MS = 45000;
const ARENA = 12.5, SPEED = 4.6;
const EMOTES = { wave: "👋", yes: "👍", love: "🔥", trade: "🔁 Trade?", dance: "💃", laugh: "😂" };
/* admin settings (Admin > Multiplayer); safe defaults if the site doesn't provide them */
const cfg = () => { const c = { on: true, practiceOnly: false, trades: true, emotes: true, rooms: 5, cap: 12, note: "", arcade: true, arcadeCap: 150, arcadeRate: 100, ...(B.lobbyCfg ? B.lobbyCfg() : {}) }; c.games = { beat: true, match: true, catch: true, ...(c.games || {}) }; return c; };
const Arc = () => window.StreamdexArcade, arcadeOpen = () => !!(Arc() && Arc().isOpen());
const ROOMS = () => Math.max(1, Math.min(5, Math.round(+cfg().rooms) || 5)), ROOM_CAP = () => Math.max(2, Math.min(20, Math.round(+cfg().cap) || 12));
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
.lb-top,.lb-bottom,#lbStick{z-index:2}
.lb-load{position:absolute;inset:0;z-index:1;display:grid;place-content:center;justify-items:center;gap:22px;text-align:center;padding:24px;background:radial-gradient(ellipse at 50% 40%,#1a1f6b 0%,#0b0d2a 70%);transition:opacity .35s}
.lb-load.out{opacity:0;pointer-events:none}
.lb-disc{position:relative;width:124px;height:124px;border-radius:50%;background:repeating-radial-gradient(circle,#101018 0 3px,#1b1b28 3px 4px);box-shadow:0 0 0 3px #2230d8,0 0 50px rgba(34,48,216,.65);animation:lbspin 1.6s linear infinite}
.lb-disc::before{content:"";position:absolute;inset:38px;border-radius:50%;background:var(--orange,#ff5b1f)}
.lb-disc::after{content:"";position:absolute;inset:57px;border-radius:50%;background:#f4f0e8}
.lb-disc i{position:absolute;left:50%;top:6px;width:10px;height:22px;margin-left:-5px;border-radius:6px;background:rgba(244,240,232,.35)}
@keyframes lbspin{to{transform:rotate(360deg)}}
.lb-load h3{margin:0;font-size:22px}
.lb-load p{margin:0;font-size:15px;opacity:.75;min-height:1.4em}
.lb-bar{width:min(260px,70vw);height:6px;border-radius:99px;background:rgba(244,240,232,.14);overflow:hidden}
.lb-bar b{display:block;width:40%;height:100%;border-radius:99px;background:var(--orange,#ff5b1f);animation:lbbar 1.3s ease-in-out infinite}
@keyframes lbbar{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}
#lobby.lb-loading .lb-bottom,#lobby.lb-loading #lbStick,#lobby.lb-loading #lbWho,#lobby.lb-loading #lbRoomWrap{display:none!important}
@media (prefers-reduced-motion:reduce){.lb-disc,.lb-bar b{animation-duration:6s}}
.lb-ask,.lb-trade{z-index:2}
.lb-tag{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:4px;white-space:nowrap}
.lb-tag b{font-size:13px;padding:4px 10px;border-radius:99px;background:rgba(7,9,31,.78);border:1px solid rgba(244,240,232,.22)}
.lb-tag em{font-style:normal;font-size:20px;font-weight:700;padding:4px 12px;border-radius:14px;background:#f4f0e8;color:#0b0d2a}
.lb-top{position:absolute;left:0;right:0;top:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:calc(10px + env(safe-area-inset-top)) 12px 10px;pointer-events:none}
.lb-top>*{pointer-events:auto}
.lb-pill{font-size:14px;font-weight:650;padding:8px 14px;border-radius:99px;background:rgba(7,9,31,.8);border:1px solid rgba(244,240,232,.2);color:inherit}
.lb-top .lb-gap{flex:1}
.lb-notes{position:absolute;left:50%;transform:translateX(-50%);top:calc(62px + env(safe-area-inset-top));z-index:2;display:flex;flex-direction:column;align-items:center;gap:8px;width:max-content;max-width:calc(100% - 24px);pointer-events:none}
.lb-msg{text-align:center;font-size:14px;padding:8px 14px;border-radius:12px;background:rgba(34,48,216,.92);color:#f4f0e8;font-weight:650;border:1px solid rgba(244,240,232,.25)}
.lb-note{text-align:center;font-size:14px;padding:8px 14px;border-radius:12px;background:rgba(255,91,31,.94);color:#14060a;font-weight:650;}
.lb-bottom{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px 12px calc(14px + env(safe-area-inset-bottom));pointer-events:none}
.lb-bottom>*{pointer-events:auto}
.lb-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.lb-help{font-size:13px;opacity:.7;text-align:center;pointer-events:none}
#lbStick{position:absolute;left:18px;bottom:calc(104px + env(safe-area-inset-bottom));width:112px;height:112px;border-radius:50%;background:rgba(244,240,232,.08);border:1.5px solid rgba(244,240,232,.3);display:none}
#lbStick i{position:absolute;left:34px;top:34px;width:44px;height:44px;border-radius:50%;background:rgba(244,240,232,.7);pointer-events:none}
@media (pointer:coarse){#lbStick{display:block}.lb-help{display:none}}
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
.lb-coins b{font-variant-numeric:tabular-nums}
.lb-coins.pop{animation:lbpop .5s}
@keyframes lbpop{40%{transform:scale(1.25);background:#ffd34d;color:#14060a}}
.lb-play{background:#ffd34d!important;color:#14060a!important}
.lb-bag{display:grid;grid-auto-flow:column;grid-auto-columns:104px;gap:10px;overflow-x:auto;padding:5px;touch-action:pan-x;flex:none}
.lb-foot{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.lb-foot .st{margin-right:auto;font-size:14px;font-weight:650}
@media (max-width:620px){.lb-cards{grid-template-columns:repeat(2,1fr);min-height:90px}}
`;
const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
const root = document.createElement("div");
root.id = "lobby"; root.hidden = true;
root.setAttribute("role", "application"); root.setAttribute("aria-label", "Trading lobby");
root.innerHTML = `
<canvas id="lbCanvas"></canvas><div id="lbLabels"></div>
<div class="lb-load" id="lbLoad" role="status" aria-live="polite"><div class="lb-disc"><i></i></div><div><h3>Entering the lobby</h3><p id="lbLoadMsg">Connecting to the server…</p></div><div class="lb-bar"><b></b></div></div>
<div class="lb-top"><button class="btn sm ghost lb-pill" data-lb="exit">&larr; Back</button><span class="lb-pill" id="lbWho">Connecting…</span><span class="lb-pill lb-coins" id="lbCoins" hidden>🪙 <b>0</b></span><span class="lb-gap"></span>
  <label class="lb-pill" id="lbRoomWrap" hidden>Room <select id="lbRoom"></select></label></div>
<div class="lb-notes"><div class="lb-msg" id="lbMsg" hidden></div><div class="lb-note" id="lbNote" hidden></div></div>
<div id="lbStick" aria-hidden="true"><i></i></div>
<div class="lb-bottom">
  <button class="btn lb-play" data-lb="play" id="lbPlay" hidden></button>
  <button class="btn" data-lb="near" id="lbNear" hidden></button>
  <div class="lb-row">${Object.entries(EMOTES).map(([k, v]) => `<button class="lb-pill" data-emote="${k}">${v}</button>`).join("")}<button class="lb-pill" data-lb="arcade" id="lbArcadeBtn">🎮 Arcade</button><button class="lb-pill" data-lb="jump">Jump</button></div>
  <div class="lb-help">WASD or arrows to move · drag to look · E to trade or play · 1-6 emotes · Space to jump</div>
</div>
<div class="lb-ask" id="lbAsk" hidden role="alertdialog"></div>
<div class="lb-trade" id="lbTrade" hidden role="dialog" aria-label="Trade table"></div>`;
document.body.appendChild(root);
const canvas = $("#lbCanvas");
if (Arc()) Arc().mount(root, { cfg, onCoins: () => applyCfg(true) });

/* ---------- state ---------- */
let backScroll = 0, gfx = null, models = {}, running = false, raf = 0, last = 0, net = null, session = null, gen = 0;
const me = { x: 0, z: 6, r: Math.PI, y: 0, vy: 0, moving: false, emote: null, color: "#ff5b1f", name: "You" };
const peers = new Map(), keys = new Set(), stick = { x: 0, y: 0 };
const cam = { yaw: 0, pitch: .45, dist: 7.5 };
let nearId = null, nearCab = null;
const TABLES = [[-6,-3],[6,-3],[-6,5],[6,5]];
const SOLIDS = [[0,-2,2.4], ...TABLES.map(([x,z]) => [x,z,1.35])];

/* ---------- world ---------- */
const C = Object.fromEntries(Object.entries({ floor:"#171a4d", tile:"#1f2368", wall:"#121442", blue:"#2230d8", orange:"#ff5b1f", ink:"#07091f", vinyl:"#101018", paper:"#f4f0e8", pink:"#ff7ad9", gold:"#ffd34d", violet:"#c084ff", sky:"#62c8ff", mint:"#6ff0a0", wood:"#9a6b44", grass:"#4f9a7e", grass2:"#468f75", dirt:"#a46f58", dirt2:"#86594a", rock:"#7b8499", stone:"#8d95a8", stone2:"#6d758a", trunk:"#6b4a3a", pine:"#2f6b4a", pine2:"#3d8159", pine3:"#245a3f", water:"#2f93d6", water2:"#73c8f4", lamp:"#ffe45e", wood2:"#7a5638", plank:"#b98a5a", cloud:"#ffffff", pants:"#232a63", blush:"#ff9aa8", red:"#c2412a" }).map(([k, v]) => [k, rgb(v)]));
const CABS = [{ key: "beat", name: "Beat Tap", x: -5, z: -8.4, col: C.pink }, { key: "match", name: "Vinyl Match", x: 0, z: -8.8, col: C.gold }, { key: "catch", name: "Crate Catch", x: 5, z: -8.4, col: C.sky }];
CABS.forEach(c => SOLIDS.push([c.x, c.z, 1.0]));
/* Streamdex Island: a floating low-poly island with pines, a cliff backdrop, lamp posts and a pier */
const SKY = rgb("#7cc4f2"), ZMIN = -9.8;
const TREES = [[-11,-4,1.25],[-12.3,-.5,1],[-10.4,6.5,1.1],[-12,9.8,1.3],[11.4,-3.6,1.25],[12.4,.6,1],[10.6,7,1.1],[12,10,1.2],[3.8,12,1],[-5.8,12,.9],[-8.4,-8,1.1],[8.6,-7.8,1.15]];
const LAMPS = [[-3.4,6.2],[3.6,5.6],[-8.6,1],[8.6,1.4],[-2.4,-5.6],[2.6,-5.8]];
const ROCKS = [[-7.4,9.2,1],[7,10.2,.8],[-9.6,-3,.9],[9.4,-1.2,1.1],[1.4,10.4,.7],[-1,-9,.8]];
TREES.forEach(([x, z, s]) => SOLIDS.push([x, z, .42*s])); LAMPS.forEach(([x, z]) => SOLIDS.push([x, z, .28]));
const FLOWERS = Array.from({ length: 46 }, (_, i) => { const a = Math.sin(i*91.7)*43758.5453, b = Math.sin(i*37.1)*24634.6345; return [(a - Math.floor(a))*25 - 12.5, (b - Math.floor(b))*21 - 9.2, [C.pink, C.gold, C.paper, C.violet][i % 4]]; }).filter(([x, z]) => Math.hypot(x, z + 2) > 3.6 && !SOLIDS.some(([ox, oz, or]) => Math.hypot(x - ox, z - oz) < or + .5));
let live = null; /* settings, refreshed about once a second */
const cabsOn = () => { const c = live || cfg(); return c.arcade ? CABS.filter(b => c.games[b.key]) : []; };
function model(name, x, y, z, ry, tint) {
  const parts = models[name];
  if (!parts) return false;
  const m = M.trs(x, y, z, ry);
  for (const p of parts) gfx.draw(p.mesh, m, p.tint && tint ? tint : p.color, p.glow);
  return true;
}
function drawWorld(t) {
  const d = (s, x, y, z, sx, sy, sz, col, glow, ry = 0) => gfx.draw(s, M.trs(x, y, z, ry, sx, sy, sz), col, glow);
  /* sea, with drifting ripples */
  d("box", 0, -1.9, 0, 220, .2, 220, C.water);
  for (let i = 0; i < 22; i++) { const a = i*2.4, r = 19 + (i % 5)*4.2, x = Math.sin(a)*r + Math.sin(t*.4 + i)*1.4, z = Math.cos(a)*r; d("box", x, -1.78, z, 2.6 + (i % 3), .04, .14, C.water2, .5, a); }
  /* island body: grass cap, dirt layers, grey rock keel */
  d("box", 0, -.08, 0, 30, .16, 30, C.grass);
  for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) if (((i*7 + j*13) & 3) === 0) d("box", i*2, .005, j*2, 1.9, .02, 1.9, C.grass2);
  d("box", 0, -.95, 0, 30, 1.6, 30, C.dirt); d("box", 0, -1.45, 0, 30.4, .5, 30.4, C.dirt2); d("box", 0, -2.1, 0, 28.4, 1.0, 28.4, C.rock);
  /* cliff backdrop with a ladder, like a little ruin to explore */
  d("box", 0, 1.6, -12.8, 30, 3.2, 4.6, C.dirt); d("box", 0, 3.22, -12.8, 30.1, .16, 4.7, C.grass);
  d("box", -6, 4.4, -13.9, 11, 2.6, 2.6, C.dirt2); d("box", -6, 5.72, -13.9, 11.1, .14, 2.7, C.grass);
  d("box", 8, 3.9, -13.6, 9, 1.4, 3, C.dirt2); d("box", 8, 4.64, -13.6, 9.1, .14, 3.1, C.grass);
  d("box", -13.6, 1.2, -9, 3.4, 2.4, 3.4, C.rock);
  for (const x of [-9.1, -8.5]) d("box", x, 1.65, -10.45, .09, 3.3, .09, C.wood2);
  for (let i = 0; i < 9; i++) d("box", -8.8, .3 + i*.36, -10.45, .7, .07, .08, C.wood2);
  d("hex", 4, 4.7, -10.62, .09, 3.2, .09, C.wood2); d("box", 4.45, 6.2, -10.62, 1, .08, .08, C.wood2); d("box", 4.8, 5.8, -10.62, .5, .7, .06, C.plank);
  d("box", 3.9, 4.5, -10.4, .3, .3, .3, C.lamp, 1);
  /* centre stage: a stone podium with the spinning record */
  d("cyl", 0, .1, -2, 6.4, .2, 6.4, C.stone2); d("cyl", 0, .22, -2, 5.6, .12, 5.6, C.stone); d("cyl", 0, .3, -2, 5, .06, 5, C.blue);
  d("cyl", 0, .42, -2, 4.6, .06, 4.6, C.ink);
  if (!model("record", 0, .5, -2, t*.9)) {
    d("cyl", 0, .5, -2, 3.8, .1, 3.8, C.vinyl);
    d("cyl", 0, .556, -2, 1.3, .015, 1.3, C.orange);
    d("box", 0, .568, -2, 1.05, .012, .13, C.paper, .3, t*.9);
    d("cyl", 0, .6, -2, .14, .12, .14, C.paper);
  }
  [C.pink, C.gold, C.violet, C.sky].forEach((col, i) => { const a = t*.5 + i*Math.PI/2; d("box", Math.sin(a)*1.5, 2.2 + Math.sin(t*1.7+i)*.15, -2 + Math.cos(a)*1.5, .66, .92, .05, col, .55, a); });
  /* stepping stones from the spawn to the podium */
  for (let i = 0; i < 7; i++) d("box", Math.sin(i*1.7)*.35, .04, 7 - i*.7, 1.5, .08, .6, C.stone, 0, Math.sin(i*2.3)*.12);
  /* trading tables: tree-stump tables with stools */
  TABLES.forEach(([x, z]) => {
    if (model("table", x, 0, z, 0)) return;
    d("hex", x, .45, z, 1.0, .9, 1.0, C.wood2); d("cyl", x, .93, z, 2.3, .16, 2.3, C.plank); d("cyl", x, 1.03, z, 1.9, .03, 1.9, C.blue, .3);
    d("box", x-.3, 1.07, z, .32, .02, .46, C.gold, .6, .3); d("box", x+.34, 1.07, z+.1, .32, .02, .46, C.pink, .6, -.4);
    for (let k = 0; k < 3; k++) { const a = k*2.1 + x; d("hex", x + Math.sin(a)*1.75, .22, z + Math.cos(a)*1.75, .5, .44, .5, C.trunk); }
  });
  /* pines */
  const tree = (x, y, z, s) => {
    d("hex", x, y + .5*s, z, .46*s, 1.1*s, .46*s, C.trunk);
    d("cone", x, y + 1.55*s, z, 2.5*s, 1.6*s, 2.5*s, C.pine, 0, x); d("cone", x, y + 2.45*s, z, 2*s, 1.5*s, 2*s, C.pine2, 0, x + 1);
    d("cone", x, y + 3.3*s, z, 1.5*s, 1.4*s, 1.5*s, C.pine3, 0, x + 2); d("cone", x, y + 4*s, z, .9*s, 1.1*s, .9*s, C.pine2, 0, x + 3);
  };
  TREES.forEach(([x, z, s]) => tree(x, 0, z, s)); tree(-7, 5.7, -13.8, 1.1); tree(-3.5, 5.7, -14.2, .9); tree(9, 4.7, -14, 1);
  /* lamp posts, glowing a little */
  LAMPS.forEach(([x, z], i) => {
    d("box", x, .18, z, .55, .36, .55, C.stone); d("hex", x, 1.4, z, .16, 2.2, .16, C.wood2); d("box", x, 2.6, z, .36, .44, .36, C.lamp, 1); d("box", x, 2.88, z, .5, .1, .5, C.wood2);
    gfx.draw("ball", M.trs(x, 2.6, z, 0, 1.15 + Math.sin(t*2 + i)*.06), C.lamp, 1, .08);
  });
  /* fences along the edges */
  const fence = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len/1.8)), ry = -Math.atan2(z2 - z1, x2 - x1), mx = (x1 + x2)/2, mz = (z1 + z2)/2;
    for (let i = 0; i <= n; i++) d("box", x1 + (x2 - x1)*i/n, .5, z1 + (z2 - z1)*i/n, .22, 1, .22, C.wood2);
    d("box", mx, .78, mz, len, .14, .1, C.plank, 0, ry); d("box", mx, .4, mz, len, .14, .1, C.plank, 0, ry);
  };
  fence(-13.7, 4, -13.7, 13.7); fence(13.7, 4, 13.7, 13.7); fence(-13.7, 13.7, 4.6, 13.7); fence(11.4, 13.7, 13.7, 13.7);
  /* pier and a rowboat */
  for (let i = 0; i < 7; i++) d("box", 8, -.02, 14.9 + i*.75, 2.4, .1, .68, i & 1 ? C.plank : C.wood);
  for (let i = 0; i < 4; i++) { d("hex", 6.9, -.8, 15.2 + i*1.6, .22, 1.9, .22, C.wood2); d("hex", 9.1, -.8, 15.2 + i*1.6, .22, 1.9, .22, C.wood2); }
  d("box", 11, -1.72 + Math.sin(t*1.3)*.03, 17.6, 1.5, .4, 3, C.red, 0, .15); d("box", 11, -1.5 + Math.sin(t*1.3)*.03, 17.6, 1.1, .06, 2.6, C.plank, 0, .15);
  /* rocks, flowers */
  ROCKS.forEach(([x, z, s], i) => d("rock", x, .2*s, z, 1.1*s, .7*s, .95*s, i & 1 ? C.stone : C.rock, 0, i));
  FLOWERS.forEach(([x, z, col], i) => { d("box", x, .08, z, .03, .16, .03, C.pine2); d("ball", x, .2 + Math.sin(t*2 + i)*.01, z, .15, .15, .15, col, .15); });
  /* arcade cabinets, in front of the cliff */
  cabsOn().forEach((c, i) => {
    const pulse = .55 + Math.sin(t*3 + i*2)*.25, near = nearCab === c;
    d("box", c.x, 1.1, c.z, 1.5, 2.2, 1.0, C.ink);
    d("box", c.x, 2.4, c.z + .04, 1.56, .42, 1.06, c.col, near ? 1 : .8);
    d("box", c.x, 1.55, c.z + .51, 1.1, .8, .05, c.col, pulse + (near ? .3 : 0));
    d("box", c.x, 1.0, c.z + .42, 1.5, .1, .6, C.blue);
    d("ball", c.x - .32, 1.12, c.z + .55, .16, .16, .16, C.orange, .4);
    d("ball", c.x + .1, 1.08, c.z + .55, .13, .13, .13, C.paper);
    d("ball", c.x + .35, 1.08, c.z + .55, .13, .13, .13, C.mint, .5);
    d("ball", c.x, 3.1 + Math.sin(t*2 + i)*.12, c.z, .5, .5, .09, C.gold, .7, t*2.2);
  });
  /* sky: clouds drifting past */
  for (let i = 0; i < 9; i++) { const a = i*0.7 + t*.012, r = 52 + (i % 3)*8, x = Math.sin(a)*r, z = Math.cos(a)*r, y = 17 + (i % 4)*3; d("ball", x, y, z, 11, 3.4, 5, C.cloud, .6); d("ball", x + 4, y + .5, z + 1, 7, 3, 4, C.cloud, .6); d("ball", x - 4, y - .2, z - 1, 6, 2.6, 4, C.cloud, .6); }
}
/* ---------- avatars: blocky little music fans with real limbs and moods ---------- */
const SKINS = ["#f2c29a","#e0a070","#c68642","#8d5524","#f5cfb0","#b97a56"].map(rgb), HAIRS = ["#2b1b14","#6a3b1e","#f2c14e","#d94f70","#3d5be0","#1f1f2e","#e8e8f0"].map(rgb);
const hashOf = s => [...String(s)].reduce((h, c) => (h*31 + c.charCodeAt(0)) >>> 0, 7);
const MOODS = { wave: "happy", yes: "wink", love: "love", trade: "hope", dance: "dance", laugh: "laugh" };
const node = (parent, x, y, z, rx = 0, ry = 0, rz = 0) => M.mul(parent, M.mul(M.t(x, y, z), M.rot(rx, ry, rz)));
function drawAvatar(p, t) {
  const col = p.rgb || (p.rgb = rgb(p.color)), seed = p.seed ?? (p.seed = hashOf(p.id || p.color));
  const dt = Math.min(.05, Math.max(0, t - (p._t ?? t))); p._t = t;
  p.ph = (p.ph || 0) + (p.moving ? dt*11 : 0); p.amp = (p.amp || 0) + ((p.moving ? 1 : 0) - (p.amp || 0))*Math.min(1, dt*10);
  const em = p.emote && Date.now() - p.emote.at < 3000 ? p.emote.k : "", air = (p.y || 0) > .05;
  const mood = MOODS[em] || (p.busy ? "focus" : air ? "wow" : "idle");
  const amp = p.amp, ph = p.ph, dance = em === "dance", laugh = em === "laugh";
  const bounce = Math.abs(Math.sin(ph))*.07*amp + (dance ? Math.abs(Math.sin(t*9))*.14 : 0) + (laugh ? Math.sin(t*30)*.015 : 0) + Math.sin(t*2 + seed)*.01*(1 - amp);
  const y = (p.y || 0) + bounce;
  gfx.draw("cyl", M.trs(p.x, .015, p.z, 0, .95, .01, .95), C.ink, 1, .4);
  if (models.avatar) { /* custom Blender model: keep the simple floating hands */
    model("avatar", p.x, y, p.z, p.r, col);
    const s = Math.sin(p.r), c = Math.cos(p.r), at = (lx, ly, lz) => M.trs(p.x + lx*c + lz*s, y + ly, p.z - lx*s + lz*c, p.r, .22);
    gfx.draw("ball", at(-.52, .8, p.moving ? Math.sin(t*10)*.2 : 0), C.paper, 0); gfx.draw("ball", at(.52, .8, 0), C.paper, 0); return;
  }
  const skin = SKINS[seed % SKINS.length], hair = HAIRS[(seed >> 3) % HAIRS.length], style = (seed >> 6) % 3;
  const part = (n, shape, lx, ly, lz, sx, sy, sz, color, glow = 0) => gfx.draw(shape, M.mul(n, M.mul(M.t(lx, ly, lz), M.s(sx, sy, sz))), color, glow);
  const root = M.trs(p.x, y, p.z, p.r);
  /* pose */
  const sw = Math.sin(ph)*.75*amp, lean = .1*amp + (mood === "focus" ? .05 : 0), roll = Math.sin(ph)*.04*amp + (dance ? Math.sin(t*6)*.1 : 0);
  let aL = [sw, 0, 0], aR = [-sw, 0, 0], lL = sw, lR = -sw, hp = [Math.sin(ph*2)*.03*amp, 0, 0];
  if (air) { lL = -.5; lR = .35; aL = [0, 0, -2.4]; aR = [0, 0, 2.4]; }
  if (em === "wave") aR = [0, 0, 2.5 + Math.sin(t*14)*.35];
  if (em === "yes") { aR = [-1.9, 0, .15]; }
  if (em === "love") { aL = [-1.2, 0, -.45]; aR = [-1.2, 0, .45]; }
  if (em === "trade" || mood === "focus") { aL = [-1.15 + Math.sin(t*3)*.05, 0, -.18]; aR = [-1.15 + Math.sin(t*3 + 1)*.05, 0, .18]; }
  if (dance) { const q = Math.sin(t*9); aL = [0, 0, -(2.1 + q*.5)]; aR = [0, 0, 2.1 - q*.5]; lL = Math.sin(t*9)*.5; lR = -Math.sin(t*9)*.5; hp = [0, 0, Math.sin(t*6)*.1]; }
  if (laugh) { aL = [-.7, 0, -.5]; aR = [-.7, 0, .5]; hp = [Math.sin(t*30)*.04, 0, 0]; }
  if (!em && !air && !p.moving && mood !== "focus") { aL = [Math.sin(t*1.6 + seed)*.05, 0, -.06]; aR = [-Math.sin(t*1.6 + seed)*.05, 0, .06]; }
  /* legs */
  for (const [sgn, a] of [[-1, lL], [1, lR]]) {
    const leg = node(root, sgn*.15, .62, 0, a, 0, 0);
    part(leg, "box", 0, -.31, 0, .24, .62, .26, C.pants); part(leg, "box", 0, -.58, .05, .27, .13, .38, C.paper); part(leg, "box", 0, -.64, .05, .28, .04, .4, C.orange);
  }
  /* torso */
  const torso = node(root, 0, .62, 0, lean + hp[0], 0, roll + hp[2]);
  part(torso, "box", 0, .31, 0, .64, .62, .34, col); part(torso, "box", 0, .02, 0, .66, .08, .36, C.ink);
  gfx.draw("cyl", M.mul(node(torso, 0, .36, .175, Math.PI/2, 0, 0), M.s(.24, .02, .24)), C.ink, 0); gfx.draw("cyl", M.mul(node(torso, 0, .36, .19, Math.PI/2, 0, 0), M.s(.11, .02, .11)), C.orange, .5);
  /* arms */
  for (const [sgn, a] of [[-1, aL], [1, aR]]) {
    const arm = node(torso, sgn*.4, .56, 0, a[0], a[1], a[2]);
    part(arm, "box", 0, -.15, 0, .22, .3, .22, col); part(arm, "box", 0, -.42, 0, .19, .26, .19, skin);
    if (em === "yes" && sgn > 0) part(arm, "box", 0, -.5, .13, .07, .13, .07, skin);
  }
  /* head */
  const hr = laugh ? -.25 + Math.sin(t*30)*.05 : em === "trade" ? -.12 : mood === "focus" ? .08 : Math.sin(ph*2)*.03*amp;
  const head = node(torso, 0, .62, 0, hr, 0, dance ? Math.sin(t*6)*.15 : em === "wave" ? .08 : 0), hc = node(head, 0, .29, 0);
  part(hc, "box", 0, 0, 0, .56, .56, .52, skin);
  if (style === 1) { for (const x of [-.14, 0, .14]) part(hc, "cone", x, .38, 0, .2, .26, .2, hair); part(hc, "box", 0, .29, -.02, .58, .1, .54, hair); part(hc, "box", 0, 0, -.25, .58, .56, .08, hair); }
  else if (style === 2) { part(hc, "box", 0, .33, -.01, .62, .2, .58, col); part(hc, "ball", 0, .5, 0, .16, .16, .16, C.paper); part(hc, "box", 0, .05, -.25, .58, .5, .08, hair); }
  else { part(hc, "box", 0, .3, 0, .6, .14, .56, hair); part(hc, "box", 0, .02, -.25, .58, .56, .08, hair); part(hc, "box", -.29, .2, -.04, .05, .24, .4, hair); part(hc, "box", .29, .2, -.04, .05, .24, .4, hair); }
  part(hc, "box", 0, .38, 0, .66, .05, .13, C.ink); /* headphones */
  for (const x of [-1, 1]) { part(hc, "box", x*.32, .2, 0, .05, .36, .11, C.ink); part(hc, "ball", x*.33, -.02, 0, .13, .24, .26, C.orange, .15); part(hc, "ball", x*.38, -.02, 0, .06, .18, .2, C.ink); }
  /* face: changes with the emote */
  const fp = (lx, ly, sx, sy, color, rz = 0, glow = 0) => gfx.draw("box", M.mul(M.mul(hc, M.mul(M.t(lx, ly, .272), M.rot(0, 0, rz))), M.s(sx, sy, .03)), color, glow);
  const ball = (lx, ly, s, color, glow = 0) => gfx.draw("ball", M.mul(M.mul(hc, M.t(lx, ly, .275)), M.s(s, s, s*.5)), color, glow);
  const blink = ((t + seed % 7) % 3.6) < .12, ex = Math.sin(t*.7 + seed)*.012, E = C.ink, EY = .04;
  const eyes = (h = .12, up = 0) => { for (const x of [-.14, .14]) fp(x + ex, EY + up, .075, blink ? .015 : h, E); };
  const caret = x => { fp(x - .03, EY, .09, .032, E, .7); fp(x + .03, EY, .09, .032, E, -.7); };
  const chev = (x, dir) => { fp(x - dir*.02, EY + .035, .1, .032, E, -dir*.6); fp(x - dir*.02, EY - .035, .1, .032, E, dir*.6); };
  const heart = (x, k) => { ball(x - .028, EY + .02, .07*k, C.red, .6); ball(x + .028, EY + .02, .07*k, C.red, .6); fp(x, EY - .01, .055*k, .055*k, C.red, .785, .6); };
  const brow = (up, tilt) => { fp(-.14, .15 + up, .1, .026, hair, tilt); fp(.14, .15 + up, .1, .026, hair, -tilt); };
  const smile = (w = 1) => { fp(0, -.14, .1*w, .03, E); fp(-.07*w, -.115, .045, .03, E, .55); fp(.07*w, -.115, .045, .03, E, -.55); };
  const open = (w, h) => { fp(0, -.12, w, h, E); fp(0, -.12 + h/2 - .015, w*.85, .028, C.paper); fp(0, -.12 - h/2 + .02, w*.5, .035, C.pink); };
  const blush = () => { fp(-.21, -.06, .09, .05, C.blush); fp(.21, -.06, .09, .05, C.blush); };
  switch (mood) {
    case "happy": eyes(.13); brow(.03, 0); open(.2, .09); break;
    case "wink": eyes(.12); fp(.14, EY, .085, .028, E); smile(1.3); break;
    case "love": heart(-.14, 1 + Math.sin(t*8)*.12); heart(.14, 1 + Math.sin(t*8)*.12); open(.17, .08); blush(); break;
    case "hope": eyes(.15, .015); brow(.045, -.1); smile(.8); break;
    case "dance": caret(-.14); caret(.14); open(.22, .1); blush(); break;
    case "laugh": { chev(-.14, 1); chev(.14, -1); open(.26, .1 + Math.abs(Math.sin(t*30))*.05); const f = (t*1.3) % 1; ball(-.2, EY - .05 - f*.1, .045, C.sky); ball(.2, EY - .05 - f*.1, .045, C.sky); break; }
    case "focus": eyes(.09); brow(.0, .3); fp(0, -.14, .1, .026, E); break;
    case "wow": eyes(.17); brow(.05, 0); fp(0, -.13, .07, .09, E); break;
    default: eyes(.12); smile(1);
  }
}

/* ---------- labels ---------- */
const tags = new Map();
function setTag(id, p, isMe) {
  let el = tags.get(id);
  if (!el) { el = document.createElement("div"); el.className = "lb-tag"; el.innerHTML = "<em hidden></em><b></b>"; $("#lbLabels").appendChild(el); tags.set(id, el); }
  const s = gfx.project(p.x, 2.35 + (p.y || 0), p.z);
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
  if (arcadeOpen()) ix = iz = 0;
  if (keys.has("q")) cam.yaw -= 1.8*dt;
  if (keys.has("r")) cam.yaw += 1.8*dt;
  const len = Math.hypot(ix, iz);
  me.moving = len > .12;
  if (me.moving) {
    const k = SPEED*dt/Math.max(1, len), c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
    const dx = (ix*c + iz*s)*k, dz = (-ix*s + iz*c)*k;
    me.x = clamp(me.x + dx, -ARENA, ARENA); me.z = clamp(me.z + dz, ZMIN, ARENA);
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
  if (session || arcadeOpen() || !(live || cfg()).trades) best = null;
  let cab = null;
  if (!session && !arcadeOpen()) for (const c of cabsOn()) if (Math.hypot(me.x - c.x, me.z - c.z) < 2.7) { cab = c; break; }
  if (cab !== nearCab) { nearCab = cab; const pb = $("#lbPlay"); pb.hidden = !cab; if (cab) pb.textContent = "Play " + cab.name; }
  if (best !== nearId) { nearId = best; const b = $("#lbNear"); b.hidden = !best; if (best) b.textContent = "Trade with " + peers.get(best).name; }
  net?.tick?.(dt);
}
function frame(now) {
  if (!running) return;
  const dt = Math.min(.05, (now - last)/1000 || 0), t = now/1000; last = now;
  step(dt, t); applyCfg();
  if (gfx) {
    const cp = Math.cos(cam.pitch), target = [me.x, 1.2, me.z];
    gfx.begin([me.x + Math.sin(cam.yaw)*cp*cam.dist, 1.2 + Math.sin(cam.pitch)*cam.dist, me.z + Math.cos(cam.yaw)*cp*cam.dist], target, SKY);
    drawWorld(t);
    drawAvatar(me, t); setTag("_me", me, true);
    for (const [id, p] of peers) { drawAvatar(p, t); setTag(id, p, false); }
    const on = cabsOn(); CABS.forEach(c => on.includes(c) ? setTag("cab:" + c.key, { x: c.x, z: c.z, y: .85, name: "🎮 " + c.name }, false) : dropTag("cab:" + c.key));
  }
  raf = requestAnimationFrame(frame);
}

/* ---------- admin settings ---------- */
let cfgAt = 0;
function applyCfg(force) {
  const t = Date.now(); if (!force && t - cfgAt < 1000) return; cfgAt = t;
  const c = cfg();
  if (!c.on) { B.toast("The lobby is closed for now."); close(); return; }
  const m = $("#lbMsg"), txt = String(c.note || "").slice(0, 120);
  if (m.textContent !== txt) m.textContent = txt;
  m.hidden = !txt;
  root.querySelectorAll("[data-emote]").forEach(b => b.hidden = !c.emotes);
  live = c; $("#lbArcadeBtn").hidden = !(c.arcade && Object.values(c.games).some(Boolean));
  if (!c.arcade && arcadeOpen()) Arc().close();
  const info = B.info(), earn = !!(info.user && info.handle && !info.demo), pill = $("#lbCoins"), amt = B.coins ? B.coins() : 0;
  pill.hidden = !earn || !c.arcade;
  if (pill.lastChild.textContent !== amt.toLocaleString()) { if (pill.lastChild.textContent !== "0") { pill.classList.remove("pop"); void pill.offsetWidth; pill.classList.add("pop"); } pill.lastChild.textContent = amt.toLocaleString(); }
}

/* ---------- loading screen ---------- */
let loadAt = 0, loadTimer = 0;
function loading(on, msg) {
  const el = $("#lbLoad"); clearTimeout(loadTimer);
  if (on) { loadAt = Date.now(); el.hidden = false; el.classList.remove("out"); root.classList.add("lb-loading"); loadMsg(msg || "Connecting to the server…"); return; }
  const wait = Math.max(0, 700 - (Date.now() - loadAt)); /* never flash by too fast to read */
  loadTimer = setTimeout(() => { root.classList.remove("lb-loading"); el.classList.add("out"); loadTimer = setTimeout(() => { el.hidden = true; }, 380); }, wait);
}
function loadMsg(t) { const m = $("#lbLoadMsg"); if (m && !$("#lbLoad").hidden) m.textContent = t; }

/* ---------- shared UI ---------- */
function note(text) { const n = $("#lbNote"); n.hidden = !text; n.textContent = text || ""; }
function who() { const n = peers.size + 1; $("#lbWho").textContent = net?.practice ? "Practice room" : `Live · ${n} ${n === 1 ? "person" : "people"} here`; }
function ask(html, buttons) {
  const a = $("#lbAsk");
  if (!html) { a.hidden = true; a.innerHTML = ""; return; }
  a.innerHTML = `<p>${html}</p><div class="lb-row">${buttons.map((b, i) => `<button class="btn sm ${i ? "ghost" : ""}" data-ans="${i}">${esc(b[0])}</button>`).join("")}</div>`;
  a.hidden = false;
  a.onclick = e => { const b = e.target.closest("[data-ans]"); if (!b) return; ask(); buttons[+b.dataset.ans][1](); };
}
function emote(k) { if (!cfg().emotes) return; me.emote = { k, at: Date.now() }; net?.publish(true); }
function jump() { if (!me.y && !session) { me.vy = 5; me.jumpAt = Date.now(); net?.publish(true); } }

/* ---------- trade table (same UI for live and practice) ----------
   A "ready" is a fingerprint of BOTH sides. If anyone changes a card, the old ready no longer matches. */
const slim = c => ({ id: c.id, raw: c.raw || c.id.replace(/^t:/, ""), name: c.name, artist: c.artist, niche: c.niche, plays: c.plays || 0, pop: c.pop || 0, affPct: c.affPct || 0, type: c.type || "Normal", no: c.no || 0, miss: !!c.miss, art: c.art || "" });
const key = list => list.map(c => [c.id, c.name, c.artist, c.niche].join("\u0001")).sort().join("\u0002");
const signature = (aCards, bCards) => key(aCards) + "\u0003" + key(bCards);
const parseCards = s => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a.slice(0, MAX_CARDS).filter(c => c && typeof c.id === "string" && typeof c.niche === "number" && c.niche >= 0 && c.niche <= 100).map(c => slim({ ...c, art: /^(https:|data:image\/)/.test(c.art || "") ? c.art : "" })) : []; } catch { return []; } };

function openSession(s) { /* s: {role, partner, mine:[], theirs:[], myReady, theirReady, state, setCards, setReady, close, lock} */
  session = s; me.busy = true; keys.clear(); stick.x = stick.y = 0; ask();
  net.publish(true); renderTrade();
}
function endSession(message) {
  if (!session) return;
  clearInterval(session.timer);
  session = null; me.busy = false;
  const t = $("#lbTrade"); t.hidden = true; t.innerHTML = "";
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
    p.name = name; p.tx = clamp(+v.x || 0, -ARENA, ARENA); p.tz = clamp(+v.z || 0, ZMIN, ARENA); p.tr = +v.r || 0; p.busy = !!v.b; p.seen = v.t;
    if (v.e && v.e !== p.eRaw) { p.eRaw = v.e; p.emote = { k: v.e.split(":")[0], at: Date.now() }; }
    if (v.j && v.j !== p.jRaw) { p.jRaw = v.j; p.jumpAt = Date.now(); }
    who();
  }
  async function join(wanted) {
    const mine = ++joining;
    leaveRoom();
    let pick = wanted;
    if (!pick) for (let i = 1; i <= ROOMS() && !pick; i++) {
      const v = (await base.child("rooms/" + i).once("value")).val() || {};
      if (Object.entries(v).filter(([id, p]) => id !== uid && fresh(p)).length < ROOM_CAP()) pick = String(i);
    } else {
      const v = (await base.child("rooms/" + pick).once("value")).val() || {};
      if (Object.entries(v).filter(([id, p]) => id !== uid && fresh(p)).length >= ROOM_CAP()) { B.toast("That room is full."); return join(""); }
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
      $("#lbRoom").innerHTML = Array.from({ length: ROOMS() }, (_, i) => `<option value="${i+1}">${i+1}</option>`).join("");
      $("#lbRoomWrap").hidden = false;
      $("#lbRoom").onchange = e => { if (!session) { loading(true, "Switching rooms…"); join(e.target.value).then(() => loading(false)).catch(failed); } else e.target.value = room; };
      B.watchTrades();
      on(db.ref(".info/serverTimeOffset"), "value", s => offset = s.val() || 0);
      const inbox = base.child("invites/" + uid);
      on(inbox, "child_added", async snap => {
        const from = snap.key, v = snap.val() || {}, ref = base.child("sessions/" + v.sid);
        const drop = () => inbox.child(from).remove().catch(() => {});
        const name = await nameFor(from);
        if (stopped) return;
        if (!name || !v.sid || now() - v.t > 30000) return drop();
        if (session || asking || pendingInvite || !B.tradeEnabled() || !cfg().trades) { ref.child("state").set("closed").catch(() => {}); return drop(); }
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
      if (!B.tradeEnabled() || !cfg().trades) return B.toast("Trading is switched off for now.");
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
function failed(e) { loading(false); console.warn("lobby", e); note("Couldn't connect to the live lobby. Check your database URL and rules (SETUP.md)."); $("#lbWho").textContent = "Not connected"; }

async function connect() {
  const mine = ++gen;
  const practice = reason => { net = practiceNet(reason); net.start(); loading(false); };
  loadMsg("Connecting to the server…");
  const info = B.info();
  if (info.demo) return practice("You're in the demo.");
  if (!info.user || !info.handle) return practice("Sign in and finish your account to meet real players.");
  if (!LOBBY_DB_URL) return practice("Live multiplayer isn't set up yet.");
  if (!B.tradeEnabled()) return practice("Trading is switched off right now.");
  if (cfg().practiceOnly) return practice("The live lobby is paused right now.");
  try {
    if (!firebase.database) await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js");
    if (mine !== gen) return;
    net = liveNet(firebase.app().database(LOBBY_DB_URL), info.user);
    me.color = colorFor(info.user.uid); me.rgb = null;
    loadMsg("Finding a room…");
    await net.start();
    if (mine === gen) loading(false);
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
  if (!cfg().on) return B.toast("The lobby is closed for now.");
  if (!gfx) {
    try { gfx = R3.create(canvas); } catch (e) { console.warn(e); }
    if (!gfx) return B.toast("This browser can't show 3D graphics (WebGL).");
    loadModels();
  }
  backScroll = window.scrollY; root.hidden = false; document.body.classList.add("noscroll", "lb-open");
  Object.assign(me, { x: (Math.random()-.5)*4, z: 5 + Math.random()*2, r: Math.PI, y: 0, vy: 0, busy: false, emote: null });
  applyCfg(true); cam.yaw = 0; nearId = null; $("#lbNear").hidden = true; $("#lbWho").textContent = "Connecting…"; loading(true);
  running = true; last = performance.now(); raf = requestAnimationFrame(frame);
  connect();
  canvas.setAttribute("tabindex", "-1"); canvas.focus();
}
function close() {
  if (!running) return;
  running = false; gen++; cancelAnimationFrame(raf);
  Arc()?.close();
  if (session) { if (session.abort) session.abort(); else session.close(); }
  endSession();
  net?.stop(); net = null;
  peers.clear(); tags.forEach(t => t.remove()); tags.clear(); keys.clear(); stick.x = stick.y = 0; ask(); note("");
  clearTimeout(loadTimer); $("#lbLoad").hidden = true; root.classList.remove("lb-loading");
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
  else if (a === "jump") jump();
  else if (a === "near" && nearId) net?.invite(nearId);
  else if (a === "play" && nearCab) Arc()?.open(nearCab.key);
  else if (a === "arcade" && !session) Arc()?.open();
  else if (a === "leave") session?.close();
  else if (a === "ready" && session && session.state === "open") { const sig = sigNow(session); session.myReady = session.myReady === sig ? "" : sig; session.setReady(session.myReady); checkReady(); }
});
let drag = null;
canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", e => { if (!drag || e.pointerId !== drag.id) return; cam.yaw -= (e.clientX - drag.x)*.006; cam.pitch = clamp(cam.pitch + (e.clientY - drag.y)*.004, .15, 1.15); drag.x = e.clientX; drag.y = e.clientY; });
["pointerup","pointercancel"].forEach(ev => canvas.addEventListener(ev, () => drag = null));
canvas.addEventListener("wheel", e => { cam.dist = clamp(cam.dist + e.deltaY*.008, 4.5, 13); e.preventDefault(); }, { passive: false });
const pad = $("#lbStick"); let padId = null;
const padMove = e => { const r = pad.getBoundingClientRect(); let x = (e.clientX - r.left - r.width/2)/40, y = (e.clientY - r.top - r.height/2)/40; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } stick.x = session || arcadeOpen() ? 0 : x; stick.y = session || arcadeOpen() ? 0 : y; pad.firstElementChild.style.transform = `translate(${x*34}px,${y*34}px)`; };
pad.addEventListener("pointerdown", e => { padId = e.pointerId; pad.setPointerCapture(padId); padMove(e); });
pad.addEventListener("pointermove", e => { if (e.pointerId === padId) padMove(e); });
["pointerup","pointercancel"].forEach(ev => pad.addEventListener(ev, () => { padId = null; stick.x = stick.y = 0; pad.firstElementChild.style.transform = ""; }));
window.addEventListener("keydown", e => {
  if (!running) return;
  if (e.target.tagName === "SELECT") return;
  e.stopPropagation();
  const k = e.key.toLowerCase();
  if (k === "escape") { if (arcadeOpen()) return; if (session) { if (session.state === "open") session.close(); } else close(); return; }
  if (session || arcadeOpen()) return;
  if (k === "e" && !e.repeat && nearCab) return Arc().open(nearCab.key);
  if (k === "e" && nearId && !e.repeat) return net?.invite(nearId);
  if (/^[1-9]$/.test(k) && !e.repeat) { const em = Object.keys(EMOTES)[+k - 1]; if (em) return emote(em); }
  if (k === " " && e.target.tagName !== "BUTTON") { e.preventDefault(); return jump(); }
  if (k.startsWith("arrow")) e.preventDefault();
  keys.add(k);
}, true);
window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => { keys.clear(); stick.x = stick.y = 0; });
/* hidden tabs leave the room, so idle players don't use up the free connection limit */
let resume = false, hideTimer = 0;
document.addEventListener("visibilitychange", () => {
  clearTimeout(hideTimer);
  if (document.hidden && running) hideTimer = setTimeout(() => { if (!session) { resume = true; close(); } }, 60000);
  else if (!document.hidden && resume) { resume = false; open(); }
});

/* ---------- the new tab: added next to the existing ones ---------- */
function addTabs() {
  const allowed = B.tradeEnabled() && cfg().on;
  document.querySelectorAll(".tabbar").forEach(bar => {
    const have = bar.querySelector("[data-lobby-tab]");
    if (!allowed) return have?.remove();
    if (have || !bar.children.length) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "tab"; b.dataset.lobbyTab = ""; b.dataset.tip = "Lobby"; b.setAttribute("aria-label", "Lobby");
    b.innerHTML = '<svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.4 0 4 1.8 4 4.5"/></svg>';
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
