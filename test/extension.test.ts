/**
 * Integration tests for the VS Code layer (save hook, commands, Sort All),
 * driven through an in-memory mock of the vscode API. No Electron needed.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import type * as Extension from "../src/extension";
import { createVscodeMock, installVscodeMock, MockDocument } from "./helpers/vscodeMock";

const UNSORTED = "export function zed() {}\nexport function alpha() {}\n";
const SORTED = "export function alpha() {}\nexport function zed() {}\n";

let mock: ReturnType<typeof createVscodeMock>;

async function activate(): Promise<void> {
  mock = createVscodeMock();
  installVscodeMock(mock.vscode);
  // Fresh module instance per test so state (skip set, listeners) does not leak.
  for (const k of Object.keys(require.cache)) if (k.includes("/src/")) delete require.cache[k];
  const ext = require("../src/extension") as typeof Extension;
  (ext.activate as (c: unknown) => void)({ subscriptions: [] });
}

describe("extension", () => {
  beforeEach(activate);

  const ON_SAVE = { "source.organizeImports": "explicit", "source.sortCode": "explicit" };

  test("does nothing on save unless settings.json opts in", async () => {
    const doc = mock.open(new MockDocument("/ws/src/a.ts", UNSORTED));
    await mock.save(doc, {});
    assert.equal(doc.text, UNSORTED);
    await mock.save(doc, { "source.fixAll.eslint": "explicit", "source.organizeImports": "explicit" });
    assert.equal(doc.text, UNSORTED, "other source actions do not trigger sorting");
  });

  test('sorts on save with "source.sortCode": "explicit"', async () => {
    const doc = mock.open(new MockDocument("/ws/src/a.ts", UNSORTED));
    await mock.save(doc, ON_SAVE);
    assert.equal(doc.text, SORTED);
  });

  test('"explicit" does not run on auto-save; "always" does', async () => {
    const doc = mock.open(new MockDocument("/ws/src/a.ts", UNSORTED));
    await mock.save(doc, ON_SAVE, false);
    assert.equal(doc.text, UNSORTED);
    await mock.save(doc, { "source.sortCode": "always" }, false);
    assert.equal(doc.text, SORTED);
  });

  test("also offered from the Source Action… menu (kind \"source\")", async () => {
    const doc = mock.open(new MockDocument("/ws/src/a.ts", UNSORTED));
    const actions = await mock.runCodeActions(doc, "source");
    assert.equal(actions.length, 1);
    assert.equal(actions[0].title, "Sort members");
    assert.equal(doc.text, SORTED);
  });

  test("no action when already sorted", async () => {
    const doc = mock.open(new MockDocument("/ws/src/a.ts", SORTED));
    assert.equal((await mock.runCodeActions(doc, "source.sortCode")).length, 0);
  });

  test("CRLF files stay CRLF", async () => {
    const doc = mock.open(new MockDocument("/ws/src/a.ts", UNSORTED.replace(/\n/g, "\r\n")));
    await mock.save(doc, ON_SAVE);
    assert.equal(doc.text, SORTED.replace(/\n/g, "\r\n"));
  });

  test("built-in excludes apply (node_modules, dist, bin/obj)", async () => {
    for (const p of ["/ws/node_modules/x/a.ts", "/ws/dist/a.ts", "/ws/Api/obj/a.cs"]) {
      const doc = mock.open(new MockDocument(p, p.endsWith(".cs") ? "class C\n{\n    void B() { }\n    void A() { }\n}\n" : UNSORTED));
      const before = doc.text;
      await mock.save(doc, ON_SAVE);
      assert.equal(doc.text, before, p);
    }
  });

  test("user exclude and fileTypes are honoured", async () => {
    mock.config.exclude = ["**/legacy/**"];
    const legacy = mock.open(new MockDocument("/ws/src/legacy/a.ts", UNSORTED));
    await mock.save(legacy, ON_SAVE);
    assert.equal(legacy.text, UNSORTED);

    mock.config.fileTypes = [".cs"];
    const ts = mock.open(new MockDocument("/ws/src/b.ts", UNSORTED));
    await mock.save(ts, ON_SAVE);
    assert.equal(ts.text, UNSORTED);
  });

  test("a file with a syntax error is saved untouched and the reason is shown", async () => {
    const broken = "export function zed() {\nexport function alpha() {}\n";
    const doc = mock.open(new MockDocument("/ws/src/a.ts", broken));
    await mock.save(doc, ON_SAVE);
    assert.equal(doc.text, broken);
    const diags = mock.diagnostics.get(doc.uri.toString()) ?? [];
    assert.equal(diags[0]?.code?.value, "syntax-error");
  });

  test("hazards appear as diagnostics after save", async () => {
    const doc = mock.open(new MockDocument("/ws/src/a.ts", "class C {\n  b = this.a + 1;\n  a = 1;\n}\n"));
    await mock.save(doc, ON_SAVE);
    const diags = mock.diagnostics.get(doc.uri.toString()) ?? [];
    assert.equal(diags[0]?.code?.value, "field-initializer-dependency");
  });

  test("Sort Current File command sorts the active editor", async () => {
    const doc = mock.open(new MockDocument("/ws/src/a.ts", UNSORTED));
    await mock.commands.get("sortCode.sortCurrentFile")!();
    assert.equal(doc.text, SORTED);
  });

  test("Sort All sorts every eligible file and skips excluded ones", async () => {
    mock.files.set("/ws/src/a.ts", UNSORTED);
    mock.files.set("/ws/src/b.cs", "class C\n{\n    void B() { }\n    void A() { }\n}\n");
    mock.files.set("/ws/node_modules/x/c.ts", UNSORTED);
    mock.files.set("/ws/db/schema.sql", "select 1;");
    const summary = await mock.commands.get("sortCode.sortWorkspace")!();
    assert.equal(mock.files.get("/ws/src/a.ts"), SORTED);
    assert.match(mock.files.get("/ws/src/b.cs")!, /void A[\s\S]*void B/);
    assert.equal(mock.files.get("/ws/node_modules/x/c.ts"), UNSORTED);
    assert.equal(summary.changed, 2);
    assert.equal(summary.cancelled, false);
    assert.equal(mock.context.get("sortCode.sortAllRunning"), false, "context key reset");
  });

  test("Sort All asks first and does nothing when declined", async () => {
    mock.files.set("/ws/src/a.ts", UNSORTED);
    mock.setWarningAnswer(undefined);
    await mock.commands.get("sortCode.sortWorkspace")!();
    assert.equal(mock.files.get("/ws/src/a.ts"), UNSORTED);
  });

  test("Sort All stops when cancelled (Ctrl+C)", async () => {
    for (let i = 0; i < 20; i++) mock.files.set(`/ws/src/f${String(i).padStart(2, "0")}.ts`, UNSORTED);
    mock.setOnProgress(i => {
      if (i === 4) void mock.commands.get("sortCode.cancelSortWorkspace")!();
    });
    const summary = await mock.commands.get("sortCode.sortWorkspace")!();
    assert.equal(summary.cancelled, true);
    assert.ok(summary.changed > 0 && summary.changed < 20, `changed ${summary.changed}`);
    const untouched = [...mock.files.values()].filter(t => t === UNSORTED).length;
    assert.equal(untouched, 20 - summary.changed);
  });

  test("Sort All edits open documents in place instead of overwriting them on disk", async () => {
    mock.files.set("/ws/src/open.ts", UNSORTED);
    const doc = mock.open(new MockDocument("/ws/src/open.ts", UNSORTED));
    doc.isDirty = true;
    await mock.commands.get("sortCode.sortWorkspace")!();
    assert.equal(doc.text, SORTED);
    assert.equal(doc.saved, 0, "dirty document left unsaved");
    assert.equal(mock.files.get("/ws/src/open.ts"), UNSORTED, "disk not written behind the editor's back");
  });
});
