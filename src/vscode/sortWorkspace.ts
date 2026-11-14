import * as vscode from "vscode";

import { createFileFilter, extensionGlob, minimalEdit, sortText, BUILT_IN_EXCLUDES } from "../core";
import { readSettings, relativePath } from "./settings";

const RUNNING_KEY = "sortCode.sortAllRunning";

export interface SortAllSummary {
  total: number;
  changed: number;
  unchanged: number;
  skipped: number;
  failed: number;
  cancelled: boolean;
}

/**
 * Sorts every eligible file under the given folder (or all workspace folders).
 * Cancellable from the progress notification, the status bar item, or Ctrl+C.
 */
export class WorkspaceSorter implements vscode.Disposable {
  private cts: vscode.CancellationTokenSource | undefined;
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);

  constructor(private readonly log: vscode.OutputChannel) {
    this.status.command = "sortCode.cancelSortWorkspace";
  }

  cancel(): void {
    this.cts?.cancel();
  }

  async run(folder?: vscode.Uri): Promise<SortAllSummary | undefined> {
    if (this.cts) {
      vscode.window.showInformationMessage("Sort Code: Sort All is already running.");
      return undefined;
    }
    const roots = folder ? [folder] : (vscode.workspace.workspaceFolders ?? []).map(f => f.uri);
    if (!roots.length) {
      vscode.window.showWarningMessage("Sort Code: open a folder first.");
      return undefined;
    }

    const files = await this.collect(roots);
    if (!files.length) {
      vscode.window.showInformationMessage("Sort Code: no matching files (check sortCode.fileTypes / include / exclude).");
      return undefined;
    }
    const answer = await vscode.window.showWarningMessage(
      `Sort ${files.length} file(s)? Files are rewritten in place — commit or stash first so you can review the diff.`,
      { modal: true },
      "Sort"
    );
    if (answer !== "Sort") return undefined;

    this.cts = new vscode.CancellationTokenSource();
    await vscode.commands.executeCommand("setContext", RUNNING_KEY, true);
    this.status.show();
    const summary: SortAllSummary = { cancelled: false, changed: 0, failed: 0, skipped: 0, total: files.length, unchanged: 0 };
    this.log.appendLine(`\n=== Sort All: ${files.length} file(s) — ${new Date().toLocaleString()}`);

    try {
      await vscode.window.withProgress(
        { cancellable: true, location: vscode.ProgressLocation.Notification, title: "Sort Code" },
        async (progress, token) => {
          token.onCancellationRequested(() => this.cts?.cancel());
          for (let i = 0; i < files.length; i++) {
            if (this.cts!.token.isCancellationRequested) {
              summary.cancelled = true;
              break;
            }
            const uri = files[i];
            const rel = relativePath(uri);
            progress.report({ increment: 100 / files.length, message: `${i + 1}/${files.length} ${rel}  (Ctrl+C to stop)` });
            this.status.text = `$(sync~spin) Sort Code ${i + 1}/${files.length} — Ctrl+C to stop`;
            const outcome = await this.sortOne(uri);
            summary[outcome]++;
            // Let the UI breathe so Cancel / Ctrl+C are handled promptly.
            await new Promise(r => setTimeout(r, 0));
          }
        }
      );
    } finally {
      this.cts.dispose();
      this.cts = undefined;
      this.status.hide();
      await vscode.commands.executeCommand("setContext", RUNNING_KEY, false);
    }

    const msg =
      `Sort Code: ${summary.changed} sorted, ${summary.unchanged} already sorted, ${summary.skipped} skipped, ${summary.failed} failed` +
      (summary.cancelled ? " — stopped early." : ".");
    this.log.appendLine(msg);
    const pick = await vscode.window.showInformationMessage(msg, "Show Log");
    if (pick) this.log.show(true);
    return summary;
  }

  private async collect(roots: vscode.Uri[]): Promise<vscode.Uri[]> {
    const result: vscode.Uri[] = [];
    for (const root of roots) {
      const s = readSettings(root);
      const filter = createFileFilter(s.filter);
      const exclude = s.filter.useBuiltInExcludes ? `{${BUILT_IN_EXCLUDES.join(",")}}` : null;
      const found = await vscode.workspace.findFiles(new vscode.RelativePattern(root, extensionGlob(s.filter.fileTypes)), exclude);
      result.push(...found.filter(u => filter(relativePath(u))));
    }
    return result.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
  }

  private async sortOne(uri: vscode.Uri): Promise<"changed" | "unchanged" | "skipped" | "failed"> {
    const rel = relativePath(uri);
    try {
      const s = readSettings(uri);
      const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
      if (open) {
        const before = open.getText();
        if (before.length > s.maxFileSizeKB * 1024) return this.skip(rel, "too large");
        const r = sortText(before, open.fileName, s.options);
        this.logHazards(rel, r.hazards);
        if (r.skippedReason) return this.skip(rel, r.skippedReason);
        const e = minimalEdit(before, r.text);
        if (!e) return "unchanged";
        const wasDirty = open.isDirty;
        const we = new vscode.WorkspaceEdit();
        we.replace(uri, new vscode.Range(open.positionAt(e.start), open.positionAt(e.end)), e.text);
        await vscode.workspace.applyEdit(we);
        if (!wasDirty) await open.save();
        this.log.appendLine(`sorted     ${rel}${wasDirty ? " (open with unsaved changes — left unsaved)" : ""}`);
        return "changed";
      }

      const bytes = await vscode.workspace.fs.readFile(uri);
      if (bytes.byteLength > s.maxFileSizeKB * 1024) return this.skip(rel, "too large");
      const decoded = decode(bytes);
      if (!decoded) return this.skip(rel, "not UTF-8");
      const r = sortText(decoded.text, uri.fsPath, s.options);
      this.logHazards(rel, r.hazards);
      if (r.skippedReason) return this.skip(rel, r.skippedReason);
      if (!r.changed) return "unchanged";
      await vscode.workspace.fs.writeFile(uri, encode(r.text, decoded.bom));
      this.log.appendLine(`sorted     ${rel}`);
      return "changed";
    } catch (err) {
      this.log.appendLine(`FAILED     ${rel}: ${err instanceof Error ? err.message : String(err)}`);
      return "failed";
    }
  }

  private skip(rel: string, reason: string): "skipped" {
    this.log.appendLine(`skipped    ${rel} (${reason})`);
    return "skipped";
  }

  private logHazards(rel: string, hazards: { line?: number; message: string }[]): void {
    for (const h of hazards) this.log.appendLine(`  note     ${rel}:${(h.line ?? 0) + 1}  ${h.message}`);
  }

  dispose(): void {
    this.cts?.cancel();
    this.status.dispose();
  }
}

/** UTF-8 only; keeps the BOM (common in .cs files) so the file round-trips byte-for-byte. */
function decode(bytes: Uint8Array): { text: string; bom: boolean } | null {
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return null; // UTF-16
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  try {
    return { bom, text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bom ? bytes.subarray(3) : bytes) };
  } catch {
    return null;
  }
}

function encode(text: string, bom: boolean): Uint8Array {
  const body = new TextEncoder().encode(text);
  if (!bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}
