import * as vscode from "vscode";

import { FunctionSorter } from "./coreFunctionSorter.js";

/**
 * VS Code extension wrapper for the function sorter
 * This handles the VS Code editor integration
 */
export class VSCodeFunctionSorter {
  private coreSorter: FunctionSorter;

  constructor() {
    this.coreSorter = new FunctionSorter();
  }

  async sortFunctionsInEditor(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    const text = document.getText();

    // Use the core sorter to get the sorted content
    const sortedContent = await this.coreSorter.sortContent(text);

    // Replace the entire document content with the sorted version
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));

    await editor.edit(editBuilder => {
      editBuilder.replace(fullRange, sortedContent);
    });
  }
}
