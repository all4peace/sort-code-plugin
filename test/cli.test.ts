/** The command-line sorter, run as a real subprocess against a temp project. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, test } from "node:test";

const CLI = join(__dirname, "..", "src", "cli.ts");
const TS_UNSORTED = "export function zed() {}\nexport function alpha() {}\n";
const TS_SORTED = "export function alpha() {}\nexport function zed() {}\n";
const CS_UNSORTED = "class C\n{\n    public void B() { }\n    public void A() { }\n}\n";

let dir: string;

function write(rel: string, text: string | Uint8Array): void {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), text);
}
const read = (rel: string): string => readFileSync(join(dir, rel), "utf8");

/** Runs `npm run sort -- …` the way npm does: cwd = package folder, INIT_CWD = where the user was. */
function sort(...args: string[]): { code: number; out: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], {
    cwd: join(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, INIT_CWD: dir }
  });
  return { code: r.status ?? -1, out: r.stdout + r.stderr };
}

describe("cli", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sortcode-"));
  });

  test("sorts 3 files and 1 folder, paths relative to where it was run", () => {
    write("a.ts", TS_UNSORTED);
    write("b.cs", CS_UNSORTED);
    write("c.tsx", TS_UNSORTED);
    write("lib/d.ts", TS_UNSORTED);
    write("lib/deep/e.js", TS_UNSORTED);
    write("lib/node_modules/x/f.ts", TS_UNSORTED);
    write("lib/bin/Debug/g.cs", CS_UNSORTED);
    write("lib/schema.sql", "select 1;");
    write("untouched.ts", TS_UNSORTED);

    const r = sort("a.ts", "b.cs", "c.tsx", "lib");
    assert.equal(r.code, 0, r.out);
    assert.equal(read("a.ts"), TS_SORTED);
    assert.match(read("b.cs"), /void A[\s\S]*void B/);
    assert.equal(read("c.tsx"), TS_SORTED);
    assert.equal(read("lib/d.ts"), TS_SORTED);
    assert.equal(read("lib/deep/e.js"), TS_SORTED);
    assert.equal(read("lib/node_modules/x/f.ts"), TS_UNSORTED, "built-in exclude");
    assert.match(read("lib/bin/Debug/g.cs"), /void B[\s\S]*void A/, "bin excluded");
    assert.equal(read("untouched.ts"), TS_UNSORTED, "not named");
    assert.match(r.out, /5 sorted/);
  });

  test("--dry-run writes nothing", () => {
    write("a.ts", TS_UNSORTED);
    const r = sort("--dry-run", "a.ts");
    assert.equal(r.code, 0);
    assert.match(r.out, /would sort/);
    assert.equal(read("a.ts"), TS_UNSORTED);
  });

  test("--check exits 1 when unsorted, 0 when sorted, and writes nothing", () => {
    write("a.ts", TS_UNSORTED);
    assert.equal(sort("--check", "a.ts").code, 1);
    assert.equal(read("a.ts"), TS_UNSORTED);
    write("a.ts", TS_SORTED);
    assert.equal(sort("--check", "a.ts").code, 0);
  });

  test("reads sortCode.* from .vscode/settings.json (JSONC)", () => {
    write(".vscode/settings.json", '{\n  // comment\n  "sortCode.exclude": ["**/legacy/**"],\n  "sortCode.primarySort": "access",\n}\n');
    write("src/legacy/old.ts", TS_UNSORTED);
    write("src/new.ts", TS_UNSORTED);
    write("src/m.cs", "class C\n{\n    private int _x;\n    public void Run() { }\n}\n");
    const r = sort("src");
    assert.equal(r.code, 0, r.out);
    assert.equal(read("src/legacy/old.ts"), TS_UNSORTED);
    assert.equal(read("src/new.ts"), TS_SORTED);
    assert.ok(read("src/m.cs").indexOf("Run") < read("src/m.cs").indexOf("_x"), "primarySort access applied");
  });

  test("keeps BOM and CRLF", () => {
    write("a.cs", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(CS_UNSORTED.replace(/\n/g, "\r\n"))]));
    sort("a.cs");
    const bytes = readFileSync(join(dir, "a.cs"));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(!/[^\r]\n/.test(bytes.toString("utf8")));
  });

  test("syntax errors are skipped, missing paths are errors", () => {
    write("bad.ts", "function x( {\n");
    const r = sort("bad.ts", "nope.ts");
    assert.equal(r.code, 2);
    assert.match(r.out, /skipped +bad\.ts \(syntax error\)/);
    assert.match(r.out, /not found +nope\.ts/);
    assert.equal(read("bad.ts"), "function x( {\n");
  });

  test("no arguments prints usage", () => {
    const r = sort();
    assert.equal(r.code, 2);
    assert.match(r.out, /Usage: npm run sort/);
  });
});
