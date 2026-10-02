#!/usr/bin/env node
/**
 * office-app: the WebWright live office application.
 *
 * Serves the self contained live office page and proxies the activity reporter
 * over loopback:
 *
 *   GET /                 the live office page (single response, all assets inline)
 *   GET /live/state       proxy to office-activity GET /state
 *   GET /live/activity    proxy to office-activity GET /activity
 *
 * GET only, loopback only, read only. This is the exact endpoint scope approved
 * on WEB-383; do not add paths, methods or exposure without fresh board approval
 * under WEB-255.
 *
 * Environment:
 *   OFFICE_APP_HOST         bind address (default 127.0.0.1)
 *   OFFICE_APP_PORT         bind port (default 3101)
 *   OFFICE_ACTIVITY_URL     reporter base URL (default http://127.0.0.1:3110)
 *   OFFICE_ACTIVITY_TIMEOUT reporter request timeout ms (default 6000)
 */

import http from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { renderPage } from "./page.mjs";

const DEFAULT_POLL_MS = 5000;

export function readConfig(env = process.env) {
  return {
    host: env.OFFICE_APP_HOST ?? "127.0.0.1",
    port: Number(env.OFFICE_APP_PORT ?? 3101),
    activityUrl: (env.OFFICE_ACTIVITY_URL ?? "http://127.0.0.1:3110").replace(/\/+$/, ""),
    timeoutMs: Math.max(500, Number(env.OFFICE_ACTIVITY_TIMEOUT ?? 6000)),
  };
}

async function readAsset(relative, fallback) {
  try {
    return await readFile(new URL(relative, import.meta.url), "utf8");
  } catch {
    return fallback;
  }
}

export async function createOfficeApp(config = readConfig()) {
  const avatarsJson = await readAsset("../assets/avatars.json", '{"svg":{}}');
  const clientJs = await readAsset("./client.js", "");

  async function reporter(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const res = await fetch(`${config.activityUrl}${path}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const body = await res.text();
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  }

  async function page() {
    let initialStateJson = "null";
    try {
      const res = await reporter("/state");
      if (res.status === 200) initialStateJson = res.body;
    } catch {
      initialStateJson = "null";
    }
    return renderPage({ avatarsJson, clientJs, initialStateJson, pollMs: DEFAULT_POLL_MS });
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    if (req.method !== "GET") {
      send(res, 405, "application/json", JSON.stringify({ error: "method_not_allowed" }), { Allow: "GET" });
      return;
    }
    if (url.pathname === "/") {
      send(res, 200, "text/html; charset=utf-8", await page());
      return;
    }
    if (url.pathname === "/live/state" || url.pathname === "/live/activity") {
      const suffix = url.pathname === "/live/activity" ? `/activity${url.search}` : "/state";
      try {
        const proxied = await reporter(suffix);
        send(res, proxied.status, "application/json; charset=utf-8", proxied.body);
      } catch {
        send(res, 502, "application/json", JSON.stringify({ error: "reporter_unreachable" }));
      }
      return;
    }
    send(res, 404, "application/json", JSON.stringify({ error: "not_found" }));
  }

  async function start() {
    const server = http.createServer((req, res) => {
      void handle(req, res).catch(() => {
        if (!res.headersSent) send(res, 500, "application/json", JSON.stringify({ error: "internal_error" }));
      });
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, resolve);
    });
    return {
      server,
      stop: () => new Promise((resolve) => server.close(resolve)),
    };
  }

  return { start, handle, page, reporter };
}

function send(res, status, contentType, body, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

async function main() {
  const config = readConfig();
  const app = await createOfficeApp(config);
  const { stop } = await app.start();
  console.log(`office-app listening on http://${config.host}:${config.port} (reporter ${config.activityUrl})`);
  const shutdown = () => {
    void stop().then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`office-app failed to start: ${error && error.message ? error.message : error}`);
    process.exit(1);
  });
}
