/**
 * Renders the self contained live office page. All CSS, the avatar sprite and
 * the client script are inlined into the single GET / response, so the office
 * app exposes no static asset endpoints beyond the approved scope.
 */

const STYLE = `
:root {
  --bg: oklch(0.16 0.014 265);
  --panel: oklch(0.205 0.015 265);
  --panel-2: oklch(0.25 0.02 265);
  --border: oklch(0.33 0.02 265);
  --border-soft: oklch(0.28 0.015 265);
  --text: oklch(0.95 0.008 265);
  --muted: oklch(0.68 0.02 265);
  --floor: oklch(0.225 0.012 265);
  --floor-line: oklch(0.30 0.012 265);
  --accent: oklch(0.72 0.14 250);
  --running: oklch(0.80 0.13 195);
  --idle: oklch(0.84 0.13 95);
  --paused: oklch(0.80 0.15 65);
  --error: oklch(0.70 0.19 25);
  --done: oklch(0.80 0.15 150);
  --todo: oklch(0.74 0.13 255);
  --in-progress: oklch(0.72 0.15 275);
  --in-review: oklch(0.74 0.15 300);
  --blocked: oklch(0.70 0.19 25);
  --radius: 10px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.page { max-width: 1280px; margin: 0 auto; padding: 24px 20px 48px; }
.topbar { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 20px; margin-bottom: 6px; }
.topbar h1 { font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
.topbar .logo { color: var(--accent); margin-right: 6px; }
.live-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border-soft); background: var(--panel); }
.live-badge .pulse { width: 9px; height: 9px; border-radius: 999px; background: var(--idle); }
.live-badge[data-state="live"] .pulse { background: var(--running); box-shadow: 0 0 0 0 oklch(0.80 0.13 195 / 0.7); animation: pulse 2s infinite; }
.live-badge[data-state="down"] .pulse { background: var(--error); }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 oklch(0.80 0.13 195 / 0.55); } 70% { box-shadow: 0 0 0 9px oklch(0.80 0.13 195 / 0); } 100% { box-shadow: 0 0 0 0 oklch(0.80 0.13 195 / 0); } }
.meta { color: var(--muted); font-size: 13px; margin: 0 0 18px; }
.meta code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--text); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0 0 18px; padding: 10px 14px; border: 1px solid var(--border-soft); border-radius: var(--radius); background: var(--panel); font-size: 12px; color: var(--muted); }
.legend .item { display: inline-flex; align-items: center; gap: 6px; }
.legend .dot { width: 9px; height: 9px; border-radius: 999px; display: inline-block; }
.floorplan {
  position: relative;
  width: 100%;
  aspect-ratio: 1200 / 820;
  background:
    linear-gradient(var(--floor-line) 1px, transparent 1px) 0 0 / 40px 40px,
    linear-gradient(90deg, var(--floor-line) 1px, transparent 1px) 0 0 / 40px 40px,
    var(--floor);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: visible;
}
.room { position: absolute; background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.15); }
.room-label { position: absolute; top: 6px; left: 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: var(--muted); text-transform: uppercase; white-space: nowrap; }
.window { position: absolute; top: 0; left: 0; width: 100%; height: 54px; background: linear-gradient(180deg, oklch(0.42 0.07 240), oklch(0.30 0.05 250)); border-bottom: 2px solid var(--border); border-radius: 13px 13px 0 0; overflow: hidden; }
.window::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 118px, oklch(0.16 0.014 265 / 0.55) 118px 124px); }
.window-label { position: absolute; left: 12px; bottom: 4px; font-size: 10px; letter-spacing: 0.14em; color: oklch(0.9 0.02 240); text-transform: uppercase; }
.door { position: absolute; width: 34px; height: 8px; background: oklch(0.85 0.02 250); border-radius: 2px; box-shadow: 0 0 0 2px oklch(0.16 0.014 265 / 0.5); }
.view-window { position: absolute; right: 0; top: 0; width: 26px; height: 100%; background: linear-gradient(180deg, oklch(0.45 0.07 240), oklch(0.32 0.05 250)); border-radius: 0 13px 13px 0; }
.desk { position: absolute; width: 74px; height: 30px; background: oklch(0.42 0.03 55); border: 1px solid oklch(0.30 0.03 55); border-radius: 4px; transform: translate(-50%, -50%); }
.monitor { position: absolute; width: 34px; height: 20px; background: oklch(0.30 0.02 265); border: 1px solid oklch(0.45 0.05 250); border-radius: 3px; transform: translate(-50%, -50%); }
.monitor::after { content: ""; position: absolute; left: 50%; bottom: -6px; width: 10px; height: 6px; background: oklch(0.35 0.02 265); transform: translateX(-50%); }
.sofa { position: absolute; width: 96px; height: 34px; background: oklch(0.42 0.05 20); border: 1px solid oklch(0.30 0.04 20); border-radius: 8px; transform: translate(-50%, -50%); }
.sofa::before { content: ""; position: absolute; inset: 4px 8px; border-radius: 5px; background: oklch(0.48 0.05 20); }
.plant { position: absolute; width: 22px; height: 22px; background: oklch(0.45 0.10 150); border-radius: 50% 50% 45% 45%; transform: translate(-50%, -50%); box-shadow: 0 0 0 3px oklch(0.30 0.05 150 / 0.5); }
.coffee { position: absolute; width: 26px; height: 34px; background: oklch(0.35 0.02 265); border: 1px solid var(--border); border-radius: 5px; transform: translate(-50%, -50%); }
.coffee::after { content: ""; position: absolute; left: 50%; top: 6px; width: 12px; height: 10px; background: oklch(0.75 0.13 65); border-radius: 2px; transform: translateX(-50%); }
.screen { position: absolute; width: 150px; height: 16px; background: oklch(0.30 0.05 250); border: 1px solid oklch(0.50 0.08 250); border-radius: 3px; transform: translate(-50%, -50%); box-shadow: 0 0 18px oklch(0.55 0.10 250 / 0.5); }
.rug { position: absolute; width: 120px; height: 60px; border-radius: 50%; background: oklch(0.30 0.04 300 / 0.5); transform: translate(-50%, -50%); }
.agent { position: absolute; transform: translate(-50%, -50%); width: 104px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 0; border: 0; background: transparent; color: var(--text); font: inherit; cursor: pointer; z-index: 20; transition: left 0.9s ease, top 0.9s ease; }
.agent:hover, .agent:focus-visible { z-index: 60; }
.agent:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 12px; }
.avatar { width: 64px; height: 64px; display: block; filter: drop-shadow(0 8px 10px oklch(0 0 0 / 0.5)); }
.avatar svg { width: 100%; height: 100%; display: block; }
.name { font-size: 12px; font-weight: 600; background: oklch(0.16 0.014 265 / 0.82); padding: 1px 7px; border-radius: 999px; border: 1px solid var(--border-soft); white-space: nowrap; }
.plaque { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; color: var(--muted); background: oklch(0.16 0.014 265 / 0.82); padding: 0 6px; border-radius: 4px; border: 1px solid var(--border-soft); }
.badge { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 6px; border-radius: 999px; }
.badge-review { background: oklch(0.74 0.15 300 / 0.22); color: var(--in-review); border: 1px solid oklch(0.74 0.15 300 / 0.5); }
.badge-blocked { background: oklch(0.70 0.19 25 / 0.22); color: var(--blocked); border: 1px solid oklch(0.70 0.19 25 / 0.5); }
.status-dot { position: absolute; top: 2px; right: 18px; width: 11px; height: 11px; border-radius: 999px; border: 2px solid var(--bg); }
.agent[data-card="below"] .card { bottom: auto; top: calc(100% + 10px); }
.card { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%) translateY(4px); width: min(260px, 72vw); display: flex; flex-direction: column; gap: 3px; text-align: left; background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; box-shadow: 0 16px 34px oklch(0 0 0 / 0.55); opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.14s ease, transform 0.14s ease; }
.agent[data-edge="right"] .card { left: auto; right: -12px; transform: translateY(4px); }
.agent[data-edge="left"] .card { left: -12px; transform: translateY(4px); }
.agent:hover .card, .agent:focus-visible .card { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }
.agent[data-edge="right"]:hover .card, .agent[data-edge="right"]:focus-visible .card,
.agent[data-edge="left"]:hover .card, .agent[data-edge="left"]:focus-visible .card { transform: translateY(0); }
.card-name { font-size: 13px; font-weight: 700; }
.card-role { font-size: 11px; color: var(--muted); }
.card-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); }
.card-row .dot { width: 8px; height: 8px; border-radius: 999px; display: inline-block; flex: none; }
.card-task { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; }
.card-note { font-size: 12px; color: var(--text); opacity: 0.9; border-top: 1px solid var(--border-soft); padding-top: 6px; margin-top: 3px; }
.ticker-wrap { margin-top: 22px; border: 1px solid var(--border-soft); border-radius: var(--radius); background: var(--panel); padding: 12px 14px; }
.ticker-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.ticker-head h2 { font-size: 14px; font-weight: 700; margin: 0; }
.ticker-head .hint { font-size: 11px; color: var(--muted); }
.ticker { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow: auto; display: flex; flex-direction: column; }
.event { display: grid; grid-template-columns: 68px 120px 1fr; gap: 10px; padding: 5px 2px; border-top: 1px solid var(--border-soft); font-size: 12px; }
.event:first-child { border-top: 0; }
.event time { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); }
.event-agent { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.event-message { color: var(--text); }
.event[data-kind="secret"] { display: none; }
.ticker-empty { color: var(--muted); font-size: 12px; }
footer { margin-top: 20px; color: var(--muted); font-size: 12px; }
footer code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text); }
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
@media (max-width: 720px) {
  .avatar { width: 46px; height: 46px; }
  .name { font-size: 10px; }
  .plaque, .badge { font-size: 8px; }
  .agent { width: 74px; }
  .event { grid-template-columns: 58px 90px 1fr; }
}
`;

