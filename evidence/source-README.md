# WebWright virtual office (Phase 1)

A single self contained static page that shows all seven WebWright agents as
Paperclip gumdrop avatars, placed and posed from real Paperclip control plane
state captured at generation time.

## Contents

- `generate.mts` - re-runnable generator. Reads the control plane, renders each
  avatar to inline SVG with the shared Paperclip renderer, and writes
  `site/index.html`.
- `site/index.html` - the generated static page. No external requests, no new
  website API endpoint, no Paperclip product code changes.
- `verify-dom.mjs` - jsdom structural check plus three independent spot checks
  against the live control plane.

## Generate

Run from inside the Paperclip repository so `packages/shared` resolves, with the
run scoped control plane variables in the environment:

```sh
node cli/node_modules/tsx/dist/cli.mjs generate.mts --out site
```

Environment: `PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY`, `PAPERCLIP_COMPANY_ID`.
The API key is never printed, persisted or embedded in the page.

## Placement rules

Derived only from real state:

- `in_progress` task: at the agent's desk, `working` pose, task identifier plaque.
- `in_review` task: at the agent's desk, `thinking` pose, review badge.
- `blocked` task: by the coffee machine, `confused` pose, blocked badge.
- Running agent with no tracked task: at the agent's desk, `working` pose.
- Otherwise (idle, paused): break room, `idle` or `rest` pose.

If state is missing or ambiguous, the agent appears in the break room rather than
invented at a desk. Notes are sanitized and shortened; a note that looks
sensitive falls back to showing the status only.

## Publish

```sh
export PAPERCLIP_PAGE_BUCKET=pages.paperclip.ing
export PAPERCLIP_PAGE_BASE_URL=https://pages.paperclip.ing
export AWS_REGION=us-east-1
bash .agents/skills/paperclip-page/scripts/publish.sh site --slug webwright-office
```

Refresh with `--update` from this same directory so the ownership record in
`site/.paperclip-page/state.json` is reused.

Rollback: delete the published objects under the `webwright-office/` prefix, or
let the page be overwritten by a later `--update` publish. The page is public
static content only.
