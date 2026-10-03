#!/usr/bin/env node
/**
 * Focused checks for the live office stack. Starts a mock control plane, runs
 * the reporter and the app in process on ephemeral loopback ports, and asserts
 * the placement mapping, the read-only endpoint surface and the activity
 * filtering. No network, no credentials, no Paperclip repository needed.
 */

import http from "node:http";
import assert from "node:assert/strict";

import { createActivityReporter } from "../server/activity.mjs";
import { createOfficeApp } from "../server/app.mjs";
import { newestFirst, normalizeActivity, sanitizeNote } from "../server/lib/office.mjs";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const results = [];

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => results.push(["PASS", name]))
    .catch((error) => results.push(["FAIL", `${name} :: ${error.message}`]));
}

const AGENTS = [
  { id: "a-maya", name: "Maya", title: "Software Engineer II: Frontend & Application", status: "running", appearance: { schemaVersion: 1, characterVersion: "cap-v1", paletteId: "ultraviolet-tide" } },
  { id: "a-clara", name: "Clara", title: "COO", status: "idle", appearance: { schemaVersion: 1, characterVersion: "cap-v1", paletteId: "bubblegum-sky" } },
  { id: "a-felix", name: "Felix", title: "Database Engineer II: SurrealDB", status: "idle", appearance: { schemaVersion: 1, characterVersion: "cap-v1", paletteId: "deep-tide" } },
  { id: "a-sienna", name: "Sienna", title: "Growth & Revenue Lead", status: "idle", appearance: { schemaVersion: 1, characterVersion: "cap-v1", paletteId: "golden-hour" } },
];

const ISSUES = [
  { id: "i-maya", identifier: "WEB-456", title: "Build the live office app", status: "in_progress", assigneeAgentId: "a-maya", updatedAt: "2026-10-02T21:00:00.000Z" },
  { id: "i-clara", identifier: "WEB-453", title: "Step One delivery", status: "in_review", assigneeAgentId: "a-clara", updatedAt: "2026-10-02T20:00:00.000Z" },
  { id: "i-felix", identifier: "WEB-23", title: "Schema work", status: "blocked", assigneeAgentId: "a-felix", updatedAt: "2026-10-02T19:00:00.000Z" },
];

const LIVE_RUNS = [
  { id: "r-maya", agentId: "a-maya", agentName: "Maya", status: "running", issueId: "i-maya" },
];

const ACTIVITY = [
  { id: "e4", action: "secret.value.read", actorType: "agent", agentId: "a-clara", entityType: "secret", entityId: "s1", details: { configPath: "env.GHCR_TOKEN" }, createdAt: "2026-10-02T21:00:04.000Z" },
  { id: "e3", action: "issue.comment_added", actorType: "agent", agentId: "a-maya", entityType: "issue", entityId: "i-maya", details: { identifier: "WEB-456", issueTitle: "Build the live office app", bodySnippet: "progress" }, createdAt: "2026-10-02T21:00:03.000Z" },
  { id: "e2", action: "issue.updated", actorType: "agent", agentId: "a-felix", entityType: "issue", entityId: "i-felix", details: { changes: { status: { to: "blocked", from: "in_progress" } } }, createdAt: "2026-10-02T21:00:02.000Z" },
  { id: "e1", action: "issue.created", actorType: "agent", agentId: "a-clara", entityType: "issue", entityId: "i-clara", details: { identifier: "WEB-453", title: "Step One delivery" }, createdAt: "2026-10-02T21:00:01.000Z" },
];

