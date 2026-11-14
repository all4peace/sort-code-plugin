/**
 * Corpus check: run every invariant against a real codebase without writing anything.
 *
 *   npm run test:corpus -- ../my-repo                 all supported files
 *   npm run test:corpus -- ../my-repo --ext .cs       only C#
 *   npm run test:corpus -- ../my-repo --show 10       print 10 sample diffs of what would change
 *
 * Exit code 1 if any invariant is violated. This is the best way to gain
 * confidence before turning on sort-on-save for a large repository.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { createFileFilter } from "../src/core/fileFilter";
import { sortText, SUPPORTED_EXTENSIONS } from "../src/core/sortText";
import { checkInvariants, checkPermutationIndependence } from "./helpers/invariants";

const args = process.argv.slice(2);
const root = args.find(a => !a.startsWith("--")) ?? ".";
const extArg = args.indexOf("--ext") >= 0 ? args[args.indexOf("--ext") + 1].split(",") : SUPPORTED_EXTENSIONS;
const show = args.indexOf("--show") >= 0 ? Number(args[args.indexOf("--show") + 1]) : 0;
const permutations = args.includes("--permutations");
const filter = createFileFilter({ exclude: [], fileTypes: extArg, include: ["**/*"], useBuiltInExcludes: true });

const SKIP_DIRS = new Set(["node_modules", "local_modules", "dist", "bin", "obj", "out", "build", "coverage", ".git", ".vs", ".next"]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name.toLowerCase())) yield* walk(p);
    } else if (st.size < 512 * 1024 && filter(relative(root, p).replace(/\\/g, "/"))) yield p;
  }
}

let files = 0;
let changed = 0;
let skipped = 0;
let violations = 0;
let shown = 0;
const hazardCounts = new Map<string, number>();
const skipReasons = new Map<string, number>();
const started = Date.now();
let slowest = { file: "", ms: 0 };

for (const file of walk(root)) {
  files++;
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const t0 = performance.now();
  let result;
  try {
    result = sortText(text, file);
  } catch (e) {
    violations++;
    console.log(`CRASH  ${relative(root, file)}: ${(e as Error).stack}`);
    continue;
  }
  const ms = performance.now() - t0;
  if (ms > slowest.ms) slowest = { file, ms };
  for (const h of result.hazards) hazardCounts.set(h.code, (hazardCounts.get(h.code) ?? 0) + 1);
  if (result.skippedReason) {
    skipped++;
    skipReasons.set(result.skippedReason, (skipReasons.get(result.skippedReason) ?? 0) + 1);
    continue;
  }
  if (result.changed) changed++;

  const v = [...checkInvariants(text, file), ...(permutations ? checkPermutationIndependence(text, file, {}, 2) : [])];
  for (const x of v) {
    violations++;
    console.log(`FAIL   ${relative(root, file)}  [${x.invariant}] ${x.detail}`);
  }
  if (result.changed && shown < show) {
    shown++;
    console.log(`\n--- would change: ${relative(root, file)}`);
    const a = text.split("\n");
    const b = result.text.split("\n");
    const i = a.findIndex((l, n) => l !== b[n]);
    console.log(b.slice(Math.max(0, i - 2), i + 12).map(l => `  | ${l}`).join("\n"));
  }
}

console.log(`\n${files} files in ${((Date.now() - started) / 1000).toFixed(1)}s — ${changed} would change, ${skipped} skipped, ${violations} invariant violation(s)`);
if (skipReasons.size) console.log(`skipped: ${[...skipReasons].map(([k, v]) => `${k} ×${v}`).join(", ")}`);
if (hazardCounts.size) console.log(`hazards: ${[...hazardCounts].map(([k, v]) => `${k} ×${v}`).join(", ")}`);
console.log(`slowest: ${relative(root, slowest.file)} ${slowest.ms.toFixed(0)}ms`);
process.exit(violations ? 1 : 0);
