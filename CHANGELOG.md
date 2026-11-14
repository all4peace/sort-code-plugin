# Changelog

## 2.0.1

- All commands are always available in the Command Palette (Sort Current File was hidden until the extension activated).
- New **Sort Code: Save Without Sorting** command (same as File: Save without Formatting).

## 2.0.0

- C# support with CodeMaid's Reorganize ordering (kind → access → static → name).
- TS/JS rewritten on the TypeScript parser; top-level sorting only moves declarations that are safe to move.
- Comments, docs, attributes and decorators travel with their member; position-scoped comments are fences.
- Hazard detection: preprocessor conditionals, field-initializer dependencies, struct layout, COM interfaces, load-time dependencies, ORM/schema classes — shown in the Problems panel.
- Opt-in sort on save as the `source.sortCode` code action (`editor.codeActionsOnSave`); Sort All Files with progress and Ctrl+C cancel; include / exclude / file-type settings with built-in excludes.
- New test suite: golden files, invariants, order-independence, runtime equivalence, corpus runner.
