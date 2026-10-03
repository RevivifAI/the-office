/**
 * Office domain logic: roster layout, placement rules, note sanitizing and
 * normalization of raw control plane payloads into the reporter's state and
 * activity shapes.
 *
 * The rules are the Phase 1 rules, kept honest: an agent is only placed at a
 * desk when real state says so, otherwise it sits in the break room.
 */

// Positions are in a 1200 x 820 virtual floor plan, matching the Phase 1 page.
export const FLOOR_W = 1200;
export const FLOOR_H = 820;

export const ROSTER = [
  { name: "Aida", fallbackRole: "Chief Executive Officer", room: "aida", desk: [1006, 700] },
  { name: "Clara", fallbackRole: "COO / Delivery & Engineering Operations Manager", room: "ops", desk: [205, 322] },
  { name: "Maya", fallbackRole: "Software Engineer II: Frontend & Application", room: "eng", desk: [170, 520] },
  { name: "Owen", fallbackRole: "Site Reliability & Network Engineer II", room: "eng", desk: [600, 520] },
  { name: "Felix", fallbackRole: "Database Engineer II: SurrealDB", room: "eng", desk: [1030, 520] },
  { name: "Nora", fallbackRole: "Software Engineer in Test II & Independent Quality Reviewer", room: "lab", desk: [205, 700] },
  { name: "Sienna", fallbackRole: "Growth & Revenue Lead", room: "lounge", desk: [935, 140] },
];

const BREAK_SLOTS = [
  [470, 330],
  [560, 345],
  [470, 398],
  [610, 398],
  [560, 300],
];

const COFFEE_SLOTS = [
  [756, 322],
  [712, 352],
  [800, 360],
  [690, 300],
];

export const STATUS_RANK = { in_progress: 0, in_review: 1, blocked: 2 };

export const AGENT_PALETTE_IDS = [
  "bubblegum-sky", "pink-lemonade", "orchid-peach", "coral-mint", "lime-lagoon",
  "arctic-blue", "solar-flare", "violet-ember", "deep-tide", "coral-current",
  "golden-hour", "tangerine-cobalt", "electric-grove", "flamingo-jade", "cherry-pop",
  "turquoise-cherry", "ultraviolet-tide",
];

export const CHARACTER_STATES = ["rest", "idle", "thinking", "working", "confused"];

export const RUNTIME_STATUS = {
  running: { label: "Running", color: "var(--running)" },
  idle: { label: "Idle", color: "var(--idle)" },
  paused: { label: "Paused", color: "var(--paused)" },
  pending_approval: { label: "Pending approval", color: "var(--paused)" },
  error: { label: "Error", color: "var(--error)" },
  terminated: { label: "Terminated", color: "var(--muted)" },
};

export const ISSUE_STATUS = {
  in_progress: { label: "In progress", color: "var(--in-progress)" },
  in_review: { label: "In review", color: "var(--in-review)" },
  blocked: { label: "Blocked", color: "var(--blocked)" },
  todo: { label: "Todo", color: "var(--todo)" },
};

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.issues)) return value.issues;
  return [];
}

export function resolveAppearance(appearance, id = "agent") {
  const palette = appearance && appearance.paletteId;
  if (appearance && appearance.schemaVersion === 1 && appearance.characterVersion === "cap-v1" && AGENT_PALETTE_IDS.includes(palette)) {
    return { schemaVersion: 1, characterVersion: "cap-v1", paletteId: palette };
  }
  // Same legacy hash as the shared renderer, so a missing appearance is stable.
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) % AGENT_PALETTE_IDS.length;
  return { schemaVersion: 1, characterVersion: "cap-v1", paletteId: AGENT_PALETTE_IDS[hash] };
}

export function pickCurrentTask(tasks) {
  const ranked = [...tasks].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 9;
    const rb = STATUS_RANK[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
  });
  return ranked[0] ?? null;
}

