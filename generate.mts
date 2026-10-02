#!/usr/bin/env node
/**
 * WebWright virtual office generator (Phase 1).
 *
 * Captures a snapshot of real Paperclip control plane state and writes a single
 * self contained static page (site/index.html) with inline SVG gumdrop avatars.
 *
 * Run from inside the Paperclip repository so the shared renderer resolves:
 *
 *   node cli/node_modules/tsx/dist/cli.mjs generate.mts --out site
 *
 * Reads PAPERCLIP_API_URL, PAPERCLIP_API_KEY and PAPERCLIP_COMPANY_ID from the
 * run environment. The API key is never printed, persisted or embedded.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.env.PAPERCLIP_REPO_ROOT ?? process.cwd();
const API_URL = (process.env.PAPERCLIP_API_URL ?? "").replace(/\/+$/, "");
const API_KEY = process.env.PAPERCLIP_API_KEY ?? "";
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID ?? "";

if (!API_URL || !API_KEY || !COMPANY_ID) {
  console.error("Missing PAPERCLIP_API_URL, PAPERCLIP_API_KEY or PAPERCLIP_COMPANY_ID.");
  process.exit(1);
}

const { appearanceForPalette, resolveAgentAppearance } = await import(
  pathToFileURL(resolve(REPO_ROOT, "packages/shared/src/agent-appearance.ts")).href
);
const { renderAgentSvg } = await import(
  pathToFileURL(resolve(REPO_ROOT, "packages/shared/src/cliplab/static.ts")).href
);

// ---------------------------------------------------------------------------
// Roster and layout. Positions are in a 1200 x 820 virtual floor plan.
// ---------------------------------------------------------------------------

const ROSTER = [
  { name: "Aida", fallbackRole: "Chief Executive Officer", room: "aida", desk: [1006, 700] },
  { name: "Clara", fallbackRole: "COO / Delivery & Engineering Operations Manager", room: "ops", desk: [205, 322] },
  { name: "Maya", fallbackRole: "Software Engineer II: Frontend & Application", room: "eng", desk: [170, 520] },
  { name: "Owen", fallbackRole: "Site Reliability & Network Engineer II", room: "eng", desk: [600, 520] },
  { name: "Felix", fallbackRole: "Database Engineer II: SurrealDB", room: "eng", desk: [1030, 520] },
  { name: "Nora", fallbackRole: "Software Engineer in Test II & Independent Quality Reviewer", room: "lab", desk: [205, 700] },
  { name: "Sienna", fallbackRole: "Growth & Revenue Lead", room: "lounge", desk: [935, 140] },
];

const FLOOR_W = 1200;
const FLOOR_H = 820;

const BREAK_SLOTS = [
  [470, 330],
  [560, 345],
  [470, 398],
];
const COFFEE_SLOTS = [
  [756, 322],
  [712, 352],
  [800, 360],
];

const STATUS_RANK = { in_progress: 0, in_review: 1, blocked: 2 };

const RUNTIME_STATUS = {
  running: { label: "Running", color: "var(--running)" },
  idle: { label: "Idle", color: "var(--idle)" },
  paused: { label: "Paused", color: "var(--paused)" },
  pending_approval: { label: "Pending approval", color: "var(--paused)" },
  error: { label: "Error", color: "var(--error)" },
  terminated: { label: "Terminated", color: "var(--muted)" },
};

const ISSUE_STATUS = {
  in_progress: { label: "In progress", color: "var(--in-progress)" },
  in_review: { label: "In review", color: "var(--in-review)" },
  blocked: { label: "Blocked", color: "var(--blocked)" },
  todo: { label: "Todo", color: "var(--todo)" },
};

// ---------------------------------------------------------------------------
// Control plane reads
// ---------------------------------------------------------------------------

async function api(path) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return res.json();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.issues)) return value.issues;
  return [];
}

function pickCurrentTask(tasks) {
  const ranked = [...tasks].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 9;
    const rb = STATUS_RANK[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
  });
  return ranked[0] ?? null;
}

function latestComment(comments) {
  const sorted = [...asArray(comments)].sort(
    (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
  );
  return sorted.at(-1) ?? null;
}

const SENSITIVE =
  /(secret|password|passwd|api[_\s-]?key|access[_\s-]?key|private[_\s-]?key|credential|bearer\s+[A-Za-z0-9._-]{16,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|ssh-rsa|ssh-ed25519|[A-Za-z0-9+/]{44,}={0,2})/i;

function sanitizeNote(body) {
  if (typeof body !== "string" || body.trim() === "") return null;
  let text = body.slice(0, 8000);
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`([^`]*)`/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[@?([^\]]+)\]\((?:agent|https?):\/\/[^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/^[#>*_~\s-]+/gm, " ");
  text = text.replace(/[*_~#>`]/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (SENSITIVE.test(text)) return null;
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function namespaceSvg(svg, index) {
  const prefix = `av${index}-`;
  return svg
    .replace(/id="agent-/g, `id="${prefix}agent-`)
    .replace(/url\(#agent-/g, `url(#${prefix}agent-`)
    .replace(/href="#agent-/g, `href="#${prefix}agent-`)
    .replace(/role="img"/, 'aria-hidden="true" focusable="false"')
    .replace(/<title>[\s\S]*?<\/title>/, "");
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

async function buildSnapshot() {
  const agents = asArray(await api(`/api/companies/${COMPANY_ID}/agents`));
  const byName = new Map(agents.map((a) => [a.name, a]));
  const capturedAt = new Date().toISOString();

  const records = [];
  let breakIndex = 0;
  let coffeeIndex = 0;

  for (const entry of ROSTER) {
    const agent = byName.get(entry.name);
    const issues = agent
      ? asArray(
          await api(
            `/api/companies/${COMPANY_ID}/issues?assigneeAgentId=${agent.id}` +
              `&status=in_progress,in_review,blocked&view=compact&limit=50`,
          ),
        )
      : [];
    const current = pickCurrentTask(issues);
    let note = null;
    if (current) {
      const comment = latestComment(await api(`/api/issues/${current.id}/comments`));
      note = sanitizeNote(comment?.body ?? null);
    }

    const runtime = agent?.status ?? "idle";
    let location;
    let pose;
    let plaque = null;
    let badge = null;

    if (current && current.status === "in_progress") {
      location = "desk";
      pose = "working";
      plaque = current.identifier;
    } else if (current && current.status === "in_review") {
      location = "desk";
      pose = "thinking";
      plaque = current.identifier;
      badge = "review";
    } else if (current && current.status === "blocked") {
      location = "coffee";
      pose = "confused";
      plaque = current.identifier;
      badge = "blocked";
    } else if (runtime === "running") {
      location = "desk";
      pose = "working";
    } else {
      location = "break";
      pose = runtime === "paused" || runtime === "pending_approval" ? "rest" : "idle";
    }

    let x;
    let y;
    if (location === "desk") {
      [x, y] = entry.desk;
    } else if (location === "break") {
      [x, y] = BREAK_SLOTS[breakIndex % BREAK_SLOTS.length];
      breakIndex += 1;
    } else {
      [x, y] = COFFEE_SLOTS[coffeeIndex % COFFEE_SLOTS.length];
      coffeeIndex += 1;
    }

    records.push({
      name: entry.name,
      role: agent?.title ?? entry.fallbackRole,
      room: entry.room,
      runtimeStatus: runtime,
      appearance: agent ? resolveAgentAppearance(agent.appearance, agent.id) : appearanceForPalette("bubblegum-sky"),
      currentTask: current
        ? {
            identifier: current.identifier,
            status: current.status,
            updatedAt: current.updatedAt ?? null,
          }
        : null,
      note,
      placement: { location, pose, plaque, badge, x, y },
    });
  }

  return { capturedAt, companyId: COMPANY_ID, agents: records };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function pctX(x) {
  return `${((x / FLOOR_W) * 100).toFixed(3)}%`;
}
function pctY(y) {
  return `${((y / FLOOR_H) * 100).toFixed(3)}%`;
}

function roomBox(x, y, w, h, extra = "") {
  return `left:${pctX(x)};top:${pctY(y)};width:${((w / FLOOR_W) * 100).toFixed(3)}%;height:${((h / FLOOR_H) * 100).toFixed(3)}%;${extra}`;
}

function point(x, y, extra = "") {
  return `left:${pctX(x)};top:${pctY(y)};${extra}`;
}

function agentCard(record) {
  const runtime = RUNTIME_STATUS[record.runtimeStatus] ?? RUNTIME_STATUS.idle;
  const task = record.currentTask;
  const issueStatus = task ? ISSUE_STATUS[task.status] ?? { label: task.status, color: "var(--muted)" } : null;
  const poseLabel = {
    working: "Working",
    thinking: "Reviewing",
    confused: "Blocked",
    rest: "Resting",
    idle: "Idle",
  }[record.placement.pose] ?? record.placement.pose;

  const placementLine = {
    desk: "At their desk",
    break: "In the break room",
    coffee: "By the coffee machine",
  }[record.placement.location];

  const taskLine = task
    ? `${escapeHtml(task.identifier)} · ${escapeHtml(issueStatus.label)}`
    : "No active task";
  const noteLine = record.note ? escapeHtml(record.note) : "No recent note.";

  const accessible = [
    `${record.name}, ${record.role}.`,
    `Runtime status ${runtime.label}.`,
    placementLine + ".",
    poseLabel + ".",
    task ? `Current task ${task.identifier}, ${issueStatus.label}.` : "No active task.",
    record.note ? `Latest note: ${record.note}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
      <button class="agent" type="button"
        style="${point(record.placement.x, record.placement.y)}"
        data-card="${record.placement.y < 250 ? "below" : "above"}"
        data-edge="${record.placement.x > 950 ? "right" : record.placement.x < 250 ? "left" : "center"}"
        aria-label="${escapeHtml(accessible)}">
        <span class="avatar">${namespaceSvg(record.svg, record.index)}</span>
        <span class="name">${escapeHtml(record.name)}</span>
        ${record.placement.plaque ? `<span class="plaque">${escapeHtml(record.placement.plaque)}</span>` : ""}
        ${record.placement.badge === "review" ? '<span class="badge badge-review">Review</span>' : ""}
        ${record.placement.badge === "blocked" ? '<span class="badge badge-blocked">Blocked</span>' : ""}
        <span class="status-dot" style="background:${runtime.color}" title="Runtime: ${escapeHtml(runtime.label)}"></span>
        <span class="card" role="presentation">
          <span class="card-name">${escapeHtml(record.name)}</span>
          <span class="card-role">${escapeHtml(record.role)}</span>
          <span class="card-row"><span class="dot" style="background:${runtime.color}"></span>${escapeHtml(runtime.label)} · ${escapeHtml(placementLine)} · ${escapeHtml(poseLabel)}</span>
          <span class="card-task" style="color:${task ? issueStatus.color : "var(--muted)"}">${taskLine}</span>
          <span class="card-note">${noteLine}</span>
        </span>
      </button>`;
}

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
.meta { color: var(--muted); font-size: 13px; margin: 0 0 18px; }
.meta code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--text); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 0 0 18px; padding: 10px 14px; border: 1px solid var(--border-soft); border-radius: var(--radius); background: var(--panel); font-size: 12px; color: var(--muted); }
.legend .item { display: inline-flex; align-items: center; gap: 6px; }
.legend .dot { width: 9px; height: 9px; border-radius: 999px; display: inline-block; }
.floorplan {
  position: relative;
  width: 100%;
  aspect-ratio: ${FLOOR_W} / ${FLOOR_H};
  background:
    linear-gradient(var(--floor-line) 1px, transparent 1px) 0 0 / 40px 40px,
    linear-gradient(90deg, var(--floor-line) 1px, transparent 1px) 0 0 / 40px 40px,
    var(--floor);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: visible;
}
.room {
  position: absolute;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.15);
}
.room-label {
  position: absolute;
  top: 6px;
  left: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--muted);
  text-transform: uppercase;
  white-space: nowrap;
}
.window {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 54px;
  background: linear-gradient(180deg, oklch(0.42 0.07 240), oklch(0.30 0.05 250));
  border-bottom: 2px solid var(--border);
  border-radius: 13px 13px 0 0;
  overflow: hidden;
}
.window::after {
  content: "";
  position: absolute; inset: 0;
  background: repeating-linear-gradient(90deg, transparent 0 118px, oklch(0.16 0.014 265 / 0.55) 118px 124px);
}
.window-label { position: absolute; left: 12px; bottom: 4px; font-size: 10px; letter-spacing: 0.14em; color: oklch(0.9 0.02 240); text-transform: uppercase; }
.door {
  position: absolute;
  width: 34px; height: 8px;
  background: oklch(0.85 0.02 250);
  border-radius: 2px;
  box-shadow: 0 0 0 2px oklch(0.16 0.014 265 / 0.5);
}
.view-window {
  position: absolute;
  right: 0; top: 0; width: 26px; height: 100%;
  background: linear-gradient(180deg, oklch(0.45 0.07 240), oklch(0.32 0.05 250));
  border-radius: 0 13px 13px 0;
}
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
.agent {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 104px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
  z-index: 20;
}
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
.card {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  width: min(260px, 72vw);
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  box-shadow: 0 16px 34px oklch(0 0 0 / 0.55);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.14s ease, transform 0.14s ease;
}
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
details.snapshot { margin-top: 22px; border: 1px solid var(--border-soft); border-radius: var(--radius); background: var(--panel); padding: 10px 14px; }
details.snapshot summary { cursor: pointer; font-size: 13px; font-weight: 600; }
details.snapshot pre { overflow: auto; max-height: 360px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--muted); background: oklch(0.13 0.012 265); padding: 12px; border-radius: 8px; margin: 12px 0 4px; }
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
}
`;

function renderPage(snapshot) {
  const generated = new Date(snapshot.capturedAt);
  const stamp = generated.toISOString().replace("T", " ").replace(".000Z", "Z");
  const json = JSON.stringify(snapshot, null, 2).replace(/</g, "\\u003c");

  const agentsHtml = snapshot.agents
    .map((record, index) => {
      record.index = index;
      record.svg = renderAgentSvg(record.appearance, 64, 2, record.placement.pose, false);
      return agentCard(record);
    })
    .join("\n");

  const breakRoomAgents = snapshot.agents.filter((a) => a.placement.location === "break").length;
  const coffeeAgents = snapshot.agents.filter((a) => a.placement.location === "coffee").length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WebWright Virtual Office</title>
<meta name="description" content="A static, overhead 2D view of the WebWright team, placed and posed from Paperclip control plane state captured at generation time.">
<meta name="color-scheme" content="dark">
<style>${STYLE}</style>
</head>
<body>
<div class="page">
  <header>
    <div class="topbar">
      <h1><span class="logo" aria-hidden="true">&#9670;</span>WebWright Virtual Office</h1>
    </div>
    <p class="meta">Static snapshot captured <time datetime="${escapeHtml(snapshot.capturedAt)}">${escapeHtml(stamp)}</time> from the Paperclip control plane. Positions reflect real state at generation time, not a live feed.</p>
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

${agentsHtml}
      </div>
    </section>

    <details class="snapshot">
      <summary>Control plane snapshot (${snapshot.agents.length} agents, ${breakRoomAgents} in the break room, ${coffeeAgents} by the coffee machine)</summary>
      <pre>${escapeHtml(json)}</pre>
    </details>
  </main>

  <footer>
    <p>Standalone static artifact. No website API endpoint, no live polling, no Paperclip product code changes. Regenerate with <code>generate.mts</code>; publish with the Paperclip page helper. Rollback: delete the published page (slug <code>webwright-office</code>).</p>
  </footer>
</div>
<script type="application/json" id="office-snapshot">${json}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { out: "site" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const snapshot = await buildSnapshot();
const html = renderPage(snapshot);
const outDir = resolve(args.out);
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, "index.html"), html, "utf8");

const placements = snapshot.agents.map((a) => `${a.name}:${a.placement.location}/${a.placement.pose}`).join(", ");
console.log(`Wrote ${resolve(outDir, "index.html")}`);
console.log(`Captured ${snapshot.capturedAt}; ${placements}`);
