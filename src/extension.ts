import * as vscode from "vscode";

import { minimalEdit, sortText, type SortResult } from "./core";
import { HazardDiagnostics } from "./vscode/diagnostics";
import { isIncluded, isSupportedType, readSettings } from "./vscode/settings";
import { WorkspaceSorter } from "./vscode/sortWorkspace";

/**
 * Sorting on save is NOT automatic. It is a code action of kind `source.sortCode`,
 * enabled per workspace in .vscode/settings.json exactly like organize-imports:
 *
 *   "editor.codeActionsOnSave": { "source.sortCode": "explicit" }
 *
 * "Save without Formatting" (Cmd+K S) skips it, like every other on-save action.
 */
export const SORT_KIND = vscode.CodeActionKind.Source.append("sortCode");

const LANGUAGES = ["csharp", "typescript", "typescriptreact", "javascript", "javascriptreact"];

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("Sort Code");
  const diagnostics = new HazardDiagnostics();
  const workspaceSorter = new WorkspaceSorter(log);
  context.subscriptions.push(log, diagnostics, workspaceSorter);

  const analyze = (doc: vscode.TextDocument): SortResult | undefined => {
    const s = readSettings(doc.uri);
    if (!isSupportedType(doc, s) || doc.getText().length > s.maxFileSizeKB * 1024) return undefined;
    try {
      return sortText(doc.getText(), doc.fileName, s.options);
    } catch (err) {
      log.appendLine(`Internal error analysing ${doc.fileName}: ${err instanceof Error ? err.stack : String(err)}`);
      return undefined;
    }
  };

  const refreshDiagnostics = (doc: vscode.TextDocument): void => {
    const s = readSettings(doc.uri);
    if (!s.showHazards || !isSupportedType(doc, s)) {
      diagnostics.clear(doc.uri);
      return;
    }
    diagnostics.set(doc, analyze(doc)?.hazards ?? []);
  };

  const updateContext = (editor: vscode.TextEditor | undefined): void => {
    const supported = !!editor && isSupportedType(editor.document, readSettings(editor.document.uri));
    void vscode.commands.executeCommand("setContext", "sortCode.supported", supported);
  };

  const provider: vscode.CodeActionProvider = {
    provideCodeActions(doc, _range, ctx) {
      // Only when asked for (codeActionsOnSave or the Source Action menu), never as a lightbulb.
      if (!ctx.only || !ctx.only.contains(SORT_KIND)) return [];
      const s = readSettings(doc.uri);
      if (!isSupportedType(doc, s) || !isIncluded(doc.uri, s)) return [];
      const r = analyze(doc);
      const edit = r?.changed ? minimalEdit(doc.getText(), r.text) : null;
      if (!edit) return [];
      const action = new vscode.CodeAction("Sort members", SORT_KIND);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(doc.uri, new vscode.Range(doc.positionAt(edit.start), doc.positionAt(edit.end)), edit.text);
      return [action];
    }
  };

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      LANGUAGES.map(language => ({ language })),
      provider,
      { providedCodeActionKinds: [SORT_KIND] }
    ),
    vscode.workspace.onDidSaveTextDocument(refreshDiagnostics),
    vscode.workspace.onDidOpenTextDocument(refreshDiagnostics),
    vscode.workspace.onDidCloseTextDocument(doc => diagnostics.clear(doc.uri)),
    vscode.window.onDidChangeActiveTextEditor(updateContext),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (!e.affectsConfiguration("sortCode")) return;
      updateContext(vscode.window.activeTextEditor);
      vscode.workspace.textDocuments.forEach(refreshDiagnostics);
    }),

    vscode.commands.registerCommand("sortCode.sortCurrentFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const doc = editor.document;
      if (!isSupportedType(doc, readSettings(doc.uri))) {
        vscode.window.showWarningMessage("Sort Code: this file type is not enabled (sortCode.fileTypes).");
        return;
      }
      const r = analyze(doc);
      if (!r) return;
      if (r.skippedReason) {
        vscode.window.showWarningMessage(`Sort Code: not sorted — ${r.skippedReason}.`);
      } else {
        const edit = minimalEdit(doc.getText(), r.text);
        if (edit) {
          await editor.edit(b => b.replace(new vscode.Range(doc.positionAt(edit.start), doc.positionAt(edit.end)), edit.text));
        }
        vscode.window.setStatusBarMessage(edit ? "$(check) Sort Code: sorted" : "$(check) Sort Code: already sorted", 3000);
      }
      refreshDiagnostics(doc);
    }),

    vscode.commands.registerCommand("sortCode.sortWorkspace", (folder?: vscode.Uri) => workspaceSorter.run(folder)),
    vscode.commands.registerCommand("sortCode.cancelSortWorkspace", () => workspaceSorter.cancel()),

    vscode.commands.registerCommand("sortCode.showHazards", async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc) return;
      const r = analyze(doc);
      diagnostics.set(doc, r?.hazards ?? []);
      if (r?.hazards.length) await vscode.commands.executeCommand("workbench.actions.view.problems");
      else vscode.window.showInformationMessage("Sort Code: nothing in this file limits sorting.");
    })
  );

  updateContext(vscode.window.activeTextEditor);
  vscode.workspace.textDocuments.forEach(refreshDiagnostics);
}

export function deactivate(): void {}
