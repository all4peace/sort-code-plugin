# Sorting rules and hazards

This is the reference for **what** Sort Code moves, **why** it is safe, and — most importantly — **where sorting would be harmful** and what the extension does about it. Every hazard the extension reports in the Problems panel links to a section here.

- [How sorting works](#how-sorting-works)
- [C# rules](#c-rules)
- [TypeScript / JavaScript rules](#typescript--javascript-rules)
- [What is deliberately NOT sorted](#what-is-deliberately-not-sorted)
- [Hazard catalogue](#hazard-catalogue)
- [Opting out](#opting-out)
- [Rolling it out on an existing codebase](#rolling-it-out-on-an-existing-codebase)

---

## How sorting works

Sorting mirrors CodeMaid's *Reorganize* for Visual Studio.

1. The file is parsed. C# uses a structural parser that understands every string flavour (verbatim `@""`, interpolated `$""`, raw `"""…"""`, `$$"""…"""`), char literals, comments and preprocessor directives. TS/JS uses the real TypeScript parser, so JSX, regex literals, template strings and decorators are exact. **If the file does not parse cleanly, nothing is changed.**
2. Each *container* (file, namespace, class body) is split into **members**. Every member takes its comments with it:
   - XML doc / JSDoc and `//` comments directly above it,
   - attributes / decorators,
   - a trailing comment on its last line (`int x; // note`).
3. **Fences** never move, and nothing moves across them: `#region`, `#endregion`, `#if…#endif` blocks, `#pragma`, `//#region`, `eslint-disable` blocks, `sort-code-disable` blocks, and any statement whose position matters at runtime (see the TS rules). Members are sorted **within** the space between fences.
4. Each run of members is sorted with a stable comparator (below). If the order is already correct, the original text — including its blank lines — is kept byte-for-byte, so already-sorted files never produce a diff.
5. Blank lines: consecutive single-line members of the same kind (fields, auto-properties, expression-bodied one-liners) stay tight if they were tight before; everything else gets one blank line between members.

### The comparator

| Priority | `primarySort: "kind"` (default, CodeMaid) | `primarySort: "access"` |
|---|---|---|
| 1 | Member kind | Access level |
| 2 | Access level | Member kind |
| 3 | `const` → `static readonly` → `static` → `readonly` → instance (`staticFirst`) | same |
| 4 | Name, case-insensitive | same |
| 5 | Original position (overloads keep their relative order) | same |

Access order (setting `accessOrder`): `public` → `internal` → `protected internal` → `protected` → `private protected` → `private`.

---

## C# rules

**Kind order** (`sortCode.csharp.memberOrder`, CodeMaid default):
fields → constructors → destructors → delegates → events → enums → interfaces → properties → indexers → methods → structs → classes.

- Records sort as classes, `record struct` as structs.
- Operators and conversion operators are methods (`operator +`, `operator string`).
- Static constructors sort first among constructors.
- Explicit interface implementations (`void IDisposable.Dispose()`) have no modifier but are reachable through the interface, so they sort as `public`.
- Type declarations inside a namespace (or file-scoped namespace) are sorted too, by the same kind order (`csharp.sortTypes`).
- `using` directives, global attributes (`[assembly: …]`) and top-level statements never move.
- **Enum members are never sorted.**

## TypeScript / JavaScript rules

A JS module **runs top to bottom when it is imported**. That makes top-level sorting the dangerous part, so only declarations that execute *nothing* when evaluated are allowed to move:

| Moves | Why it is safe |
|---|---|
| `function f() {}` | Hoisted. |
| `interface` / `type` | Erased at compile time. |
| `const f = () => …` / `const f = function …` | Creating a function runs none of its body. |
| `const X = <literal>` | Literals, arrays/objects of literals, template strings… that read **no other same-file `const`/`let`/`class`/`enum`**. |
| `class C {}` | Only if its `extends`, decorators, static initializers and computed keys read no same-file binding. |
| `enum E {}` | Only if its initializers read no same-file binding. |

Everything else is a **fence**: imports, `export … from`, `export default <expr>`, `module.exports = …`, calls (`register()`, `app.use()`, `describe()`), `const X = memo(Comp)`, `styled.div\`\``, `let`/`var`, destructuring, directives like `"use client"`, namespaces.

**Top-level kind order** (`sortCode.typescript.topLevelOrder`): types → enums → constants → functions → classes. Exported declarations count as `public`, non-exported as `private`, so exports come first.

**Class member kind order** (`sortCode.typescript.memberOrder`): index signatures → fields → constructor → accessors → methods.

- `private`, `#private` → private; `protected` → protected; otherwise public. `_name` counts as private only with `typescript.underscoreIsPrivate` (handy for plain JS).
- Arrow-function properties (`onClick = () => …`) sort with methods (`typescript.arrowFunctionPropertiesAsMethods`) — unless a field initializer reads them during construction, in which case they are fields (see [field-initializer-dependency](#field-initializer-dependency)).
- Overload signatures stay glued to their implementation; a `get`/`set` pair stays together.
- `static { }` blocks are fences.
- Classes nested anywhere (inside functions, class expressions) are sorted too; `namespace` bodies follow the top-level rules.

---

## What is deliberately NOT sorted

These are either handled well by VS Code / ESLint already, or sorting them changes behaviour:

| Not sorted | Why |
|---|---|
| Imports / `using` | `source.organizeImports` already does it. A side-effect import (`import "./polyfills"`) must keep its position. |
| Object literal keys | `sort-keys-fix` already does it. Key order is observable (`JSON.stringify`, `Object.keys`). |
| Interface / type-literal members | Lint territory; no runtime effect. |
| JSX props | `react/jsx-sort-props` does it; spread order matters (`{...a} x={1}`). |
| **Enum members** (C# and TS) | Implicit values come from position (`Up = 0, Down = 1`). Reordering silently changes persisted or transmitted numbers and `[Flags]` combinations. |
| Statements inside function bodies | Order is the program. |
| Parameters, record positional parameters, tuple elements | Part of the signature. |

> Tip: let `@typescript-eslint/member-ordering` / `perfectionist/sort-classes` go, or configure them exactly like this extension. Two tools owning the same order will fight on every save.

---

## Hazard catalogue

Hazards are shown in the **Problems** panel (setting `sortCode.showHazards`) and in the **Sort All** log. A hazard is only reported when it actually stopped something from moving.

### `syntax-error`
**Warning — file not sorted.** The file did not parse (unbalanced braces, half-typed code, invalid JSX such as a raw `}` in JSX text). Sorting a broken file could move half a member, so it is skipped entirely. Fix the error and save again.

### `preprocessor-conditional`
**C#.** `#if … #elif … #else … #endif` around whole members.
- A balanced block is treated as one immovable fence. Members above and below it sort separately, and nothing crosses it. *(CodeMaid refuses the whole file; this is finer-grained.)*
- `#if X [Attribute] #endif` directly above a member stays glued to that member, and both stay in place.
- An `#if` whose `#endif` is outside the type body (e.g. alternative class headers) makes that block unsortable — warning.
- `#if` *inside* a method body is irrelevant and reported nothing.

Why: each branch may declare different members, and moving members in or out of a branch changes which configurations compile them.

### `field-initializer-dependency`
**C# and TS.** Field (and auto-property) initializers run **in declaration order**. If one reads another, alphabetizing can read a value before it is assigned:

```csharp
public static readonly string Root = GetRoot();
public static readonly string Logs = Path.Combine(Root, "logs"); // must stay below Root
```
Sorted naively, `Logs` would come first and read `null` — a classic, silent bug. Same in TS:

```ts
subtotal = 100;
total = this.subtotal * 1.13;   // must stay below subtotal
```
When detected, the field order of that class is kept exactly as written (other members still sort). Arrow-function properties that are read during initialization (`sub = bus.subscribe(this.onChange)`) are pinned as fields too.
Not detected: indirect reads through a property getter or a method call (`int a = ComputeFromB();`). If you rely on those, use `sortCode.fieldOrder: "preserve"` or a `sort-code-disable` block.

### `struct-layout`
**C#.** In a `struct`, or a class with `[StructLayout]`, field order **is the memory layout**: P/Invoke, `Marshal`, `Unsafe.As`, `MemoryMarshal.Cast`, binary file formats and network packets all depend on it. Field order is kept; methods and properties still sort.

### `com-interop`
**C#.** An interface with `[ComImport]` or `[InterfaceType]` is a COM vtable: method N is slot N. Reordering calls the wrong method at runtime with no compile error. Nothing in such an interface is reordered.

### `load-time-dependency`
**TS/JS.** A class or enum whose load-time parts read another same-file binding stays where it is:

```ts
class Base {}
export class Repo extends Base {}            // `extends Base` runs at load: Repo stays below Base
enum Limits { Max = 10 }
export enum Level { High = Limits.Max }      // reads Limits at load: stays below it
```
Moving either above what it reads throws `ReferenceError: Cannot access 'Base' before initialization` (the temporal dead zone).

### `schema-order`
**TS.** Classes decorated with `@Entity`, `@ViewEntity`, `@Embeddable` (TypeORM / MikroORM), `@Table` (sequelize-typescript), `@ObjectType`, `@InputType`, `@ArgsType`, `@InterfaceType` (TypeGraphQL / NestJS GraphQL) or `@Schema` (Mongoose / NestJS) turn field order into column order or schema field order. Reordering changes generated migrations and published schemas. Field order is kept; methods still sort.

### `generated-file`
Files containing `<auto-generated` or `@generated` in their first 2,000 characters are skipped (plus `*.Designer.cs`, `*.g.cs`, `*.g.i.cs`, `*.generated.*`, `*.d.ts`, `*.min.js` by path).

### `disabled-by-comment`
The file contains `sort-code-disable-file`.

---

## Hazards that cannot be detected — know these

These depend on libraries and conventions the extension cannot see. Review the first sort of such files, then protect them with `sort-code-disable` / `sortCode.exclude` / `fieldOrder: "preserve"`, or (better) make the order explicit in code:

**C#**
- **JSON output order.** `System.Text.Json` and `Newtonsoft.Json` serialize properties in declaration order. Sorting changes the JSON text (not the data). Snapshot / approval tests and consumers that diff JSON will notice. Fix: `[JsonPropertyOrder(n)]` / `[JsonProperty(Order = n)]`.
- **Positional serializers.** `XmlSerializer` element order, `[DataContract]` without `Order`, protobuf-net with `ImplicitFields`, `BinaryFormatter`, CsvHelper without `[Index]`/`[Name]`. Fix: explicit `Order`/`Index` attributes.
- **EF Core migrations.** New tables get columns in property order; existing databases are not affected.
- **Tests that depend on declaration order** (some MSTest setups). They were already fragile.
- **`#pragma warning disable` without a matching `restore`** — the pragma is a fence, but members that moved below it are now covered by it.

**TS/JS**
- **Side-effect order of decorators** across members (rare; registries that record decoration order).
- **Indirect load-time reads**: a "pure" constant can't call anything, but a class `static` initializer that calls an imported function which reads this module's bindings (circular import) is not traced.
- **`Object.keys(SomeClass.prototype)`** / reflection that lists methods in declaration order.
- **Auto-save.** With `"source.sortCode": "explicit"` sorting only runs when you save yourself (Cmd/Ctrl+S); `files.autoSave` saves never sort, so code does not jump around while you type. `"always"` would sort on auto-save too — not recommended.

---

## Opting out

| Scope | How |
|---|---|
| Sorting on save at all | Don't list `source.sortCode` in `editor.codeActionsOnSave` (it is off by default) |
| One save | **File: Save without Formatting** — `Cmd+K S` (mac) / `Ctrl+K S` |
| A range of members | `// sort-code-disable` … `// sort-code-enable` (members inside stay put and act as one fence) |
| A file | `// sort-code-disable-file` anywhere in the file |
| Folders / patterns | `sortCode.exclude: ["**/Legacy/**", "**/*.spec.ts"]` |
| A language | Remove its extension from `sortCode.fileTypes` |
| Field order only | `sortCode.fieldOrder: "preserve"` |
| Top-level JS only | `sortCode.typescript.sortTopLevel: false` |

## Rolling it out on an existing codebase

1. Run the corpus check against your repo first — it never writes, and fails if any invariant is violated:
   `npm run test:corpus -- /path/to/repo --show 5`
2. Commit everything, then run **Sort Code: Sort All Files in Workspace** on a clean tree.
3. Build, run your tests, review the hazards in the log.
4. Commit the result as one commit, and add its hash to `.git-blame-ignore-revs` so `git blame` skips it:
   ```
   git config blame.ignoreRevsFile .git-blame-ignore-revs
   ```
5. Add `"source.sortCode": "explicit"` to `editor.codeActionsOnSave` in the repo's `.vscode/settings.json` and commit it. From now on every save keeps files alphabetized, so two people adding methods to the same class insert them at different, deterministic places — far fewer merge conflicts.
