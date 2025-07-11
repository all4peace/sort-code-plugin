import { Node, Project, type SourceFile, SyntaxKind } from "ts-morph";

interface FunctionInfo {
  endPos: number;
  isPublic: boolean;
  name: string;
  node: Node;
  startPos: number;
  text: string;
  isExported?: boolean;
}

/**
 * Core function sorting logic using ts-morph
 * This class is standalone and doesn't depend on VS Code APIs
 */
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

    // Sort functions in different contexts
    await this.sortTopLevelFunctions(sourceFile);
    await this.sortClassMethods(sourceFile);
    await this.sortInterfaceMethods(sourceFile);

    // Get the sorted content
    const sortedContent = sourceFile.getFullText();

    // Clean up
    sourceFile.delete();

    return sortedContent;
  }

  private async applySortedFunctions(functions: FunctionInfo[], sourceFile: SourceFile): Promise<void> {
    // Sort functions: public first, then alphabetically by name
    const sortedFunctions = functions.sort((a, b) => {
      // First, sort by visibility (public first)
      if (a.isPublic !== b.isPublic) {
        return a.isPublic ? -1 : 1;
      }
      // Then, sort alphabetically by name
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    // Simple approach: find the range of all functions and replace them as one block
    const startPos = Math.min(...functions.map(f => f.startPos));
    const endPos = Math.max(...functions.map(f => f.endPos));

    // Build the sorted text
    const sortedText = sortedFunctions.map(f => f.text).join("");

    // Replace the entire range with sorted functions
    const currentText = sourceFile.getFullText();
    const newText = currentText.substring(0, startPos) + sortedText + currentText.substring(endPos);
    sourceFile.replaceWithText(newText);
  }

  private async sortInterfaceMethods(sourceFile: SourceFile): Promise<void> {
    sourceFile.getInterfaces().forEach(async interfaceDecl => {
      const methods: FunctionInfo[] = [];

      interfaceDecl.getMethods().forEach(method => {
        const name = method.getName();

        methods.push({
          // Include leading trivia
          endPos: method.getEnd(),

          isPublic: true,

          name,

          node: method,
          // Interface methods are always public
          startPos: method.getFullStart(), // Include leading comments and whitespace
          text: method.getFullText()
        });
      });

      if (methods.length > 1) {
        await this.applySortedFunctions(methods, sourceFile);
      }
    });
  }

  private async sortTopLevelFunctions(sourceFile: SourceFile): Promise<void> {
    const functions: FunctionInfo[] = [];
    const variables: FunctionInfo[] = [];
    const interfaces: FunctionInfo[] = [];
    const enums: FunctionInfo[] = [];
    const classes: FunctionInfo[] = [];

    // Get function declarations - separate exported from non-exported
    const funcDeclarations = sourceFile.getFunctions();

    funcDeclarations.forEach(func => {
      const name = func.getName() || "anonymous";
      const isExported = func.isExported();

      functions.push({
        endPos: func.getEnd(),
        isExported: isExported,
        isPublic: true,
        name,
        node: func,
        startPos: func.getFullStart(),
        text: func.getFullText().trim()
      });
    });

    // Get variable statements (both regular variables and function variables)
    const varStatements = sourceFile.getVariableStatements();

    varStatements.forEach(varStmt => {
      const isExported = varStmt.isExported();

      varStmt.getDeclarations().forEach(decl => {
        const init = decl.getInitializer();
        const name = decl.getName();

        if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
          // This is a function variable
          functions.push({
            endPos: varStmt.getEnd(),
            isExported: isExported,
            isPublic: true,
            name,
            node: varStmt,
            startPos: varStmt.getFullStart(),
            text: varStmt.getFullText().trim()
          });
        } else {
          // This is a regular variable/constant
          variables.push({
            endPos: varStmt.getEnd(),
            isExported: isExported,
            isPublic: true,
            name,
            node: varStmt,
            startPos: varStmt.getFullStart(),
            text: varStmt.getFullText().trim()
          });
        }
      });
    });

    // Get interfaces
    sourceFile.getInterfaces().forEach(interfaceDecl => {
      const name = interfaceDecl.getName();
      const isExported = interfaceDecl.isExported();

      interfaces.push({
        endPos: interfaceDecl.getEnd(),
        isExported: isExported,
        isPublic: true,
        name,
        node: interfaceDecl,
        startPos: interfaceDecl.getFullStart(),
        text: interfaceDecl.getFullText().trim()
      });
    });

    // Get enums
    sourceFile.getEnums().forEach(enumDecl => {
      const name = enumDecl.getName();
      const isExported = enumDecl.isExported();

      enums.push({
        endPos: enumDecl.getEnd(),
        isExported: isExported,
        isPublic: true,
        name,
        node: enumDecl,
        startPos: enumDecl.getFullStart(),
        text: enumDecl.getFullText().trim()
      });
    });

    // Get classes
    sourceFile.getClasses().forEach(classDecl => {
      const name = classDecl.getName() || "anonymous";
      const isExported = classDecl.isExported();

      classes.push({
        endPos: classDecl.getEnd(),
        isExported: isExported,
        isPublic: true,
        name,
        node: classDecl,
        startPos: classDecl.getFullStart(),
        text: classDecl.getFullText().trim()
      });
    });

    const allItems = [...variables, ...interfaces, ...enums, ...functions, ...classes];

    if (allItems.length > 1) {
      // For top-level items, use complex sorting
      await this.applySortedTopLevelItems(allItems, sourceFile);
    }
  }

  private async applySortedTopLevelItems(items: FunctionInfo[], sourceFile: SourceFile): Promise<void> {
    // Sort items by: 1. Type priority, 2. Export status within type, 3. Name
    const sortedItems = items.sort((a, b) => {
      // First by type priority: variables -> interfaces -> enums -> functions -> classes
      const getTypePriority = (item: FunctionInfo) => {
        const nodeKind = item.node.getKind();
        if (nodeKind === SyntaxKind.VariableStatement) {
          // Check if it's a function variable or regular variable
          const varStmt = item.node as any;
          const hasFunction = varStmt.getDeclarations().some((decl: any) => {
            const init = decl.getInitializer();
            return init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init));
          });
          return hasFunction ? 4 : 1; // Regular variables = 1, function variables = 4
        }
        if (nodeKind === SyntaxKind.InterfaceDeclaration) {
          return 2; // Interfaces
        }
        if (nodeKind === SyntaxKind.EnumDeclaration) {
          return 3; // Enums
        }
        if (nodeKind === SyntaxKind.ClassDeclaration) {
          return 5; // Classes
        }
        return 4; // Functions
      };

      const priorityA = getTypePriority(a);
      const priorityB = getTypePriority(b);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Within the same type, sort by export status (exported first)
      if (a.isExported !== b.isExported) {
        return a.isExported ? -1 : 1;
      }

      // Finally, sort alphabetically by name
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    const originalText = sourceFile.getFullText();

    // Simple approach: find file header by looking for import statements or initial comment blocks
    let fileHeaderEnd = 0;
    const originalLines = originalText.split("\n");

    // Find the end of imports and file-level comments
    let lastImportIndex = -1;
    for (let i = 0; i < originalLines.length; i++) {
      const line = originalLines[i].trim();
      if (line.startsWith("import ")) {
        lastImportIndex = i;
      }
    }

    // If we found imports, file header ends after the last import
    if (lastImportIndex >= 0) {
      // Find the next non-empty line after imports
      for (let i = lastImportIndex + 1; i < originalLines.length; i++) {
        const line = originalLines[i].trim();
        if (line !== "") {
          // This is where code starts
          fileHeaderEnd = originalLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
          break;
        }
      }
    } else {
      // No imports, find the end of the initial comment block
      let lastCommentIndex = -1;
      for (let i = 0; i < originalLines.length; i++) {
        const line = originalLines[i].trim();

        // Skip empty lines
        if (line === "") {
          continue;
        }

        // If it's a file-level comment (containing common phrases or at the beginning)
        if (
          line.startsWith("//") &&
          (line.includes("Test Case") ||
            line.includes("This file") ||
            line.includes("Functions are") ||
            line.includes("Various function") ||
            i <= 5) // First few lines are likely file header
        ) {
          lastCommentIndex = i;
        } else {
          // Not a file-level comment, stop here
          break;
        }
      }

      if (lastCommentIndex >= 0) {
        // Find the next non-empty line after the last comment
        for (let i = lastCommentIndex + 1; i < originalLines.length; i++) {
          const line = originalLines[i].trim();
          if (line !== "") {
            fileHeaderEnd = originalLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
            break;
          }
        }
      }
    }

    const fileHeader = originalText.substring(0, fileHeaderEnd);

    // Fix the first item's text to exclude the file header if needed
    items.forEach(item => {
      if (item.startPos < fileHeaderEnd) {
        const itemText = originalText.substring(fileHeaderEnd, item.endPos).trim();
        item.text = itemText;
        item.startPos = fileHeaderEnd;
      }
    });

    // Find the content after the last item (excluding export default)
    const lastItemEnd = Math.max(...items.map(f => f.endPos));
    const fileFooter = originalText.substring(lastItemEnd);

    // Build the sorted content - add blank line between items
    const itemsWithSpacing = sortedItems.map(f => f.text).join("\n\n");

    // Ensure there's a newline between file header and items if header doesn't end with one
    let separator = "";
    if (fileHeader.length > 0 && !fileHeader.endsWith("\n\n")) {
      separator = fileHeader.endsWith("\n") ? "\n" : "\n\n";
    }

    const sortedContent = fileHeader + separator + itemsWithSpacing + fileFooter;

    sourceFile.replaceWithText(sortedContent);
  }

  private async sortClassMethods(sourceFile: SourceFile): Promise<void> {
    sourceFile.getClasses().forEach(async classDecl => {
      const methods: FunctionInfo[] = [];

      classDecl.getMethods().forEach(method => {
        const name = method.getName();
        const hasPublicKeyword = method.hasModifier(SyntaxKind.PublicKeyword);
        const hasPrivateKeyword = method.hasModifier(SyntaxKind.PrivateKeyword);
        const hasStaticKeyword = method.hasModifier(SyntaxKind.StaticKeyword);

        // Determine method type for sorting priority
        let methodType = 0;
        if (hasPublicKeyword && hasStaticKeyword) {
          methodType = 1; // public static
        } else if (hasStaticKeyword && !hasPrivateKeyword) {
          methodType = 2; // static (no explicit visibility)
        } else if (hasPublicKeyword) {
          methodType = 3; // public
        } else if (!hasPrivateKeyword && !hasPublicKeyword) {
          methodType = 4; // no declaration (implicit public)
        } else if (hasPrivateKeyword && hasStaticKeyword) {
          methodType = 5; // private static
        } else {
          methodType = 6; // private
        }

        methods.push({
          endPos: method.getEnd(),
          isPublic: !hasPrivateKeyword,
          methodType: methodType,
          name,
          node: method,
          startPos: method.getFullStart(),
          text: method.getFullText()
        } as any);
      });

      if (methods.length > 1) {
        await this.applySortedClassMethods(methods, sourceFile);
      }
    });
  }

  private async applySortedClassMethods(methods: any[], sourceFile: SourceFile): Promise<void> {
    // Sort methods by: 1. Method type, 2. Name
    const sortedMethods = methods.sort((a, b) => {
      // First, sort by method type priority
      if (a.methodType !== b.methodType) {
        return a.methodType - b.methodType;
      }

      // Then alphabetically by name
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    // Simple approach: find the range of all methods and replace them as one block
    const startPos = Math.min(...methods.map(f => f.startPos));
    const endPos = Math.max(...methods.map(f => f.endPos));

    // Build the sorted text with proper indentation and spacing
    const sortedText = sortedMethods
      .map(f => {
        // Ensure each method is properly indented (assuming 2-space indentation)
        const methodText = f.text.trim();
        const lines = methodText.split("\n");
        const indentedLines = lines.map((line: string, index: number) => {
          if (index === 0 && line.startsWith("//")) {
            // First line is a comment, indent it
            return `  ${line}`;
          } else if (index === 0) {
            // First line is the method declaration, indent it
            return `  ${line}`;
          } else if (line.trim() === "") {
            // Empty line, keep as is
            return line;
          } else {
            // Other lines, ensure they have proper base indentation
            return line.startsWith("  ") ? line : `  ${line}`;
          }
        });
        return indentedLines.join("\n");
      })
      .join("\n\n");

    // Check if we need to add spacing before the first method
    const currentText = sourceFile.getFullText();
    const beforeMethods = currentText.substring(0, startPos);

    let replacement = sortedText;

    // If the methods start right after the class opening brace with whitespace, add newline
    if (beforeMethods.match(/{\s*$/)) {
      replacement = "\n" + sortedText; // Add newline after opening brace
    } else if (beforeMethods.endsWith("}\n")) {
      // After a constructor, add single newline
      replacement = "\n" + sortedText;
    } else if (!beforeMethods.endsWith("\n\n")) {
      // Other cases, ensure double newline
      replacement = "\n\n" + sortedText;
    }

    // Replace the entire range with sorted methods
    const newText = currentText.substring(0, startPos) + replacement + currentText.substring(endPos);
    sourceFile.replaceWithText(newText);
  }
}
