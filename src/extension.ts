import * as vscode from "vscode";
import { VSCodeFunctionSorter } from "./vscodeIntegration.js";

export function activate(context: vscode.ExtensionContext): void {
  console.log("Sort Code Plugin is now active!");

  const functionSorter = new VSCodeFunctionSorter();

  // Register command for sorting current file
  const sortCurrentFileCommand = vscode.commands.registerCommand("sortCodePlugin.sortCurrentFile", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor found.");
      return;
    }

    if (!isSupportedFile(editor.document)) {
      vscode.window.showWarningMessage(
        "This command only works with TypeScript and JavaScript files (.ts, .js, .tsx, .jsx, .mjs, .cjs, .mts, .cts)."
      );
      return;
    }

    try {
      await functionSorter.sortFunctionsInEditor(editor);
      vscode.window.showInformationMessage("Functions sorted successfully!");
    } catch (error) {
      vscode.window.showErrorMessage(`Error sorting functions: ${error}`);
    }
  });

  context.subscriptions.push(sortCurrentFileCommand);
}

export function deactivate(): void {
  console.log("Sort Code Plugin deactivated.");
}

function isSupportedFile(document: vscode.TextDocument): boolean {
  // Check language ID first
  const supportedLanguageIds = ["typescript", "javascript", "typescriptreact", "javascriptreact"];
  if (supportedLanguageIds.includes(document.languageId)) {
    return true;
  }

  // Check file extension as backup for files that might not have the correct language ID
  const fileName = document.fileName.toLowerCase();
  const supportedExtensions = [".ts", ".js", ".tsx", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
  return supportedExtensions.some(ext => fileName.endsWith(ext));
}