export function groupIssuesByAgent(issues) {
  const map = new Map();
  for (const issue of asArray(issues)) {
    if (!issue || !issue.assigneeAgentId) continue;
    const list = map.get(issue.assigneeAgentId) ?? [];
    list.push(issue);
    map.set(issue.assigneeAgentId, list);
  }
  return map;
}

export function currentTasksByAgent(agents, issues) {
  const grouped = groupIssuesByAgent(issues);
  const map = new Map();
  for (const agent of asArray(agents)) {
    const current = pickCurrentTask(grouped.get(agent.id) ?? []);
    if (current) map.set(agent.id, current);
  }
  return map;
}

const SENSITIVE =
  /(secret|password|passwd|api[_\s-]?key|access[_\s-]?key|private[_\s-]?key|credential|bearer\s+[A-Za-z0-9._-]{16,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|ssh-rsa|ssh-ed25519|[A-Za-z0-9+/]{44,}={0,2})/i;

export function sanitizeNote(body) {
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

export function latestComment(comments) {
  const sorted = [...asArray(comments)].sort(
    (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
  );
  return sorted.at(-1) ?? null;
}

export function sanitizeError(error) {
  const message = error && error.message ? String(error.message) : "unknown_error";
  if (SENSITIVE.test(message)) return "request_failed";
  return message.slice(0, 200);
}

/**
 * Normalize raw control plane payloads into the reporter state. `comments` is a
 * Map of issue id to the latest comment body, already sanitized.
 */
export function normalizeState({ agents, issues, liveRuns, comments, capturedAt, pollIntervalMs }) {
  const agentList = asArray(agents);
  const rosterOrder = new Map(ROSTER.map((entry, index) => [entry.name, index]));
  const ordered = [...agentList].sort((a, b) => {
    const ra = rosterOrder.get(a.name) ?? 999;
    const rb = rosterOrder.get(b.name) ?? 999;
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name));
  });

  const grouped = groupIssuesByAgent(issues);
  const runningAgentIds = new Set(
    asArray(liveRuns)
      .filter((run) => run && (run.status === "running" || run.status === "queued"))
      .map((run) => run.agentId),
  );

  let breakIndex = 0;
  let coffeeIndex = 0;

  const records = ordered.map((agent) => {
    const entry = ROSTER.find((r) => r.name === agent.name) ?? null;
    const current = pickCurrentTask(grouped.get(agent.id) ?? []);
    const note = current ? sanitizeNote(comments?.get(current.id) ?? null) : null;
    const runtimeStatus = runningAgentIds.has(agent.id) ? "running" : (agent.status ?? "idle");

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
    } else if (runtimeStatus === "running") {
      location = "desk";
      pose = "working";
    } else {
      location = "break";
      pose = runtimeStatus === "paused" || runtimeStatus === "pending_approval" ? "rest" : "idle";
    }

    let x;
    let y;
    if (location === "desk" && entry) {
      [x, y] = entry.desk;
    } else if (location === "desk") {
      // Unknown agent with real active work: give it a spare break-room slot
      // rather than inventing a desk.
      [x, y] = BREAK_SLOTS[breakIndex % BREAK_SLOTS.length];
      breakIndex += 1;
      location = "break";
      pose = "working";
    } else if (location === "break") {
      [x, y] = BREAK_SLOTS[breakIndex % BREAK_SLOTS.length];
      breakIndex += 1;
    } else {
      [x, y] = COFFEE_SLOTS[coffeeIndex % COFFEE_SLOTS.length];
      coffeeIndex += 1;
    }

    return {
      id: agent.id,
      name: agent.name,
      role: agent.title ?? entry?.fallbackRole ?? "Agent",
      appearance: resolveAppearance(agent.appearance, agent.id),
      runtimeStatus,
      running: runningAgentIds.has(agent.id),
      currentTask: current
        ? {
            id: current.id,
            identifier: current.identifier,
            title: current.title ?? null,
            status: current.status,
            updatedAt: current.updatedAt ?? null,
          }
        : null,
      note,
      placement: { location, pose, plaque, badge, x, y },
    };
  });

  const counts = {
    agents: records.length,
    desk: records.filter((r) => r.placement.location === "desk").length,
    break: records.filter((r) => r.placement.location === "break").length,
    coffee: records.filter((r) => r.placement.location === "coffee").length,
    running: records.filter((r) => r.running).length,
    blocked: records.filter((r) => r.currentTask?.status === "blocked").length,
    review: records.filter((r) => r.currentTask?.status === "in_review").length,
  };

  return {
    capturedAt,
    controlPlaneReachable: true,
    lastError: null,
    pollIntervalMs,
    agents: records,
    liveRunCount: runningAgentIds.size,
    counts,
  };
}