function startMockControlPlane() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const send = (status, body) => {
      const payload = JSON.stringify(body);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(payload);
    };
    if (url.pathname === `/api/companies/${COMPANY_ID}/agents`) return send(200, AGENTS);
    if (url.pathname === `/api/companies/${COMPANY_ID}/issues`) return send(200, ISSUES);
    if (url.pathname === `/api/companies/${COMPANY_ID}/live-runs`) return send(200, LIVE_RUNS);
    if (url.pathname === `/api/companies/${COMPANY_ID}/activity`) return send(200, ACTIVITY);
    if (url.pathname.startsWith("/api/issues/") && url.pathname.endsWith("/comments")) {
      const id = url.pathname.split("/")[3];
      return send(200, [{ id: `c-${id}`, body: `Latest note for ${id}`, createdAt: "2026-10-02T21:00:05.000Z" }]);
    }
    send(404, { error: "not_found" });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  await check("sanitizeNote drops secret-looking text", () => {
    assert.equal(sanitizeNote("the api_key is AKIA1234567890ABCDEF"), null);
    assert.equal(sanitizeNote("normal progress note"), "normal progress note");
  });

  await check("normalizeActivity filters secrets and orders oldest first", () => {
    const events = normalizeActivity(ACTIVITY, {
      agentById: new Map(AGENTS.map((a) => [a.id, a])),
      issueIdentifierById: new Map(ISSUES.map((i) => [i.id, i.identifier])),
    });
    assert.deepEqual(events.map((e) => e.id), ["e1", "e2", "e3"]);
    assert.ok(!events.some((e) => e.action.startsWith("secret.")));
    assert.equal(events[1].identifier, "WEB-23");
    assert.equal(events[2].message, "commented on WEB-456");
  });

  const mock = await startMockControlPlane();
  const mockPort = mock.address().port;

  const reporter = createActivityReporter({
    apiUrl: `http://127.0.0.1:${mockPort}`,
    apiKey: "test-key",
    companyId: COMPANY_ID,
    host: "127.0.0.1",
    port: 0,
    pollMs: 60000,
    windowSize: 50,
    activityBatch: 50,
  });
  const reporterHandle = await reporter.start();
  const reporterPort = reporterHandle.server.address().port;

  await check("state places running agent at desk, review and blocked correctly", () => {
    const state = reporter.getState();
    assert.equal(state.controlPlaneReachable, true);
    const byName = Object.fromEntries(state.agents.map((a) => [a.name, a]));
    assert.equal(byName.Maya.placement.location, "desk");
    assert.equal(byName.Maya.placement.pose, "working");
    assert.equal(byName.Maya.placement.plaque, "WEB-456");
    assert.equal(byName.Clara.placement.location, "desk");
    assert.equal(byName.Clara.placement.pose, "thinking");
    assert.equal(byName.Clara.placement.badge, "review");
    assert.equal(byName.Felix.placement.location, "coffee");
    assert.equal(byName.Felix.placement.pose, "confused");
    assert.equal(byName.Sienna.placement.location, "break");
    assert.equal(byName.Sienna.currentTask, null);
  });

  await check("newestFirst reverses a batch without mutating the input", () => {
    const input = [{ seq: 1 }, { seq: 2 }, { seq: 3 }];
    assert.deepEqual(newestFirst(input).map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(input.map((e) => e.seq), [1, 2, 3]);
  });

  await check("reporter GET /state and GET /activity behave", async () => {
    const stateRes = await fetch(`http://127.0.0.1:${reporterPort}/state`);
    assert.equal(stateRes.status, 200);
    const state = await stateRes.json();
    assert.equal(state.counts.running, 1);

    const actRes = await fetch(`http://127.0.0.1:${reporterPort}/activity`);
    assert.equal(actRes.status, 200);
    const act = await actRes.json();
    assert.deepEqual(act.events.map((e) => e.id), ["e3", "e2", "e1"]);
    assert.deepEqual(act.events.map((e) => e.seq), [3, 2, 1]);
    assert.equal(typeof act.cursor, "number");
    assert.equal(act.cursor, 3);

    const newestRes = await fetch(`http://127.0.0.1:${reporterPort}/activity?limit=2`);
    const newest = await newestRes.json();
    assert.deepEqual(newest.events.map((e) => e.id), ["e3", "e2"]);
    assert.deepEqual(newest.events.map((e) => e.seq), [3, 2]);
    assert.ok(!newest.events.some((e) => e.id === "e1"), "oldest event is not in the newest page");
    assert.equal(newest.cursor, 3);

    const afterRes = await fetch(`http://127.0.0.1:${reporterPort}/activity?since=${act.cursor}`);
    const after = await afterRes.json();
    assert.equal(after.events.length, 0);

    const postRes = await fetch(`http://127.0.0.1:${reporterPort}/state`, { method: "POST" });
    assert.equal(postRes.status, 405);

    const missRes = await fetch(`http://127.0.0.1:${reporterPort}/nope`);
    assert.equal(missRes.status, 404);
  });

  const app = await createOfficeApp({
    host: "127.0.0.1",
    port: 0,
    activityUrl: `http://127.0.0.1:${reporterPort}`,
    timeoutMs: 3000,
  });
  const appHandle = await app.start();
  const appPort = appHandle.server.address().port;

  await check("office-app GET / is self contained and leaks no secret", async () => {
    const res = await fetch(`http://127.0.0.1:${appPort}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    const html = await res.text();
    assert.ok(html.includes('id="avatar-sprite"'), "avatar sprite inlined");
    assert.ok(html.includes('id="agents"'), "agents layer present");
    assert.ok(html.includes("window.__INITIAL_STATE__"), "initial state inlined");
    assert.ok(html.includes('paletteId":"ultraviolet-tide"'), "initial state carries real agent state");
    assert.ok(!html.includes("GHCR_TOKEN"), "secret path absent");
    assert.ok(!html.includes("secret.value.read"), "secret action absent");
    assert.ok(!/src="\/[a-z]/i.test(html), "no external asset endpoints");
  });

  await check("office-app proxies state and activity on approved paths", async () => {
    const stateRes = await fetch(`http://127.0.0.1:${appPort}/live/state`);
    assert.equal(stateRes.status, 200);
    const state = await stateRes.json();
    assert.equal(state.agents.length, 4);

    const actRes = await fetch(`http://127.0.0.1:${appPort}/live/activity`);
    assert.equal(actRes.status, 200);
    const act = await actRes.json();
    assert.deepEqual(act.events.map((e) => e.id), ["e3", "e2", "e1"]);
    assert.deepEqual(act.events.map((e) => e.seq), [3, 2, 1]);

    const postRes = await fetch(`http://127.0.0.1:${appPort}/live/state`, { method: "POST" });
    assert.equal(postRes.status, 405);
    const missRes = await fetch(`http://127.0.0.1:${appPort}/live/other`);
    assert.equal(missRes.status, 404);
  });

  await appHandle.stop();
  await reporterHandle.stop();
  mock.close();

  for (const [status, name] of results) console.log(`${status}  ${name}`);
  const failed = results.filter(([status]) => status === "FAIL");
  if (failed.length) {
    console.error(`\n${failed.length} check(s) failed`);
    process.exit(1);
  }
  console.log(`\nALL ${results.length} CHECKS PASSED`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
