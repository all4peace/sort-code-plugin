import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createFileFilter, extensionGlob } from "../src/core/fileFilter";

const base = { exclude: [], fileTypes: [".cs", ".ts", ".tsx", ".js", ".jsx"], include: ["**/*"], useBuiltInExcludes: true };

describe("file filter", () => {
  const f = createFileFilter(base);

  test("accepts supported source files", () => {
    for (const p of ["src/a.ts", "App.tsx", "lib/x.js", "Views/Home.cs", "deep/er/c.jsx"]) assert.ok(f(p), p);
  });

  test("ignores unsupported types (.sql etc.)", () => {
    for (const p of ["db/schema.sql", "README.md", "a.json", "style.css"]) assert.ok(!f(p), p);
  });

  test("built-in excludes: dependencies, build output, generated code", () => {
    for (const p of [
      "node_modules/react/index.js",
      "packages/a/node_modules/x/y.ts",
      "local_modules/pkg/a.ts",
      "dist/extension.js",
      "src/Api/bin/Debug/net8.0/x.cs",
      "src/Api/obj/Debug/Api.AssemblyInfo.cs",
      "Forms/Main.Designer.cs",
      "Grpc/Service.g.cs",
      "types/global.d.ts",
      "public/vendor.min.js",
      ".git/hooks/x.js"
    ]) assert.ok(!f(p), p);
  });

  test("built-in excludes can be turned off", () => {
    const g = createFileFilter({ ...base, useBuiltInExcludes: false });
    assert.ok(g("dist/a.ts"));
  });

  test("user excludes win over includes", () => {
    const g = createFileFilter({ ...base, exclude: ["**/legacy/**", "**/*.spec.ts"], include: ["src/**"] });
    assert.ok(g("src/app.ts"));
    assert.ok(!g("src/legacy/old.ts"));
    assert.ok(!g("src/app.spec.ts"));
    assert.ok(!g("tools/build.ts"), "outside include");
  });

  test("file types setting narrows languages", () => {
    const g = createFileFilter({ ...base, fileTypes: [".cs"] });
    assert.ok(g("A.cs"));
    assert.ok(!g("a.ts"));
  });

  test("windows separators and case are normalised", () => {
    assert.ok(!f("src\\Node_Modules\\x.ts"));
    assert.ok(f("src\\App.TS"));
  });

  test("findFiles glob", () => {
    assert.equal(extensionGlob([".cs", ".ts", ".sql"]), "**/*.{cs,ts}");
    assert.equal(extensionGlob([".cs"]), "**/*.cs");
  });
});
