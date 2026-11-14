/**
 * Sort files from the command line with the same engine and settings as the extension.
 *
 *   npm run sort -- <file|folder>...             sort in place
 *   npm run sort -- --dry-run <file|folder>...   show what would change, write nothing
 *   npm run sort -- --check <file|folder>...     exit 1 if anything is not sorted (CI / pre-commit)
 *
 * Paths are relative to the directory you ran the command from.
 * Files you name are always sorted (if their type is supported).
 * Folders are walked recursively, honouring built-in excludes and sortCode.include / exclude / fileTypes.
 * Options come from the nearest .vscode/settings.json above each file (sortCode.* keys).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import * as ts from "typescript";

import { createFileFilter, languageFor, sortText } from "./core";
import { settingsFromJson, type SortCodeSettings } from "./core/config";

const HELP = `Usage: npm run sort -- [--check | --dry-run] [--quiet] <file|folder>...

  <file>      sorted if it is .cs .ts .tsx .mts .cts .js .jsx .mjs .cjs
  <folder>    walked recursively; skips node_modules, bin, obj, dist, generated files
              and anything matched by sortCode.exclude in .vscode/settings.json

  --check     write nothing; exit 1 if any file would change (for CI / pre-commit)
  --dry-run   write nothing; print a preview of each change
  --quiet     only print files that change and errors (no hazard notes)
`;

const SKIP_DIRS = new Set(["node_modules", "local_modules", "dist", "bin", "obj", "out", "build", "coverage", ".git", ".vs", ".next"]);

interface Target {
  path: string;
  explicit: boolean;
}

function main(argv: string[]): number {
  const flags = new Set(argv.filter(a => a.startsWith("--")));
  const paths = argv.filter(a => !a.startsWith("--"));
  if (flags.has("--help") || !paths.length) {
    process.stdout.write(HELP);
    return paths.length ? 0 : 2;
  }
  const unknown = [...flags].filter(f => !["--check", "--dry-run", "--quiet", "--help"].includes(f));
  if (unknown.length) {
    process.stderr.write(`Unknown option ${unknown.join(", ")}\n\n${HELP}`);
    return 2;
  }
  const check = flags.has("--check");
  const dryRun = flags.has("--dry-run") || check;
  const quiet = flags.has("--quiet");
  const base = process.env.INIT_CWD ?? process.cwd(); // npm runs scripts from the package folder

  const targets = new Map<string, Target>();
  let errors = 0;
  for (const p of paths) {
    const abs = resolve(base, p);
    if (!existsSync(abs)) {
      process.stderr.write(`not found  ${p}\n`);
      errors++;
      continue;
    }
    if (statSync(abs).isDirectory()) {
      for (const f of walk(abs)) if (!targets.has(f)) targets.set(f, { explicit: false, path: f });
    } else {
      targets.set(abs, { explicit: true, path: abs });
    }
  }

  const counts = { changed: 0, skipped: 0, unchanged: 0 };
  const show = (abs: string): string => relative(base, abs) || abs;

  for (const t of [...targets.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const name = show(t.path);
    if (!languageFor(t.path)) {
      if (t.explicit) process.stdout.write(`skipped    ${name} (unsupported file type)\n`);
      counts.skipped++;
      continue;
    }
    const { settings } = settingsFor(t.path);
    const bytes = readFileSync(t.path);
    if (bytes.byteLength > settings.maxFileSizeKB * 1024) {
      process.stdout.write(`skipped    ${name} (larger than ${settings.maxFileSizeKB} KB)\n`);
      counts.skipped++;
      continue;
    }
    const decoded = decode(bytes);
    if (!decoded) {
      process.stdout.write(`skipped    ${name} (not UTF-8)\n`);
      counts.skipped++;
      continue;
    }

    let result;
    try {
      result = sortText(decoded.text, t.path, settings.options);
    } catch (e) {
      process.stderr.write(`ERROR      ${name}: ${(e as Error).message}\n`);
      errors++;
      continue;
    }

    if (!quiet) for (const h of result.hazards) process.stdout.write(`  note     ${name}:${(h.line ?? 0) + 1}  ${h.message}\n`);
    if (result.skippedReason) {
      process.stdout.write(`skipped    ${name} (${result.skippedReason})\n`);
      counts.skipped++;
      continue;
    }
    if (!result.changed) {
      if (!quiet) process.stdout.write(`unchanged  ${name}\n`);
      counts.unchanged++;
      continue;
    }

    counts.changed++;
    if (dryRun) {
      process.stdout.write(`${check ? "unsorted " : "would sort"} ${name}\n`);
      if (!check) process.stdout.write(preview(decoded.text, result.text));
    } else {
      writeFileSync(t.path, encode(result.text, decoded.bom));
      process.stdout.write(`sorted     ${name}\n`);
    }
  }

  const verb = dryRun ? (check ? "unsorted" : "would change") : "sorted";
  process.stdout.write(`\n${counts.changed} ${verb}, ${counts.unchanged} already sorted, ${counts.skipped} skipped${errors ? `, ${errors} error(s)` : ""}\n`);
  if (errors) return 2;
  return check && counts.changed ? 1 : 0;
}

// ---------------------------------------------------------------- folders

function* walk(dir: string): Generator<string> {
  const { settings, root } = settingsFor(join(dir, "_"));
  const filter = createFileFilter(settings.filter);
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (!(settings.filter.useBuiltInExcludes && SKIP_DIRS.has(name.toLowerCase()))) yield* walk(p);
    } else if (filter(relative(root, p).replace(/\\/g, "/"))) {
      yield p;
    }
  }
}

// ---------------------------------------------------------------- settings

const settingsCache = new Map<string, { settings: SortCodeSettings; root: string }>();

/** Nearest .vscode/settings.json above the file; its parent folder is the "workspace root" for globs. */
function settingsFor(file: string): { settings: SortCodeSettings; root: string } {
  let dir = dirname(file);
  const visited: string[] = [];
  for (;;) {
    const cached = settingsCache.get(dir);
    if (cached) return remember(visited, cached);
    visited.push(dir);
    const candidate = join(dir, ".vscode", "settings.json");
    if (existsSync(candidate)) {
      const parsed = ts.parseConfigFileTextToJson(candidate, readFileSync(candidate, "utf8")); // JSONC: comments, trailing commas
      if (parsed.error) process.stderr.write(`warning: could not parse ${candidate}; using defaults\n`);
      return remember(visited, { root: dir, settings: settingsFromJson((parsed.config ?? {}) as Record<string, unknown>) });
    }
    const parent = dirname(dir);
    if (parent === dir) return remember(visited, { root: process.env.INIT_CWD ?? process.cwd(), settings: settingsFromJson({}) });
    dir = parent;
  }
}

function remember<T>(dirs: string[], value: T & { settings: SortCodeSettings; root: string }): { settings: SortCodeSettings; root: string } {
  for (const d of dirs) settingsCache.set(d, value);
  return value;
}

// ---------------------------------------------------------------- io

function decode(bytes: Uint8Array): { text: string; bom: boolean } | null {
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return null;
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    return { bom, text: new TextDecoder("utf-8", { fatal: true }).decode(bom ? bytes.subarray(3) : bytes) };
  } catch {
    return null;
  }
}

function encode(text: string, bom: boolean): Uint8Array {
  const body = new TextEncoder().encode(text);
  if (!bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}

/** First changed region, a few lines of context. */
function preview(before: string, after: string): string {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const first = a.findIndex((l, i) => l !== b[i]);
  if (first < 0) return "";
  const from = Math.max(0, first - 1);
  return b.slice(from, first + 10).map(l => `    | ${l}\n`).join("") + "    | …\n";
}

process.exitCode = main(process.argv.slice(2));
