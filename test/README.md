# Tests

`npm test` runs everything with Node's built-in test runner (no Jest/Mocha).

```
test/
  fixtures/<language>/<case>/   golden files: input.*, expected.*, hazards.txt, options.json
  runtime/*.js                  executed before/after sorting; behaviour must be identical
  helpers/invariants.ts         properties every sort must satisfy
  fixtures.test.ts              golden + invariants + order-independence per case
  runtime.test.ts               runtime equivalence (sorted + 40 legal permutations)
  options.test.ts               one rule / option per test
  fileFilter.test.ts            include / exclude / built-in excludes
  cli.test.ts                   npm run sort as a subprocess (files + folders, --check, --dry-run)
  extension.test.ts             VS Code layer through an in-memory vscode mock
  corpus.ts                     dry-run over a real repo: npm run test:corpus -- <dir>
```

Adding a case: create `fixtures/<lang>/<name>/input.<ext>` (and `options.json` if needed), run
`npm run test:update`, then **read the generated `expected.*` and `hazards.txt` like a code review**.
The golden files are only as good as that review; the invariant and order-independence checks run
regardless and catch lost code, detached comments and comparator bugs.
