# Sort Code — CodeMaid-style member sorting for VS Code

Alphabetize members in **C#**, **TypeScript** and **JavaScript** the way CodeMaid's *Reorganize* does in Visual Studio: public first, then internal, then private, alphabetical inside each group, comments travelling with their member. Save, and it's sorted.

Why: when every file is kept in a deterministic order, two people adding methods to the same class insert them in different places, so **git conflicts mostly disappear** and diffs are easier to read.

Supported: `.cs`, `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`. (`.sql` is intentionally not supported.)

```csharp
// before                                   // after save
public class OrderService                   public class OrderService
{                                           {
    private void Validate(Order o) { }          public const int MaxItems = 100;
    /// <summary>Submits.</summary>             private readonly IRepository _repo;
    public void Submit(Order o) { }
    private readonly IRepository _repo;         public OrderService(IRepository r) { … }
    public OrderService(IRepository r) { … }
    internal void Audit() { }                   public string Name { get; set; }
    public string Name { get; set; }
    public const int MaxItems = 100;            /// <summary>Submits.</summary>
}                                               public void Submit(Order o) { }

                                                internal void Audit() { }
                                                private void Validate(Order o) { }
                                            }
```

## Features

- **Opt-in sort on save** through `editor.codeActionsOnSave` in your `.vscode/settings.json`, exactly like `source.organizeImports`. Nothing happens automatically until a workspace asks for it.
- **Save without sorting** with VS Code's own *File: Save without Formatting* (`Cmd+K S` / `Ctrl+K S`), which skips every on-save action.
- **Sort All Files in Workspace** with a progress bar; stop it any time with **Ctrl+C**, the Cancel button, or the status-bar item.
- **Comments, XML docs, JSDoc, attributes and decorators move with their member.** Trailing `// comments` stay on their line.
- **Safe by construction**: a file that doesn't parse is never touched; `#region`, `#if`, `#pragma`, `//#region`, `eslint-disable` blocks are fences; JS statements that run code at load time never move; field initializers that depend on each other keep their order. See [docs/SORTING_RULES.md](docs/SORTING_RULES.md).
- **Hazards in the Problems panel**: whenever something was *not* sorted because sorting would be harmful, you see where and why, with a link to the explanation.
- Leaves alone what VS Code and ESLint already do well: imports (`source.organizeImports`), object keys (`sort-keys-fix`), interface members, JSX props.

## Commands

| Command | Mac | Windows / Linux |
|---|---|---|
| Sort Code: Sort Current File | `Cmd+M Cmd+Z` | `Ctrl+M Ctrl+Z` |
| File: Save without Formatting (built-in, skips sorting) | `Cmd+K S` | `Ctrl+K S` |
| Source Action… → **Sort members** | right-click → Source Action… | |
| Sort Code: Sort All Files in Workspace | Command Palette, or right-click a folder in Explorer | |
| Sort Code: Cancel Sort All | `Ctrl+C` while Sort All runs | `Ctrl+C` |
| Sort Code: Show Sorting Hazards in Current File | Command Palette | |

> Want save-without-sorting on another key (e.g. `Cmd+P`, which is normally Quick Open)? Add to `keybindings.json`:
> ```jsonc
> { "key": "cmd+p", "command": "workbench.action.files.saveWithoutFormatting", "when": "editorTextFocus && sortCode.supported" }
> ```

## Turning on sort-on-save (per workspace)

Sorting on save is **off** until a workspace opts in. Add `source.sortCode` to `.vscode/settings.json`:

```jsonc
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "prettier.endOfLine": "crlf",
  "files.eol": "\r\n",
  "editor.codeActionsOnSave": {
    "source.organizeImports": "always",
    "source.sortCode": "explicit",
    "source.fixAll.eslint": "always"
  }
}
```

- `"explicit"`: sort only when you save yourself (Cmd/Ctrl+S). Auto-save (`files.autoSave`) never sorts, so code doesn't jump while you type. Use `"always"` to include auto-saves.
- Actions run in the order listed: organize imports → sort members → ESLint fixes, then Prettier formats the result (`formatOnSave`).
- Line endings are preserved: CRLF files stay CRLF.
- Committing this file shares the behaviour with the whole team; leave it out of `.vscode/settings.json` and nothing is sorted.
- One save without sorting: **File: Save without Formatting** (`Cmd+K S`).
- Without any setting you can still sort by hand: `Cmd+M Cmd+Z`, *Source Action… → Sort members*, or *Sort All Files in Workspace*.

