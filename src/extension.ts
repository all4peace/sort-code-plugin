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

    if (!isSupportedLanguage(editor.document.languageId)) {
      vscode.window.showWarningMessage("This command only works with TypeScript and JavaScript files.");
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

function isSupportedLanguage(languageId: string): boolean {
  return ["typescript", "javascript", "typescriptreact", "javascriptreact"].includes(languageId);
}
