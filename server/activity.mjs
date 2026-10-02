#!/usr/bin/env node
/**
 * office-activity: the WebWright live office activity reporter.
 *
 * Polls the local Paperclip control plane over loopback, keeps a rolling window
 * of real activity events plus a live state snapshot in memory, and serves both
 * on loopback only:
 *
 *   GET /state
 *   GET /activity?since=<cursor>&limit=<n>
 *
 * GET only, read only. It never writes to the control plane. This is the exact
 * endpoint scope approved on WEB-383; do not add paths, methods or exposure
 * without fresh board approval under WEB-255.
 *
 * Environment:
 *   PAPERCLIP_API_URL     control plane base URL (default http://127.0.0.1:3100)
 *   PAPERCLIP_API_KEY     read scoped service credential (never logged)
 *   PAPERCLIP_COMPANY_ID  company to report on
 *   OFFICE_ACTIVITY_HOST  bind address (default 127.0.0.1)
 *   OFFICE_ACTIVITY_PORT  bind port (default 3110)
 *   OFFICE_POLL_MS        poll interval (default 10000)
 *   OFFICE_WINDOW_SIZE    rolling activity window (default 300)
 *   OFFICE_ACTIVITY_BATCH control plane activity page size (default 50)
 */

import http from "node:http";
import { pathToFileURL } from "node:url";
import { createControlPlaneClient } from "./lib/control-plane.mjs";
import {
  asArray,
  currentTasksByAgent,
  latestComment,
  normalizeActivity,
  normalizeState,
  sanitizeError,
} from "./lib/office.mjs";

export function readConfig(env = process.env) {
  return {
    apiUrl: env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100",
    apiKey: env.PAPERCLIP_API_KEY ?? "",
    companyId: env.PAPERCLIP_COMPANY_ID ?? "",
    host: env.OFFICE_ACTIVITY_HOST ?? "127.0.0.1",
    port: Number(env.OFFICE_ACTIVITY_PORT ?? 3110),
    pollMs: Math.max(1000, Number(env.OFFICE_POLL_MS ?? 10000)),
    windowSize: Math.max(10, Number(env.OFFICE_WINDOW_SIZE ?? 300)),
    activityBatch: Math.max(1, Math.min(200, Number(env.OFFICE_ACTIVITY_BATCH ?? 50))),
  };
}

function emptyState(config) {
  return {
    capturedAt: new Date().toISOString(),
    controlPlaneReachable: false,
    lastError: "starting",
    pollIntervalMs: config.pollMs,
    agents: [],
    liveRunCount: 0,
    counts: { agents: 0, desk: 0, break: 0, coffee: 0, running: 0, blocked: 0, review: 0 },
  };
}

export function createActivityReporter(config = readConfig()) {
  const client = createControlPlaneClient(config);
  let state = emptyState(config);
  const window = [];
  const seen = new Set();
  let cursor = 0;
  let polling = false;

  function mergeActivity(events) {
    for (const event of events) {
      if (!event || !event.id || seen.has(event.id)) continue;
      seen.add(event.id);
      cursor += 1;
      window.push({ ...event, seq: cursor });
    }
    while (window.length > config.windowSize) {
      const dropped = window.shift();
      seen.delete(dropped.id);
    }
  }

  async function poll() {
    if (polling) return;
    polling = true;
    try {
      if (!client.configured) {
        state = { ...emptyState(config), lastError: "no_credential" };
        return;
      }
      const [agents, issues, liveRuns, rawActivity] = await Promise.all([
        client.getAgents(),
        client.getIssues(),
        client.getLiveRuns(),
        client.getActivity(config.activityBatch),
      ]);

      const agentById = new Map(asArray(agents).map((agent) => [agent.id, agent]));
      const issueIdentifierById = new Map(
        asArray(issues).map((issue) => [issue.id, issue.identifier]),
      );

      const currentTasks = currentTasksByAgent(agents, issues);
      const comments = new Map();
      await Promise.all(
        [...currentTasks.values()].map(async (task) => {
          try {
            const comment = latestComment(await client.getLatestComment(task.id));
            if (comment?.body) comments.set(task.id, comment.body);
          } catch {
            // A missing note never blocks the snapshot.
          }
        }),
      );

      const capturedAt = new Date().toISOString();
      state = normalizeState({
        agents,
        issues,
        liveRuns,
        comments,
        capturedAt,
        pollIntervalMs: config.pollMs,
      });
      mergeActivity(normalizeActivity(rawActivity, { agentById, issueIdentifierById }));
    } catch (error) {
      state = {
        ...state,
        capturedAt: new Date().toISOString(),
        controlPlaneReachable: false,
        lastError: sanitizeError(error),
      };
    } finally {
      polling = false;
    }
  }

  function getState() {
    return state;
  }

  function getActivity({ since, limit } = {}) {
    const max = Math.max(1, Math.min(200, Number(limit) || 50));
    const sinceSeq = Number.isFinite(Number(since)) ? Number(since) : -1;
    let events = window.filter((event) => event.seq > sinceSeq);
    if (sinceSeq < 0 && events.length > max) events = events.slice(-max);
    else if (events.length > max) events = events.slice(0, max);
    return {
      capturedAt: state.capturedAt,
      controlPlaneReachable: state.controlPlaneReachable,
      cursor,
      events,
      count: events.length,
    };
  }

  function handle(req, res) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "application/json", Allow: "GET" });
      res.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }
    if (url.pathname === "/state") {
      sendJson(res, 200, getState());
      return;
    }
    if (url.pathname === "/activity") {
      sendJson(res, 200, getActivity({
        since: url.searchParams.get("since"),
        limit: url.searchParams.get("limit"),
      }));
      return;
    }
    sendJson(res, 404, { error: "not_found" });
  }

  async function start() {
    await poll();
    const server = http.createServer(handle);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, resolve);
    });
    const timer = setInterval(() => {
      void poll();
    }, config.pollMs);
    timer.unref?.();
    return {
      server,
      timer,
      stop: async () => {
        clearInterval(timer);
        await new Promise((resolve) => server.close(resolve));
      },
    };
  }

  return { poll, start, handle, getState, getActivity, client };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function main() {
  const config = readConfig();
  const reporter = createActivityReporter(config);
  const { stop } = await reporter.start();
  const status = reporter.getState();
  console.log(
    `office-activity listening on http://${config.host}:${config.port} ` +
      `(company ${config.companyId || "unset"}, poll ${config.pollMs}ms, ` +
      `control plane ${status.controlPlaneReachable ? "reachable" : `unreachable: ${status.lastError}`})`,
  );
  const shutdown = () => {
    void stop().then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`office-activity failed to start: ${sanitizeError(error)}`);
    process.exit(1);
  });
}