function pctX(x) {
  return `${((x / 1200) * 100).toFixed(3)}%`;
}
function pctY(y) {
  return `${((y / 820) * 100).toFixed(3)}%`;
}
function roomBox(x, y, w, h, extra = "") {
  return `left:${pctX(x)};top:${pctY(y)};width:${((w / 1200) * 100).toFixed(3)}%;height:${((h / 820) * 100).toFixed(3)}%;${extra}`;
}
function point(x, y, extra = "") {
  return `left:${pctX(x)};top:${pctY(y)};${extra}`;
}

export function renderPage({ avatarsJson, clientJs, initialStateJson, pollMs }) {
  const safeAvatars = avatarsJson.replace(/</g, "\\u003c");
  const safeInitial = (initialStateJson ?? "null").replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WebWright Virtual Office — Live</title>
<meta name="description" content="A live, overhead 2D view of the WebWright team, placed and posed from real Paperclip control plane state.">
<meta name="color-scheme" content="dark">
<style>${STYLE}</style>
</head>
<body>
<div class="page">
  <header>
    <div class="topbar">
      <h1><span class="logo" aria-hidden="true">&#9670;</span>WebWright Virtual Office</h1>
      <span class="live-badge" id="live-status" data-state="connecting"><span class="pulse"></span><span id="live-status-text">Connecting…</span></span>
    </div>
    <p class="meta">Live view from the Paperclip control plane. Last snapshot <time id="live-stamp" datetime="">—</time>. Updates every <span id="poll-interval">few</span> seconds; positions reflect real state, not a rendered script.</p>
    <div class="legend" aria-label="Legend">
      <span class="item"><span class="dot" style="background:var(--running)"></span>Running</span>
      <span class="item"><span class="dot" style="background:var(--idle)"></span>Idle</span>
      <span class="item"><span class="dot" style="background:var(--paused)"></span>Paused</span>
      <span class="item"><span class="dot" style="background:var(--error)"></span>Error / blocked</span>
      <span class="item">At a desk: active task (working) or review (thinking)</span>
      <span class="item">Break room: idle or paused</span>
      <span class="item">Coffee machine: blocked</span>
    </div>
  </header>
  <main>
    <section aria-labelledby="floorplan-title">
      <h2 id="floorplan-title" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;">Overhead office floor plan</h2>
      <div class="floorplan">
        <div class="window"><span class="window-label">Front window</span></div>
        <div class="door" style="left:6.5%;top:2.2%" title="Entrance"></div>

        <div class="room" style="${roomBox(700, 70, 470, 170)}">
          <span class="room-label">Sienna's outreach lounge</span>
          <div class="rug" style="${point(935, 150)}"></div>
          <div class="sofa" style="${point(1075, 200)}"></div>
        </div>

        <div class="room" style="${roomBox(40, 255, 330, 175)}">
          <span class="room-label">Clara's ops room and board</span>
          <div class="desk" style="${point(205, 340)}"></div>
          <div class="monitor" style="${point(205, 336)}"></div>
        </div>

        <div class="room" style="${roomBox(410, 255, 420, 175)}">
          <span class="room-label">Break room</span>
          <div class="coffee" style="${point(786, 288)}" title="Coffee machine"></div>
          <div class="sofa" style="${point(475, 388)}"></div>
          <div class="plant" style="${point(802, 402)}"></div>
        </div>

        <div class="room" style="${roomBox(40, 455, 1120, 150)}">
          <span class="room-label">Engineering wing</span>
          <div class="desk" style="${point(170, 540)}"></div>
          <div class="monitor" style="${point(170, 536)}"></div>
          <div class="desk" style="${point(600, 540)}"></div>
          <div class="monitor" style="${point(600, 536)}"></div>
          <div class="desk" style="${point(1030, 540)}"></div>
          <div class="monitor" style="${point(1030, 536)}"></div>
        </div>

        <div class="room" style="${roomBox(40, 635, 330, 160)}">
          <span class="room-label">Nora's quality lab</span>
          <div class="desk" style="${point(205, 720)}"></div>
          <div class="monitor" style="${point(205, 716)}"></div>
        </div>

        <div class="room" style="${roomBox(410, 635, 420, 160)}">
          <span class="room-label">Standup nook</span>
          <div class="screen" style="${point(620, 672)}"></div>
          <div class="rug" style="${point(620, 745)}"></div>
        </div>

        <div class="room" style="${roomBox(860, 635, 300, 160)}">
          <span class="room-label">Aida's office</span>
          <div class="desk" style="${point(1006, 720)}"></div>
          <div class="monitor" style="${point(1006, 716)}"></div>
          <div class="view-window" title="A view"></div>
        </div>

        <div id="agents"></div>
      </div>
    </section>

    <section class="ticker-wrap" aria-labelledby="ticker-title">
      <div class="ticker-head">
        <h2 id="ticker-title">Activity ticker</h2>
        <span class="hint">Real control plane events, newest first</span>
      </div>
      <p class="ticker-empty" id="ticker-empty">Waiting for activity…</p>
      <ul class="ticker" id="ticker" aria-live="polite"></ul>
    </section>
  </main>

  <footer>
    <p>Live loopback office. Read only; it never writes to the control plane and makes no website API endpoint. Rollback: stop and disable the two systemd units.</p>
  </footer>
</div>
<script type="application/json" id="avatar-sprite">${safeAvatars}</script>
<script>window.__INITIAL_STATE__ = ${safeInitial}; window.__POLL_MS__ = ${Number(pollMs) || 5000};</script>
<script>${clientJs}</script>
</body>
</html>
`;
}