const SAFE_ACTION = /^(issue|run|routine|environment|agent|project|company|decision)/;

function isSafeActivity(event) {
  const action = String(event?.action ?? "");
  if (!action) return false;
  if (action.startsWith("secret.")) return false;
  if (!SAFE_ACTION.test(action)) return false;
  const details = event?.details;
  if (details && typeof details === "object" && "configPath" in details) return false;
  return true;
}

function activityIdentifier(event, issueIdentifierById) {
  const details = event?.details;
  if (details && typeof details.identifier === "string" && details.identifier) return details.identifier;
  if (event?.entityType === "issue" && issueIdentifierById?.has(event.entityId)) {
    return issueIdentifierById.get(event.entityId);
  }
  return null;
}

export function activityMessage(event, identifier) {
  const target = identifier ? ` ${identifier}` : "";
  const details = event?.details ?? {};
  switch (event.action) {
    case "issue.created":
      return `created${target}`;
    case "issue.comment_added":
      return `commented on${target}`;
    case "issue.checked_out":
      return `checked out${target}`;
    case "issue.blockers_updated":
      return `updated blockers on${target}`;
    case "issue.document_created":
      return `created document${target ? ` on${target}` : ""}`;
    case "issue.document_updated":
      return `updated document${target ? ` on${target}` : ""}`;
    case "issue.thread_interaction_created":
      return `opened an interaction${target ? ` on${target}` : ""}`;
    case "issue.thread_interaction_accepted":
      return `interaction accepted${target ? ` on${target}` : ""}`;
    case "issue.cross_issue_influence_observed":
      return `cross-issue influence observed${target ? ` on${target}` : ""}`;
    case "environment.lease_acquired":
      return `acquired an environment${target ? ` for${target}` : ""}`;
    case "environment.lease_released":
      return `released an environment${target ? ` for${target}` : ""}`;
    case "routine.run_triggered":
      return "triggered a routine";
    case "issue.updated": {
      const to = details?.changes?.status?.to;
      return to ? `moved${target} to ${to}` : `updated${target}`;
    }
    default:
      return `${event.action.replace(/[._]/g, " ")}${target}`;
  }
}

/**
 * Normalize a raw, newest-first control plane activity batch into oldest-first
 * office events. Sensitive actions are dropped entirely.
 */
export function normalizeActivity(rawEvents, { agentById, issueIdentifierById } = {}) {
  const out = [];
  for (const event of asArray(rawEvents)) {
    if (!isSafeActivity(event)) continue;
    const identifier = activityIdentifier(event, issueIdentifierById);
    const agentName = event.agentId && agentById?.get(event.agentId)
      ? agentById.get(event.agentId).name
      : null;
    out.push({
      id: event.id,
      at: event.createdAt ?? null,
      action: event.action,
      actorType: event.actorType ?? null,
      agentId: event.agentId ?? null,
      agentName,
      entityType: event.entityType ?? null,
      identifier,
      message: activityMessage(event, identifier),
    });
  }
  return out.reverse();
}
