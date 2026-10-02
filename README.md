# WebWright virtual office (Phase 1)

A single self contained static page that shows all seven WebWright agents as
Paperclip gumdrop avatars, placed and posed from real Paperclip control plane
state captured at generation time.

Hosted on GitHub Pages from this repository.

## Live site

After Pages is enabled for this repository, the site is served at:

```
https://revivifai.github.io/the-office/
```

## Contents

- `docs/index.html` - the generated static page. This is what GitHub Pages
  serves. It makes no external requests and adds no website API endpoint.
- `docs/.nojekyll` - disables Jekyll processing so the page is served verbatim.
- `generate.mts` - re-runnable generator. It reads the control plane, renders
  each avatar to inline SVG with the shared Paperclip renderer, and writes the
  page. Kept here for reproducibility.
- `evidence/verification.txt` - the DOM and spot check results recorded when the
  page was built and verified.
- `evidence/source-README.md` - the original build note from the source task.

## Provenance

The page was built and verified on the Paperclip task WEB-388 and published here
after the board operator chose GitHub Pages over the Paperclip page host. The
source bundle `webwright-office.tar.gz` has SHA-256
`0f4e2301b3d666c17ea5e94dfef744c464f1d21743605b3bd403804844348299`.
The published `docs/index.html` has SHA-256
`1c08caa2c2e6154254164dd537d8ebe930742c5da02da68fbad6db808bd12ffd`.

## Generate

Run from inside the Paperclip repository so `packages/shared` resolves, with the
run scoped control plane variables in the environment:

```sh
node cli/node_modules/tsx/dist/cli.mjs generate.mts --out site
```

Environment: `PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY`, `PAPERCLIP_COMPANY_ID`.
The API key is never printed, persisted or embedded in the page.

Copy the regenerated `site/index.html` to `docs/index.html` and commit.

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

## GitHub Pages setup

1. Push `main`.
2. In repository settings, set Pages source to branch `main`, folder `/docs`.
   Equivalent API call once authenticated:
   `gh api -X POST repos/RevivifAI/the-office/pages -f 'source[branch]=main' -f 'source[path]=/docs'`.
3. Verify `https://revivifai.github.io/the-office/` returns HTTP 200 with HTML.

## Rollback

Disable Pages for the repository, or delete this repository. The page is public
static content only.
