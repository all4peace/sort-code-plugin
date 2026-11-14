/**
 * Just enough of the `vscode` API to drive src/extension.ts in plain Node.
 * Documents are in-memory; positions carry their offset so edits can be applied.
 */
import Module from "node:module";

type Listener<T> = (e: T) => any;

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
    readonly offset = 0
  ) {}
  isAfter(o: Position): boolean {
    return this.offset > o.offset;
  }
}
export class Range {
  constructor(
    readonly start: Position,
    readonly end: Position
  ) {}
}

export class CodeActionKind {
  static readonly Source = new CodeActionKind("source");
  constructor(readonly value: string) {}
  append(part: string): CodeActionKind {
    return new CodeActionKind(`${this.value}.${part}`);
  }
  contains(other: CodeActionKind): boolean {
    return other.value === this.value || other.value.startsWith(`${this.value}.`);
  }
}

export class MockDocument {
  isDirty = false;
  saved = 0;
  constructor(
    public fileName: string,
    public text: string
  ) {}
  get uri(): any {
    const fsPath = this.fileName;
    return { fsPath, scheme: "file", toString: () => `file://${fsPath}` };
  }
  get languageId(): string {
    return this.fileName.endsWith(".cs") ? "csharp" : "typescript";
  }
  get lineCount(): number {
    return this.text.split("\n").length;
  }
  getText(): string {
    return this.text;
  }
  positionAt(offset: number): Position {
    const before = this.text.slice(0, offset).split("\n");
    return new Position(before.length - 1, before[before.length - 1].length, offset);
  }
  lineAt(line: number): any {
    const lines = this.text.split("\n");
    let start = 0;
    for (let i = 0; i < line; i++) start += lines[i].length + 1;
    return { range: new Range(this.positionAt(start), this.positionAt(start + lines[line].length)) };
  }
  apply(edits: { range: Range; newText: string }[]): void {
    for (const e of [...edits].sort((a, b) => b.range.start.offset - a.range.start.offset)) {
      this.text = this.text.slice(0, e.range.start.offset) + e.newText + this.text.slice(e.range.end.offset);
    }
  }
  async save(): Promise<boolean> {
    this.saved++;
    this.isDirty = false;
    return true;
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createVscodeMock() {
  const listeners: Record<string, Listener<any>[]> = {};
  const on =
    (name: string) =>
    (fn: Listener<any>): any => {
      (listeners[name] ??= []).push(fn);
      return { dispose() {} };
    };
  const commands = new Map<string, (...a: any[]) => any>();
  const context = new Map<string, unknown>();
  const config: Record<string, unknown> = {};
  const files = new Map<string, string>();
  const diagnostics = new Map<string, any[]>();
  const messages: string[] = [];
  let warningAnswer: string | undefined = "Sort";
  let onProgress: ((i: number) => void) | undefined;

  const state = {
    activeDocument: undefined as MockDocument | undefined,
    textDocuments: [] as MockDocument[]
  };

  const providers: any[] = [];

  /** Asks every provider for actions of `kind`, like VS Code does for codeActionsOnSave / Source Action. */
  async function runCodeActions(doc: MockDocument, kind: string): Promise<any[]> {
    const only = new CodeActionKind(kind);
    const actions: any[] = [];
    for (const p of providers) actions.push(...((await p.provideCodeActions(doc, null, { only, triggerKind: 1 })) ?? []));
    for (const a of actions) for (const e of a.edit?.edits ?? []) doc.apply([e]);
    return actions;
  }

  /**
   * Simulates a save the way VS Code does it: runs the kinds listed in
   * `editor.codeActionsOnSave` ("explicit" only on a manual save), then saves.
   */
  async function save(doc: MockDocument, codeActionsOnSave: Record<string, string> = {}, manual = true): Promise<void> {
    for (const [kind, when] of Object.entries(codeActionsOnSave)) {
      if (when === "always" || (when === "explicit" && manual)) await runCodeActions(doc, kind);
    }
    await doc.save();
    for (const l of listeners.didSave ?? []) l(doc);
  }

  const vscode: any = {
    CancellationTokenSource: class {
      private handlers: (() => void)[] = [];
      token = {
        isCancellationRequested: false,
        onCancellationRequested: (h: () => void) => this.handlers.push(h)
      };
      cancel(): void {
        this.token.isCancellationRequested = true;
        this.handlers.forEach(h => h());
      }
      dispose(): void {}
    },
    CodeAction: class {
      edit: any;
      constructor(
        readonly title: string,
        readonly kind: CodeActionKind
      ) {}
    },
    CodeActionKind,
    Diagnostic: class {
      code: unknown;
      source = "";
      constructor(
        readonly range: Range,
        readonly message: string,
        readonly severity: number
      ) {}
    },
    DiagnosticSeverity: { Error: 0, Information: 2, Warning: 1 },
    Position,
    ProgressLocation: { Notification: 15 },
    Range,
    RelativePattern: class {
      constructor(
        readonly base: any,
        readonly pattern: string
      ) {}
    },
    StatusBarAlignment: { Left: 1 },
    TextDocumentSaveReason: { AfterDelay: 2, FocusOut: 3, Manual: 1 },
    TextEdit: { replace: (range: Range, newText: string) => ({ newText, range }) },
    Uri: {
      file: (p: string) => ({ fsPath: p, scheme: "file", toString: () => `file://${p}` }),
      parse: (s: string) => ({ toString: () => s })
    },
    WorkspaceEdit: class {
      edits: { uri: any; range: Range; newText: string }[] = [];
      replace(uri: any, range: Range, newText: string): void {
        this.edits.push({ newText, range, uri });
      }
    },
    commands: {
      executeCommand: async (id: string, ...args: any[]) => {
        if (id === "setContext") {
          context.set(args[0], args[1]);
          return;
        }
        return commands.get(id)?.(...args);
      },
      registerCommand: (id: string, fn: (...a: any[]) => any) => {
        commands.set(id, fn);
        return { dispose() {} };
      }
    },
    languages: {
      createDiagnosticCollection: () => ({
        delete: (uri: any) => diagnostics.delete(uri.toString()),
        dispose() {},
        set: (uri: any, d: any[]) => diagnostics.set(uri.toString(), d)
      }),
      registerCodeActionsProvider: (_selector: unknown, provider: unknown) => {
        providers.push(provider);
        return { dispose() {} };
      }
    },
    window: {
      get activeTextEditor() {
        const doc = state.activeDocument;
        return doc && { document: doc, edit: async (cb: (b: any) => void) => cb({ replace: (r: Range, t: string) => doc.apply([{ newText: t, range: r }]) }) };
      },
      createOutputChannel: () => ({ appendLine: (l: string) => messages.push(l), dispose() {}, show() {} }),
      createStatusBarItem: () => ({ dispose() {}, hide() {}, show() {}, text: "" }),
      onDidChangeActiveTextEditor: on("activeEditor"),
      setStatusBarMessage: (m: string) => messages.push(m),
      showErrorMessage: async (m: string) => messages.push(m),
      showInformationMessage: async (m: string) => {
        messages.push(m);
        return undefined;
      },
      showWarningMessage: async (m: string) => {
        messages.push(m);
        return warningAnswer;
      },
      withProgress: async (_opts: any, task: (p: any, t: any) => Promise<any>) => {
        let i = 0;
        return task({ report: () => onProgress?.(i++) }, { isCancellationRequested: false, onCancellationRequested: () => ({}) });
      }
    },
    workspace: {
      applyEdit: async (we: any) => {
        for (const e of we.edits) state.textDocuments.find(d => d.uri.toString() === e.uri.toString())?.apply([e]);
        return true;
      },
      asRelativePath: (uri: any) => String(uri.fsPath ?? uri).replace(/^\/ws\//, ""),
      findFiles: async () => [...files.keys()].map(p => vscode.Uri.file(p)),
      fs: {
        readFile: async (uri: any) => new TextEncoder().encode(files.get(uri.fsPath)),
        writeFile: async (uri: any, bytes: Uint8Array) => void files.set(uri.fsPath, new TextDecoder().decode(bytes))
      },
      getConfiguration: () => ({ get: (key: string, dflt?: unknown) => (key in config ? config[key] : dflt) }),
      onDidChangeConfiguration: on("config"),
      onDidCloseTextDocument: on("didClose"),
      onDidOpenTextDocument: on("didOpen"),
      onDidSaveTextDocument: on("didSave"),
      onWillSaveTextDocument: on("willSave"),
      get textDocuments() {
        return state.textDocuments;
      },
      workspaceFolders: [{ uri: { fsPath: "/ws", scheme: "file", toString: () => "file:///ws" } }]
    }
  };

  return {
    commands,
    config,
    context,
    diagnostics,
    files,
    messages,
    open(doc: MockDocument): MockDocument {
      state.textDocuments.push(doc);
      state.activeDocument = doc;
      return doc;
    },
    runCodeActions,
    save,
    setOnProgress(fn: (i: number) => void) {
      onProgress = fn;
    },
    setWarningAnswer(a: string | undefined) {
      warningAnswer = a;
    },
    vscode
  };
}

/** Makes `require("vscode")` return the mock. Call before importing src/extension. */
export function installVscodeMock(mock: unknown): void {
  const M = Module as any;
  const original = M._load;
  M._load = function (request: string, ...rest: unknown[]) {
    if (request === "vscode") return mock;
    return original.call(this, request, ...rest);
  };
}