If your ESLint config has `@typescript-eslint/member-ordering` or `perfectionist/sort-classes`, turn it off. Two tools owning the same order will fight.

## Command line

Sort any mix of files and folders with the same engine and the same `.vscode/settings.json` options as the extension:

```bash
npm run sort -- src/Orders/OrderService.cs src/api/client.ts src/components/Card.tsx src/Billing
npm run sort -- --dry-run src/Billing        # preview, writes nothing
npm run sort -- --check src                  # CI / pre-commit: exit 1 if anything is unsorted
```

```
  note     Billing/Paths.cs:3  class Paths: initializer of 'B' reads 'A'. … field order is kept as written.
sorted     Billing/Paths.cs
sorted     src/Card.tsx
unchanged  Billing/done.ts

3 sorted, 1 already sorted, 0 skipped
```

- Paths are relative to the directory you run it from. From another repo: `npm --prefix ~/work/sort-code-plugin run sort -- ./src/A.cs ./src/Billing`.
- Files you name are always sorted (if the type is supported). Folders are walked recursively and honour the built-in excludes plus `sortCode.include` / `exclude` / `fileTypes`.
- Options are read from the nearest `.vscode/settings.json` above each file (JSONC is fine).
- Shell globs work: `npm run sort -- src/**/*Service.cs`.
- BOMs and line endings are preserved; files that don't parse are skipped and reported. `--quiet` hides hazard notes.
- Exit codes: `0` ok, `1` unsorted files found with `--check`, `2` errors (missing path, bad arguments).

## Settings

| Setting | Default | |
|---|---|---|
| `sortCode.fileTypes` | all supported | Extensions to sort, e.g. `[".cs"]` for C# only. |
| *(sort on save)* | off | Not a `sortCode.*` setting: add `"source.sortCode": "explicit"` to `editor.codeActionsOnSave`. |
| `sortCode.include` | `["**/*"]` | Globs (workspace-relative) a file must match. |
| `sortCode.exclude` | `[]` | Extra globs never sorted. Wins over `include`. |
| `sortCode.useBuiltInExcludes` | `true` | Always skip `node_modules`, `local_modules`, `dist`, `bin`, `obj`, `out`, `build`, `coverage`, `.git`, `.vs`, `.next`, `*.Designer.cs`, `*.g.cs`, `*.g.i.cs`, `*.generated.*`, `*.min.js`, `*.d.ts`. |
| `sortCode.maxFileSizeKB` | `512` | Larger files are skipped. |
| `sortCode.primarySort` | `"kind"` | `kind`: fields, ctors, properties, methods… then public→private inside each (CodeMaid). `access`: all public members first. |
| `sortCode.accessOrder` | public, internal, protectedInternal, protected, privateProtected, private | |
| `sortCode.staticFirst` | `true` | const/static before instance within the same kind and access. |
| `sortCode.fieldOrder` | `"sortWhenSafe"` | `preserve` never reorders fields; `sort` always does (see hazards). |
| `sortCode.detachedComments` | `"attach"` | A comment followed by a blank line moves with the next member (`attach`) or stays as a section divider (`boundary`). |
| `sortCode.csharp.memberOrder` | CodeMaid order | field, constructor, destructor, delegate, event, enum, interface, property, indexer, method, struct, class |
| `sortCode.csharp.sortTypes` | `true` | Also sort types inside a namespace. |
| `sortCode.typescript.memberOrder` | indexSignature, field, constructor, accessor, method | |
| `sortCode.typescript.topLevelOrder` | type, enum, variable, function, class | |
| `sortCode.typescript.sortTopLevel` | `true` | Sort safe top-level declarations. |
| `sortCode.typescript.sortClassMembers` | `true` | |
| `sortCode.typescript.arrowFunctionPropertiesAsMethods` | `true` | `onClick = () => {}` sorts with methods. |
| `sortCode.typescript.underscoreIsPrivate` | `false` | `_name` counts as private (plain JS). |
| `sortCode.showHazards` | `true` | Show hazards in the Problems panel. |

Per-folder settings work, so a monorepo can e.g. turn off top-level sorting in one package.

## Where sorting is harmful (summary)

Full details and examples: **[docs/SORTING_RULES.md](docs/SORTING_RULES.md)**.

