import type { SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import * as vscode from "vscode";

interface FunctionInfo {
  node: Node;
  name: string;
  isPublic: boolean;
  startPos: number;
  endPos: number;
  text: string;
}

export class FunctionSorter {
  private project: Project;

  constructor() {
    this.project = new Project({
      compilerOptions: {
        allowJs: true,
        target: 99 // Latest
      },
      useInMemoryFileSystem: true
    });
  }

  /**
   * Sorts functions in the provided content string and returns the sorted result
   * @param content The file content to sort
   * @param fileName The file name (for ts-morph processing)
   * @returns The sorted content
   */
  async sortContent(content: string): Promise<string> {
    // Create source file in ts-morph
    const sourceFile = this.project.createSourceFile("temp.ts", content, { overwrite: true });

    // Sort functions in different contexts using simplified logic
    this.sortTopLevelFunctionsInSourceFile(sourceFile);
    this.sortClassMethodsInSourceFile(sourceFile);
    this.sortInterfaceMethodsInSourceFile(sourceFile);

    // Get the sorted content
    const sortedContent = sourceFile.getFullText();

    // Clean up
    sourceFile.delete();

    return sortedContent;
  }

  async sortFunctionsInEditor(editor: vscode.TextEditor): Promise<void> {
    const document = editor.document;
    const text = document.getText();
    const fileName = document.fileName;
    const fileExtension = fileName.split(".").pop()?.toLowerCase();

    // Create source file in ts-morph
    const sourceFile = this.project.createSourceFile(`temp.${fileExtension}`, text, { overwrite: true });

    // Sort functions in different contexts
    await this.sortTopLevelFunctions(sourceFile, editor);
    await this.sortClassMethods(sourceFile, editor);
    await this.sortInterfaceMethods(sourceFile, editor);
  }

  private async applySortedFunctions(functions: FunctionInfo[], editor: vscode.TextEditor): Promise<void> {
    // Sort functions: public first, then alphabetically by name
    const sortedFunctions = functions.sort((a, b) => {
      // First, sort by visibility (public first)
      if (a.isPublic !== b.isPublic) {
        return a.isPublic ? -1 : 1;
      }
      // Then, sort alphabetically by name
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    // Group consecutive functions for batch replacement
    const groups = this.groupConsecutiveFunctions(sortedFunctions);

    // Apply replacements in reverse order to maintain position integrity
    for (let i = groups.length - 1; i >= 0; i--) {
      const group = groups[i];
      const startPos = editor.document.positionAt(group.startPos);
      const endPos = editor.document.positionAt(group.endPos);
      const range = new vscode.Range(startPos, endPos);

      const sortedText = group.functions.map(f => f.text).join("");

      await editor.edit(editBuilder => {
        editBuilder.replace(range, sortedText);
      });
    }
  }

  private groupConsecutiveFunctions(
    functions: FunctionInfo[]
  ): { startPos: number; endPos: number; functions: FunctionInfo[] }[] {
    if (functions.length === 0) {
      return [];
    }

    const groups: { startPos: number; endPos: number; functions: FunctionInfo[] }[] = [];
    let currentGroup = {
      endPos: functions[0].endPos,
      functions: [functions[0]],
      startPos: functions[0].startPos
    };

    for (let i = 1; i < functions.length; i++) {
      const prevFunc = functions[i - 1];
      const currentFunc = functions[i];

      // Check if functions are consecutive (within reasonable whitespace distance)
      const gap = currentFunc.startPos - prevFunc.endPos;

      if (gap < 200) {
        // Reasonable threshold for consecutive functions
        currentGroup.endPos = currentFunc.endPos;
        currentGroup.functions.push(currentFunc);
      } else {
        groups.push(currentGroup);
        currentGroup = {
          endPos: currentFunc.endPos,
          functions: [currentFunc],
          startPos: currentFunc.startPos
        };
      }
    }

    groups.push(currentGroup);
    return groups;
  }

  private replaceMethodsInClass(sourceFile: SourceFile, sortedMethods: any[]): void {
    if (sortedMethods.length === 0) return;

    // Get the range of all methods
    const startPos = Math.min(...sortedMethods.map(m => m.start));
    const endPos = Math.max(...sortedMethods.map(m => m.end));

    // Build replacement text
    const replacementText = sortedMethods.map(m => m.text).join("");

    // Replace the text range
    const currentText = sourceFile.getFullText();
    const newText = currentText.substring(0, startPos) + replacementText + currentText.substring(endPos);
    sourceFile.replaceWithText(newText);
  }

  private replaceMethodsInInterface(sourceFile: SourceFile, sortedMethods: any[]): void {
    if (sortedMethods.length === 0) return;

    // Get the range of all methods
    const startPos = Math.min(...sortedMethods.map(m => m.start));
    const endPos = Math.max(...sortedMethods.map(m => m.end));

    // Build replacement text
    const replacementText = sortedMethods.map(m => m.text).join("");

    // Replace the text range
    const currentText = sourceFile.getFullText();
    const newText = currentText.substring(0, startPos) + replacementText + currentText.substring(endPos);
    sourceFile.replaceWithText(newText);
  }

  private async sortClassMethods(sourceFile: SourceFile, editor: vscode.TextEditor | null): Promise<void> {
    if (!editor) return; // Skip if no editor (testing mode uses separate method)

    sourceFile.getClasses().forEach(async classDecl => {
      const methods: FunctionInfo[] = [];

      classDecl.getMethods().forEach(method => {
        const name = method.getName();
        const isPublic =
          !method.hasModifier(SyntaxKind.PrivateKeyword) && !method.hasModifier(SyntaxKind.ProtectedKeyword);

        methods.push({
          endPos: method.getEnd(),
          isPublic,
          name,
          node: method,
          startPos: method.getFullStart(),
          text: method.getFullText()
        });
      });

      if (methods.length > 1) {
        await this.applySortedFunctions(methods, editor);
      }
    });
  }

  private sortClassMethodsInSourceFile(sourceFile: SourceFile): void {
    sourceFile.getClasses().forEach(classDecl => {
      const methods = classDecl.getMethods();

      if (methods.length > 1) {
        const methodInfo = methods.map(method => ({
          end: method.getEnd(),
          isPublic: !method.hasModifier(SyntaxKind.PrivateKeyword) && !method.hasModifier(SyntaxKind.ProtectedKeyword),
          method,
          name: method.getName(),
          start: method.getFullStart(),
          text: method.getFullText()
        }));

        // Sort: public first, then alphabetically
        methodInfo.sort((a, b) => {
          if (a.isPublic !== b.isPublic) {
            return a.isPublic ? -1 : 1;
          }
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });

        // Use text replacement instead of AST manipulation
        this.replaceMethodsInClass(sourceFile, methodInfo);
      }
    });
  }

  private async sortInterfaceMethods(sourceFile: SourceFile, editor: vscode.TextEditor | null): Promise<void> {
    if (!editor) return; // Skip if no editor (testing mode uses separate method)

    sourceFile.getInterfaces().forEach(async interfaceDecl => {
      const methods: FunctionInfo[] = [];

      interfaceDecl.getMethods().forEach(method => {
        const name = method.getName();

        methods.push({
          endPos: method.getEnd(),
          isPublic: true,
          name,
          node: method,
          // Interface methods are always public
          startPos: method.getFullStart(),
          text: method.getFullText()
        });
      });

      if (methods.length > 1) {
        await this.applySortedFunctions(methods, editor);
      }
    });
  }

  private sortInterfaceMethodsInSourceFile(sourceFile: SourceFile): void {
    sourceFile.getInterfaces().forEach(interfaceDecl => {
      const methods = interfaceDecl.getMethods();

      if (methods.length > 1) {
        const methodInfo = methods.map(method => ({
          end: method.getEnd(),
          method,
          name: method.getName(),
          start: method.getFullStart(),
          text: method.getFullText()
        }));

        // Sort alphabetically (all interface methods are public)
        methodInfo.sort((a, b) => {
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });

        // Use text replacement instead of AST manipulation
        this.replaceMethodsInInterface(sourceFile, methodInfo);
      }
    });
  }

  private async sortTopLevelFunctions(sourceFile: SourceFile, editor: vscode.TextEditor | null): Promise<void> {
    const functions: FunctionInfo[] = [];

    // Get function declarations with their leading comments
    sourceFile.getFunctions().forEach(func => {
      const name = func.getName() || "anonymous";
      functions.push({
        // Include leading trivia (comments)
        endPos: func.getEnd(),

        isPublic: true,

        name,

        node: func,
        // Top-level functions are considered public
        startPos: func.getFullStart(),
        text: func.getFullText()
      });
    });

    // Get arrow functions and function expressions assigned to variables
    sourceFile.getVariableStatements().forEach(varStmt => {
      varStmt.getDeclarations().forEach(decl => {
        const init = decl.getInitializer();
        if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
          const name = decl.getName();
          functions.push({
            // Include leading trivia
            endPos: varStmt.getEnd(),

            isPublic: true,

            name,

            node: varStmt,
            startPos: varStmt.getFullStart(),
            text: varStmt.getFullText()
          });
        }
      });
    });

    if (functions.length > 1) {
      if (editor) {
        await this.applySortedFunctions(functions, editor);
      }
    }
  }

  private sortTopLevelFunctionsInSourceFile(sourceFile: SourceFile): void {
    const functions = sourceFile.getFunctions();
    const variableStatements = sourceFile.getVariableStatements().filter(varStmt => {
      return varStmt.getDeclarations().some(decl => {
        const init = decl.getInitializer();
        return init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init));
      });
    });

    const allFunctionNodes = [...functions, ...variableStatements];

    if (allFunctionNodes.length > 1) {
      // Sort by name
      allFunctionNodes.sort((a, b) => {
        const nameA = "getName" in a ? a.getName() || "anonymous" : a.getDeclarations()[0]?.getName() || "anonymous";
        const nameB = "getName" in b ? b.getName() || "anonymous" : b.getDeclarations()[0]?.getName() || "anonymous";
        return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
      });

      // Remove and re-add in sorted order
      allFunctionNodes.forEach(node => node.remove());
      allFunctionNodes.forEach(node => {
        sourceFile.addStatements(node.getFullText());
      });
    }
  }
}
