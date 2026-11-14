/**
 * Golden-file tests.
 *
 *   test/fixtures/<language>/<case>/input.<ext>      what you start with
 *   test/fixtures/<language>/<case>/expected.<ext>   what sorting must produce
 *   test/fixtures/<language>/<case>/hazards.txt      (optional) expected hazard codes, "L<line> <code>"
 *   test/fixtures/<language>/<case>/options.json     (optional) sort options for this case
 *
 * Every case also runs the invariant checks on BOTH input and expected output.
 * Add a case by creating input.<ext> and running `npm run test:update`, then
 * review the generated expected file like any other code review.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { sortText } from "../src/core/sortText";
import { checkInvariants, checkPermutationIndependence, firstDifference } from "./helpers/invariants";

const ROOT = join(__dirname, "fixtures");
const UPDATE = process.env.UPDATE_SNAPSHOTS === "1";

interface Case {
  name: string;
  dir: string;
  inputFile: string;
  expectedFile: string;
  options: Record<string, unknown>;
}

function discover(): Case[] {
  const cases: Case[] = [];
  for (const lang of readdirSync(ROOT)) {
    const langDir = join(ROOT, lang);
    for (const name of readdirSync(langDir)) {
      const dir = join(langDir, name);
      const input = readdirSync(dir).find(f => f.startsWith("input."));
      if (!input) continue;
      const ext = input.slice("input".length);
      const optionsPath = join(dir, "options.json");
      cases.push({
        dir,
        expectedFile: join(dir, `expected${ext}`),
        inputFile: join(dir, input),
        name: `${lang}/${name}`,
        options: existsSync(optionsPath) ? JSON.parse(readFileSync(optionsPath, "utf8")) : {}
      });
    }
  }
  return cases;
}

const formatHazards = (h: { line?: number; code: string }[]): string => h.map(x => `L${(x.line ?? 0) + 1} ${x.code}`).join("\n");

for (const c of discover()) {
  describe(c.name, () => {
    const input = readFileSync(c.inputFile, "utf8");
    const result = sortText(input, c.inputFile, c.options);

    test("matches expected output", () => {
      if (UPDATE || !existsSync(c.expectedFile)) writeFileSync(c.expectedFile, result.text);
      const expected = readFileSync(c.expectedFile, "utf8");
      assert.ok(result.text === expected, `${c.name}: ${firstDifference(expected, result.text)}`);
    });

    test("reports expected hazards", () => {
      const file = join(c.dir, "hazards.txt");
      const actual = formatHazards(result.hazards);
      if (UPDATE) {
        if (actual) writeFileSync(file, actual + "\n");
        else if (existsSync(file)) writeFileSync(file, "");
      }
      const expected = existsSync(file) ? readFileSync(file, "utf8").trim() : "";
      assert.equal(actual, expected);
    });

    test("invariants hold on input", () => {
      assert.deepEqual(checkInvariants(input, c.inputFile, c.options), []);
    });

    test("expected output is a fixed point", () => {
      const expected = readFileSync(c.expectedFile, "utf8");
      assert.equal(sortText(expected, c.inputFile, c.options).text, expected, "sorting the expected output changed it");
    });

    test("result does not depend on input order", () => {
      assert.deepEqual(checkPermutationIndependence(input, c.inputFile, c.options), []);
    });
  });
}