**C#**
- `#region` blocks — sorted *within* the region, regions stay put.
- `#if … #endif` around members — the block is a fixed fence; members around it sort separately (CodeMaid skips the whole file).
- `#pragma warning disable/restore`, `#nullable` — position-scoped, so they're fences.
- `static readonly` / field initializers that read other fields — order kept (classic `null` bug otherwise).
- `struct` and `[StructLayout]` fields — memory layout, order kept.
- `[ComImport]` interfaces — vtable order, never reordered.
- Enum members — never sorted (implicit values).
- *Not detectable:* JSON/XML/protobuf output order follows declaration order unless you use explicit `Order` attributes.

**TypeScript / JavaScript**
- Top-level code runs on import: only hoisted / side-effect-free declarations move; calls, `memo()`/`styled`, `export default expr`, `module.exports` are fences.
- `const B = A + 1`, `class X extends Y`, enum initializers that read same-file bindings — would hit the temporal dead zone; kept in place.
- Class fields whose initializers read other fields (`total = this.subtotal * 1.13`) — order kept.
- `@Entity` / `@ObjectType` / `@Schema` classes — field order = column/schema order, kept.
- `static {}` blocks, overloads, get/set pairs — fenced or kept together.
- Position-scoped comments: `/* eslint-disable */`, `//#region`, `@ts-nocheck`, `prettier-ignore-start` — fences.
- `"use strict"`, `"use client"`, shebangs, file headers — stay at the top.
- Enum members, object keys, imports, JSX props — never sorted.

## Opting out

- `// sort-code-disable` … `// sort-code-enable` around members that must keep their order.
- `// sort-code-disable-file` for a whole file.
- `sortCode.exclude` for folders and patterns.

## Testing

The sorter is a pure function (`src/core`, no VS Code dependency), so everything is tested in plain Node with `node:test`:

```bash
npm test                    # all tests
npm run test:update         # regenerate golden files after an intended change (then review the diff!)
npm run test:corpus -- ../some-repo --show 5   # dry-run against a real codebase, never writes
```

| Layer | What it proves |
|---|---|
| **Golden files** (`test/fixtures/<lang>/<case>/input.* → expected.*`, `hazards.txt`, `options.json`) | The intended output for each rule and hazard. One folder per scenario; adding a case = adding an `input` file and running `test:update`. |
| **Invariants** (run on every fixture *and* every corpus file) | Nothing lost or duplicated (token multiset identical), same comments, each comment still next to the same code, output still parses, line endings preserved, sorting is idempotent. |
| **Order independence** | Shuffle every sortable run, sort again → same result as sorting the original. Catches comparator and comment-attachment bugs no hand-written fixture covers. |
| **Runtime equivalence** (`test/runtime/*.js`) | Execute the original, the sorted file, and 40 random *allowed* permutations in a VM: logs, results and errors must be identical. This is what proves the TDZ / side-effect rules are right. |
| **Unit tests** | Option-by-option behaviour, include/exclude globs, minimal-edit computation. |
| **CLI** (`test/cli.test.ts`) | `npm run sort` as a real subprocess on a temp project: 3 files + 1 folder, built-in excludes, `--dry-run`, `--check` exit codes, `.vscode/settings.json` (JSONC) options, BOM/CRLF kept, syntax errors skipped. |
| **Extension integration** (`test/extension.test.ts`) | The real `src/extension.ts` driven through an in-memory `vscode` mock: no sorting unless `codeActionsOnSave` lists `source.sortCode`, `"explicit"` vs `"always"` on auto-save, Source Action menu, CRLF kept, excludes and file types honoured, diagnostics published, Sort All confirms / sorts / skips excluded / stops on Ctrl+C / edits open documents instead of overwriting them. No Electron download needed. |
| **Corpus** | Run the invariants over thousands of real files (Newtonsoft.Json, AutoMapper, MediatR, zod, swr, zustand were used during development: 0 violations). Point it at your own repos before enabling sort-on-save. |

## Development

```bash
npm install
npm run build        # bundles to dist/extension.js (TypeScript compiler is bundled)
npm run typecheck && npm run lint && npm test
```
Press **F5** in VS Code to launch an Extension Development Host. `npx @vscode/vsce package` builds the `.vsix`.

## Release notes

### 2.0.0
Complete redesign: C# support, CodeMaid ordering, real parsers, hazard detection and reporting, opt-in sort on save via `codeActionsOnSave` (`source.sortCode`), Sort All with progress and cancellation, include/exclude settings, new test suite.
