# WebWright virtual office

Two services that turn the Phase 1 static preview into a live office on the
agent hive box, reachable only through the same SSH local port forward used for
the board.

- `office-activity` (the reporter) polls the local Paperclip control plane over
  loopback, keeps a rolling window of real activity events plus a live state
  snapshot in memory, and serves both on `127.0.0.1:3110`.
- `office-app` (the office) serves a single self contained live page on
  `127.0.0.1:3101` and proxies the reporter. Avatars move to their desks when
  runs start, sit by the coffee machine when blocked, and a ticker shows real
  events with real identifiers and timestamps.

The Phase 1 static page is preserved unchanged at `docs/index.html` and is still
served by GitHub Pages from this repository.

## Endpoints (approved scope, WEB-383)

GET only, loopback only, read only. Do not add paths, methods or exposure
without fresh board approval under the board's standing WEB-255 endpoint gate.

| Service | Bind | Endpoints |
| --- | --- | --- |
| `office-activity` | `127.0.0.1:3110` | `GET /state`, `GET /activity?since=<cursor>&limit=<n>` |
| `office-app` | `127.0.0.1:3101` | `GET /`, `GET /live/state`, `GET /live/activity` |

The office stack never writes to the control plane. `GET /` inlines all CSS,
the avatar sprite and the client script, so there is no static asset endpoint.

## Open it

Same pattern as the board:

```sh
ssh -L 3101:127.0.0.1:3101 <hive-host>
# then open http://127.0.0.1:3101
```

## Configuration

`office-activity`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PAPERCLIP_API_URL` | `http://127.0.0.1:3100` | Control plane base URL |
| `PAPERCLIP_API_KEY` | none | Read scoped service credential, from the Vault rendered env file |
| `PAPERCLIP_COMPANY_ID` | none | Company to report on |
| `OFFICE_ACTIVITY_HOST` | `127.0.0.1` | Bind address |
| `OFFICE_ACTIVITY_PORT` | `3110` | Bind port |
| `OFFICE_POLL_MS` | `10000` | Poll interval |
| `OFFICE_WINDOW_SIZE` | `300` | Rolling activity window |
| `OFFICE_ACTIVITY_BATCH` | `50` | Control plane activity page size |

`office-app`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `OFFICE_APP_HOST` | `127.0.0.1` | Bind address |
| `OFFICE_APP_PORT` | `3101` | Bind port |
| `OFFICE_ACTIVITY_URL` | `http://127.0.0.1:3110` | Reporter base URL |

No credential is ever logged, returned or embedded in the page.

## Placement rules

Derived only from real state:

- `in_progress` task: at the agent's desk, `working` pose, task identifier plaque.
- `in_review` task: at the agent's desk, `thinking` pose, review badge.
- `blocked` task: by the coffee machine, `confused` pose, blocked badge.
- Running agent with no tracked task: at the agent's desk, `working` pose.
- Otherwise (idle, paused): break room, `idle` or `rest` pose.

If state is missing or ambiguous, the agent appears in the break room rather than
invented at a desk. Notes are sanitized and shortened; a note that looks
sensitive is dropped. Activity events that touch secrets are filtered out.

## Develop and test

No runtime dependencies. Node 20 or newer.

```sh
npm test                 # mock control plane, in-process end to end checks
npm run start:activity   # reporter
npm run start:app        # office page + proxy
```

The avatar sprite in `assets/avatars.json` is generated at build time from the
shared Paperclip renderer, so the runtime never imports the Paperclip repository
and no Paperclip product code is modified. Regenerate from inside the Paperclip
repository:

```sh
PAPERCLIP_REPO_ROOT=/path/to/paperclip \
  node cli/node_modules/tsx/dist/cli.mjs tools/render-avatars.mts --out assets
```

## Containers

One dependency-free image runs either service, selected by command. Publish to
GHCR happens in `.github/workflows/publish.yml` on merge to `main`:

```
ghcr.io/revivifai/office-activity:latest
ghcr.io/revivifai/office-app:latest
```

Pin a tag or digest in `/opt/hive/.env` (`OFFICE_ACTIVITY_IMAGE`,
`OFFICE_APP_IMAGE`); `docker-compose.example.yml` shows the shape. The operator
applies the host wiring from the `cerberus` `host-hive` repository, which owns
the real compose and systemd units.

## Rollback

Stop and disable the two systemd units and remove the containers. Nothing holds
state beyond the in-memory window. The Phase 1 static page is untouched.
