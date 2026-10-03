#!/usr/bin/env node
/**
 * Build-time avatar sprite generator.
 *
 * Renders every agent palette in every office pose with the shared Paperclip
 * renderer, then writes assets/avatars.json. The office runtime never imports
 * the Paperclip repository; it only reads this generated asset, so the
 * containers stay self contained and no Paperclip product code is modified.
 *
 * Run from inside the Paperclip repository so packages/shared resolves:
 *
 *   node cli/node_modules/tsx/dist/cli.mjs tools/render-avatars.mts --out assets
 *
 * Environment: PAPERCLIP_REPO_ROOT (default /app) points at the Paperclip repo.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { AGENT_PALETTE_IDS, CHARACTER_STATES } from "../server/lib/office.mjs";

const REPO_ROOT = process.env.PAPERCLIP_REPO_ROOT ?? "/app";

function parseArgs(argv) {
  const args = { out: "assets", size: 64, scale: 2 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--paperclip-root") args.paperclipRoot = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const paperclipRoot = args.paperclipRoot ?? REPO_ROOT;

const { appearanceForPalette } = await import(
  pathToFileURL(resolve(paperclipRoot, "packages/shared/src/agent-appearance.ts")).href
);
const { renderAgentSvg } = await import(
  pathToFileURL(resolve(paperclipRoot, "packages/shared/src/cliplab/static.ts")).href
);

const svg = {};
for (const paletteId of AGENT_PALETTE_IDS) {
  svg[paletteId] = {};
  for (const pose of CHARACTER_STATES) {
    svg[paletteId][pose] = renderAgentSvg(
      appearanceForPalette(paletteId),
      args.size,
      args.scale,
      pose,
      false,
    );
  }
}

const payload = {
  schemaVersion: 1,
  characterVersion: "cap-v1",
  generatedWith: "packages/shared/src/cliplab/static.ts renderAgentSvg",
  size: args.size,
  scale: args.scale,
  poses: CHARACTER_STATES,
  palettes: AGENT_PALETTE_IDS,
  svg,
};

const outDir = resolve(args.out);
await mkdir(outDir, { recursive: true });
const outFile = resolve(outDir, "avatars.json");
await writeFile(outFile, `${JSON.stringify(payload)}\n`, "utf8");

const combos = AGENT_PALETTE_IDS.length * CHARACTER_STATES.length;
const bytes = Buffer.byteLength(JSON.stringify(payload));
console.log(`Wrote ${outFile}: ${combos} avatars, ${bytes} bytes`);
