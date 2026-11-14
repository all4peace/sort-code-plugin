/**
 * Runtime equivalence: sorting must never change what a JS module does.
 *
 * Each file in test/runtime/ is executed as-is, sorted, and after many random
 * shuffles (the shuffle obeys the same barriers and preserved kinds as the
 * sorter, so it explores every order the sorter is *allowed* to produce).
 * Logs, results and thrown errors must be identical every time.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";

import { sortText } from "../src/core/sortText";

const DIR = join(__dirname, "runtime");

function run(code: string): string[] {
  const out: string[] = [];
  const sandbox = { console: { log: (...a: unknown[]) => out.push(a.map(String).join(" ")) }, exports: {}, module: { exports: {} } };
  try {
    vm.runInNewContext(code, sandbox, { timeout: 2000 });
  } catch (e) {
    out.push(`THROW ${(e as Error).name}: ${(e as Error).message}`);
  }
  return out;
}

for (const file of readdirSync(DIR).filter(f => /\.(js|cjs)$/.test(f))) {
  const source = readFileSync(join(DIR, file), "utf8");
  const baseline = run(source);

  test(`${file}: baseline runs`, () => {
    assert.ok(baseline.length > 0 && !baseline.some(l => l.startsWith("THROW")), baseline.join("\n"));
  });

  test(`${file}: sorted version behaves identically`, () => {
    const sorted = sortText(source, file);
    assert.ok(sorted.changed, "fixture should exercise sorting");
    assert.deepEqual(run(sorted.text), baseline);
  });

  test(`${file}: every allowed permutation behaves identically`, () => {
    for (let seed = 1; seed <= 40; seed++) {
      const shuffled = sortText(source, file, { shuffleSeed: seed }).text;
      assert.deepEqual(run(shuffled), baseline, `seed ${seed}`);
    }
  });
}
