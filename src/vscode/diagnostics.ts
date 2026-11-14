import * as vscode from "vscode";

import type { Hazard } from "../core";

const DOCS = "https://github.com/all4peace/sort-code-plugin/blob/main/docs/SORTING_RULES.md";

export class HazardDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("sortCode");

  set(doc: vscode.TextDocument, hazards: Hazard[]): void {
    const diags = hazards.map(h => {
      const pos = doc.positionAt(h.offset);
      const line = doc.lineAt(Math.min(pos.line, doc.lineCount - 1));
      const range = new vscode.Range(pos, line.range.end.isAfter(pos) ? line.range.end : pos);
      const d = new vscode.Diagnostic(
        range,
        h.message,
        h.severity === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information
      );
      d.source = "Sort Code";
      d.code = { target: vscode.Uri.parse(`${DOCS}#${h.code}`), value: h.code };
      return d;
    });
    this.collection.set(doc.uri, diags);
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
