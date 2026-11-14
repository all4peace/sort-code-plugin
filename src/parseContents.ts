import type { CodePart } from "./CodePart.js";

/**
 * Custom line-by-line parser that captures everything exactly as written
 * Preserves formatting, comments, and handles complex multi-line statements
 */
export class LineByLineParser {
  /**
   * Parse content line by line and return structured CodePart array
   * @param content The file content to parse
   * @returns Array of CodePart objects with exact formatting preserved
   */
  parseContents(content: string): CodePart[] {
    const lines = content.split("\n");
    const codeParts: CodePart[] = [];
    let currentPart: CodePart | null = null;
    let lineIndex = 0;

    while (lineIndex < lines.length) {
      const line = lines[lineIndex];
      const trimmedLine = line.trim();

      // Handle empty lines
      if (trimmedLine === "") {
        if (currentPart && currentPart.type !== "empty") {
          // Finish current part and start new empty part
          this.finalizePart(currentPart, lineIndex - 1);
          codeParts.push(currentPart);
          currentPart = null;
        }

        if (!currentPart || currentPart.type !== "empty") {
          currentPart = this.createEmptyPart(lineIndex + 1);
        }

        currentPart.content += line + "\n";
        currentPart.lineEnd = lineIndex + 1;
        lineIndex++;
        continue;
      }

      // Handle single line comments
      if (trimmedLine.startsWith("//")) {
        if (currentPart && currentPart.type !== "comment") {
          this.finalizePart(currentPart, lineIndex - 1);
          codeParts.push(currentPart);
          currentPart = null;
        }

        if (!currentPart || currentPart.type !== "comment") {
          currentPart = this.createCommentPart(lineIndex + 1);
        }

        currentPart.content += line + "\n";
        currentPart.lineEnd = lineIndex + 1;
        lineIndex++;
        continue;
      }

      // Handle multi-line comments
      if (trimmedLine.startsWith("/*")) {
        if (currentPart && currentPart.type !== "comment") {
          this.finalizePart(currentPart, lineIndex - 1);
          codeParts.push(currentPart);
          currentPart = null;
        }

        currentPart = this.createCommentPart(lineIndex + 1);
        const result = this.parseMultiLineComment(lines, lineIndex);
        currentPart.content = result.content;
        currentPart.lineEnd = result.endLineIndex + 1;
        codeParts.push(currentPart);
        currentPart = null;
        lineIndex = result.endLineIndex + 1;
        continue;
      }

      // Handle code blocks (classes, functions, interfaces, etc.)
      if (this.isCodeBlockStart(trimmedLine)) {
        if (currentPart) {
          this.finalizePart(currentPart, lineIndex - 1);
          codeParts.push(currentPart);
        }

        const result = this.parseCodeBlock(lines, lineIndex);
        codeParts.push(result.codePart);
        currentPart = null;
        lineIndex = result.endLineIndex + 1;
        continue;
      }

      // Handle other statements (imports, variables, etc.)
      if (currentPart && !this.isContinuationLine(trimmedLine)) {
        this.finalizePart(currentPart, lineIndex - 1);
        codeParts.push(currentPart);
        currentPart = null;
      }

      if (!currentPart) {
        currentPart = this.createStatementPart(lineIndex + 1, trimmedLine);
      }

      currentPart.content += line + "\n";

      // Check if this statement is complete (using the multi-line aware method)
      if (this.isMultiLineStatementComplete(currentPart.content)) {
        currentPart.lineEnd = lineIndex + 1;
        codeParts.push(currentPart);
        currentPart = null;
      }

      lineIndex++;
    }

    // Finalize any remaining part
    if (currentPart) {
      this.finalizePart(currentPart, lineIndex);
      codeParts.push(currentPart);
    }

    return codeParts;
  }

  /**
   * Parse a multi-line comment block
   */
  private parseMultiLineComment(lines: string[], startIndex: number): { content: string; endLineIndex: number } {
    let content = "";
    let lineIndex = startIndex;
    let foundClosing = false;

    while (lineIndex < lines.length) {
      const line = lines[lineIndex];
      content += line + "\n";

      // Check if this line ends the comment
      if (line.includes("*/")) {
        // Make sure we get the complete closing
        const afterClosing = line.substring(line.indexOf("*/") + 2).trim();
        if (afterClosing === "") {
          foundClosing = true;
          break;
        }
      }

      lineIndex++;
    }

    // Throw error if we reached EOF without finding closing */
    if (!foundClosing) {
      throw new Error(
        `Unclosed multi-line comment starting at line ${startIndex + 1}. Expected closing '*/' but reached end of file.`
      );
    }

    return { content, endLineIndex: lineIndex };
  }

  /**
   * Parse a code block (class, function, interface, etc.) with proper brace matching
   */
  private parseCodeBlock(lines: string[], startIndex: number): { codePart: CodePart; endLineIndex: number } {
    const startLine = lines[startIndex];
    const trimmedStart = startLine.trim();

    const codePart = this.createCodeBlockPart(startIndex + 1, trimmedStart);
    let content = "";
    let lineIndex = startIndex;
    let sections: string[] = [];

    while (lineIndex < lines.length) {
      const line = lines[lineIndex];
      content += line + "\n";

      // Parse character by character to handle quotes and braces properly
      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        const char = line[charIndex];
        const nextChar = charIndex < line.length - 1 ? line[charIndex + 1] : "";
        const lastSection = sections[sections.length - 1] || "";

        if (lastSection === "/*") {
          if (char === "*" && nextChar === "/") {
            sections.pop();
            charIndex++; // Skip the /
          }
          continue;
        }

        // Handle regex literals
        if (lastSection === "/regex") {
          if (char === "/") {
            // Check if this is an unescaped closing /
            let escapeCount = 0;
            let checkIndex = charIndex - 1;
            while (checkIndex >= 0 && line[checkIndex] === "\\") {
              escapeCount++;
              checkIndex--;
            }
            // If even number of escapes (including 0), the / is not escaped
            if (escapeCount % 2 === 0) {
              // Look ahead for regex flags (dgimsuvy)
              let flagIndex = charIndex + 1;
              while (flagIndex < line.length && /[dgimsuvy]/.test(line[flagIndex])) {
                flagIndex++;
              }
              // Skip to end of flags
              charIndex = flagIndex - 1;
              sections.pop(); // End regex
            }
          }
          continue;
        }

        const inString = lastSection === "'" || lastSection === '"' || lastSection === "`";

        // Handle escaping in strings
        if (char === "\\" && inString) {
          charIndex++; // Skip next character (it's escaped)
          continue;
        }

        // If we're in a string, only look for the closing quote
        if (inString) {
          if (char === lastSection) {
            sections.pop(); // Close the string
          }
          continue;
        }

        // Handle opening strings/quotes
        if (char === "'" || char === '"' || char === "`") {
          sections.push(char);
          continue;
        }

        // Handle comments
        if (char === "/" && nextChar === "/") {
          // Single line comment - skip rest of line
          break; // Move to next line
        }

        if (char === "/" && nextChar === "*") {
          sections.push("/*");
          charIndex++; // Skip the *
          continue;
        }

        // Handle regex literals - must come after comment detection
        if (char === "/" && nextChar !== "*" && nextChar !== "/") {
          // Check if this could be a regex literal
          // Must not be preceded by alphanumeric character
          const prevNonWhitespaceChar = this.getPreviousNonWhitespaceChar(content, lineIndex, charIndex);
          const isAlphanumeric = prevNonWhitespaceChar && /[a-zA-Z0-9_]/.test(prevNonWhitespaceChar);

          // Regex is likely if not preceded by alphanumeric and preceded by operators or at start
          const regexPrecedingChars = [
            "=",
            "(",
            "[",
            "{",
            ":",
            ";",
            "!",
            "&",
            "|",
            "?",
            "+",
            "-",
            "*",
            "/",
            "%",
            "^",
            "~",
            "<",
            ">",
            ",",
            "\n"
          ];

          if (
            !isAlphanumeric &&
            (prevNonWhitespaceChar === null || regexPrecedingChars.includes(prevNonWhitespaceChar))
          ) {
            // Forward look to validate this is actually a regex
            const regexResult = this.validateAndParseRegex(line, charIndex);
            if (regexResult.isRegex) {
              // Skip to the end of the regex (including flags)
              charIndex = regexResult.endIndex;
              continue;
            }
          }
        }

        // Handle opening brackets
        if (char === "{" || char === "[" || char === "(") {
          sections.push(char);
          continue;
        }

        // Handle closing brackets
        if (char === "}" || char === "]" || char === ")") {
          const expectedOpening = this.getMatchingOpeningBracket(char);

          if (sections.length === 0 || sections[sections.length - 1] !== expectedOpening) {
            throw new Error(
              `Mismatched brackets at line ${lineIndex + 1}. Expected '${expectedOpening}' but found '${sections[sections.length - 1] || "nothing"}'.`
            );
          }

          sections.pop(); // Remove the matching opening bracket
          continue;
        }
      }

      lineIndex++;
    }

    // If we reach here, we didn't find a proper closing bracket
    if (sections.length !== 0) {
      throw new Error(`Unclosed '${sections[sections.length - 1]}' starting at line ${startIndex + 1}.`);
    }

    codePart.content = content;
    codePart.lineEnd = lineIndex + 1;

    // Parse children if this is a class
    if (codePart.type === "class") {
      codePart.children = this.parseClassMembers(content);
    }

    return { codePart, endLineIndex: lineIndex };
  }

  /**
   * Parse class members recursively
   */
  private parseClassMembers(classContent: string): CodePart[] {
    // Find the class body (content between the first { and last })
    const openBraceIndex = classContent.indexOf("{");
    const lastCloseBraceIndex = classContent.lastIndexOf("}");

    if (openBraceIndex === -1 || lastCloseBraceIndex === -1) {
      return [];
    }

    const bodyContent = classContent.substring(openBraceIndex + 1, lastCloseBraceIndex);

    // Parse the body content recursively
    return this.parseContents(bodyContent);
  }

  /**
   * Check if a line starts a code block
   */
  private isCodeBlockStart(line: string): boolean {
    const keywords = [
      "export class",
      "class",
      "export interface",
      "interface",
      "export enum",
      "enum",
      "export function",
      "function",
      "export default class",
      "export default interface",
      "export default function",
      "public class",
      "private class",
      "public interface",
      "private interface",
      "public function",
      "private function",
      "protected function",
      "public",
      "private",
      "protected",
      "static",
      "abstract class",
      "export abstract class",
      "constructor"
    ];

    return (
      (keywords.some(keyword => {
        const regex = new RegExp(
          `^(export\\s+)?(public\\s+|private\\s+|protected\\s+|static\\s+|abstract\\s+)*${keyword.replace(/^export\s+/, "")}\\s+`,
          "i"
        );
        return regex.test(line);
      }) ||
        line.includes("{")) &&
      !line.trim().endsWith(";")
    ); // Exclude field declarations that end with semicolon
  }

  /**
   * Check if current line is a continuation of previous statement
   */
  private isContinuationLine(line: string): boolean {
    // Simple heuristics for continuation
    const trimmed = line.trim();
    return (
      trimmed.startsWith(".") ||
      trimmed.startsWith("&&") ||
      trimmed.startsWith("||") ||
      trimmed.startsWith("+") ||
      trimmed.startsWith("-") ||
      trimmed.startsWith("?") ||
      trimmed.startsWith(":") ||
      // For multi-line strings and template literals
      trimmed.startsWith('"') ||
      trimmed.startsWith("'") ||
      trimmed.startsWith("`") ||
      // For indented content that's likely part of a multi-line assignment
      (line.startsWith("  ") && !trimmed.startsWith("//") && !trimmed.startsWith("/*"))
    );
  }

  /**
   * Check if a multi-line statement is complete by analyzing the entire content
   */
  private isMultiLineStatementComplete(content: string): boolean {
    const trimmed = content.trim();

    // Empty content is not complete
    if (!trimmed) {
      return false;
    }

    // If it doesn't end with semicolon, it's not complete
    if (!trimmed.endsWith(";")) {
      return false;
    }

    // Track bracket depth across the entire content
    let bracketDepth = 0;
    let parenDepth = 0;
    let braceDepth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplateString = false;
    let inSingleLineComment = false;
    let inMultiLineComment = false;
    let escaped = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = i < content.length - 1 ? content[i + 1] : "";

      // Handle escape sequences
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }

      // Handle comments
      if (!inSingleQuote && !inDoubleQuote && !inTemplateString) {
        if (char === "/" && nextChar === "/") {
          inSingleLineComment = true;
          continue;
        }
        if (char === "/" && nextChar === "*") {
          inMultiLineComment = true;
          continue;
        }
        if (inMultiLineComment && char === "*" && nextChar === "/") {
          inMultiLineComment = false;
          i++; // Skip the next character
          continue;
        }
        if (inSingleLineComment && char === "\n") {
          inSingleLineComment = false;
          continue;
        }
      }

      // Skip if we're in a comment
      if (inSingleLineComment || inMultiLineComment) {
        continue;
      }

      // Handle string literals
      if (char === "'" && !inDoubleQuote && !inTemplateString) {
        inSingleQuote = !inSingleQuote;
        continue;
      }
      if (char === '"' && !inSingleQuote && !inTemplateString) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }
      if (char === "`" && !inSingleQuote && !inDoubleQuote) {
        inTemplateString = !inTemplateString;
        continue;
      }

      // Skip if we're inside a string
      if (inSingleQuote || inDoubleQuote || inTemplateString) {
        continue;
      }

      // Track bracket depth
      if (char === "(") parenDepth++;
      if (char === ")") parenDepth--;
      if (char === "[") bracketDepth++;
      if (char === "]") bracketDepth--;
      if (char === "{") braceDepth++;
      if (char === "}") braceDepth--;
    }

    // Statement is complete if all brackets are balanced
    return bracketDepth === 0 && parenDepth === 0 && braceDepth === 0;
  }

  /**
   * Create an empty line part
   */
  private createEmptyPart(lineStart: number): CodePart {
    return {
      content: "",
      isArrowFunction: false,
      isExported: false,
      isPrivate: false,
      isProtected: false,
      isPublic: false,
      isStatic: false,
      leadingComments: [],
      lineEnd: lineStart,
      lineStart,
      name: "",
      originalOrder: 0,
      trailingComments: [],
      type: "empty"
    };
  }

  /**
   * Create a comment part
   */
  private createCommentPart(lineStart: number): CodePart {
    return {
      content: "",
      isArrowFunction: false,
      isExported: false,
      isPrivate: false,
      isProtected: false,
      isPublic: false,
      isStatic: false,
      leadingComments: [],
      lineEnd: lineStart,
      lineStart,
      name: "",
      originalOrder: 0,
      trailingComments: [],
      type: "comment"
    };
  }

  /**
   * Create a code block part (class, function, etc.)
   */
  private createCodeBlockPart(lineStart: number, line: string): CodePart {
    const type = this.determineCodeBlockType(line);
    const name = this.extractName(line, type);

    return {
      children: [],
      content: "",
      isArrowFunction: false,
      isExported: line.includes("export"),
      isPrivate: line.includes("private"),
      isProtected: line.includes("protected"),
      isPublic: line.includes("public"),
      isStatic: line.includes("static"),
      leadingComments: [],
      lineEnd: lineStart,
      lineStart,
      name,
      originalOrder: 0,
      trailingComments: [],
      type
    };
  }

  /**
   * Create a statement part (import, variable, etc.)
   */
  private createStatementPart(lineStart: number, line: string): CodePart {
    const type = this.determineStatementType(line);
    const name = this.extractName(line, type);

    return {
      content: "",
      isArrowFunction: line.includes("=>"),
      isExported: line.includes("export"),
      isPrivate: false,
      isProtected: false,
      isPublic: false,
      isStatic: false,
      leadingComments: [],
      lineEnd: lineStart,
      lineStart,
      name,
      originalOrder: 0,
      trailingComments: [],
      type
    };
  }

  /**
   * Determine the type of code block
   */
  private determineCodeBlockType(line: string): CodePart["type"] {
    if (line.includes("class")) return "class";
    if (line.includes("interface")) return "interface";
    if (line.includes("enum")) return "enum";
    if (line.includes("function")) return "function";
    if (line.includes("constructor")) return "constructor";
    return "function"; // Default
  }

  /**
   * Determine the type of statement
   */
  private determineStatementType(line: string): CodePart["type"] {
    if (line.startsWith("import")) return "import";
    if (line.includes("export default")) return "export-default";
    if (line.startsWith("export") && !line.includes("function") && !line.includes("class")) return "export";

    // Check for function expressions and arrow functions assigned to variables
    if (line.includes("const") || line.includes("let") || line.includes("var")) {
      // Check for arrow functions: const funcName = (...) => ...
      if (line.includes("=>")) return "function";
      // Check for function expressions: const funcName = function(...) ... or const funcName = async function(...)
      if (line.includes("= function") || line.includes("= async function")) return "function";
      return "variable";
    }

    // Check for regular function declarations (including async)
    if (/\bfunction\b/.test(line)) return "function";

    return "variable"; // Default
  }

  /**
   * Extract name from line based on type
   */
  private extractName(line: string, type: CodePart["type"]): string {
    try {
      if (type === "class" || type === "interface" || type === "enum") {
        const match = line.match(/(?:class|interface|enum)\s+(\w+)/);
        return match ? match[1] : "";
      }

      if (type === "function") {
        // First try standard function pattern (including async)
        let match = line.match(/(?:async\s+)?function\s+(\w+)/);
        if (match) return match[1];

        // Try function expression assigned to variable: const funcName = function(...) ... or const funcName = async function(...)
        match = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/);
        if (match) return match[1];

        // Try arrow function assigned to variable: const funcName = (...) => ...
        match = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*[^=]*=>/);
        if (match) return match[1];

        // Try class method patterns (with visibility modifiers) - AFTER variable patterns
        match = line.match(/(?:public|private|protected|static)?\s*(?:static)?\s*(\w+)\s*\(/);
        if (match) return match[1];

        // Try constructor
        if (line.includes("constructor")) return "constructor";
      }

      if (type === "variable") {
        const match = line.match(/(?:const|let|var)\s+(\w+)/);
        return match ? match[1] : "";
      }

      if (type === "constructor") {
        return "constructor";
      }

      if (type === "export-default") {
        // Extract the name after 'export default'
        const match = line.match(/export\s+default\s+(\w+)/);
        return match ? match[1] : "default";
      }

      if (type === "export") {
        // Extract name from export const/let/var statements
        const match = line.match(/export\s+(?:const|let|var)\s+(\w+)/);
        return match ? match[1] : "";
      }
    } catch {
      // Ignore regex errors
    }

    return "";
  }

  /**
   * Get the matching opening bracket for a closing bracket
   */
  private getMatchingOpeningBracket(closingBracket: string): string {
    const bracketMap: { [key: string]: string } = {
      ")": "(",
      "]": "[",
      "}": "{"
    };
    return bracketMap[closingBracket] || "";
  }

  /**
   * Get the previous non-whitespace character from the content
   */
  private getPreviousNonWhitespaceChar(
    content: string,
    currentLineIndex: number,
    currentCharIndex: number
  ): string | null {
    // Start from the character before current position
    let lineIndex = currentLineIndex;
    let charIndex = currentCharIndex - 1;

    const lines = content.split("\n");

    while (lineIndex >= 0) {
      const line = lines[lineIndex] || "";

      while (charIndex >= 0) {
        const char = line[charIndex];
        if (char && char.trim() !== "") {
          return char;
        }
        charIndex--;
      }

      // Move to previous line
      lineIndex--;
      if (lineIndex >= 0) {
        charIndex = (lines[lineIndex] || "").length - 1;
      }
    }

    return null; // No non-whitespace character found
  }

  /**
   * Validate and parse a potential regex literal by looking ahead
   */
  private validateAndParseRegex(line: string, startIndex: number): { endIndex: number; isRegex: boolean } {
    let index = startIndex + 1; // Skip the opening /
    let foundClosing = false;

    while (index < line.length) {
      const char = line[index];

      // Handle escape sequences
      if (char === "\\") {
        index += 2; // Skip the escaped character
        continue;
      }

      // Found potential closing /
      if (char === "/") {
        foundClosing = true;
        index++; // Move past the /
        break;
      }

      // If we hit a newline, this isn't a valid regex
      if (char === "\n") {
        return { endIndex: startIndex, isRegex: false };
      }

      index++;
    }

    if (!foundClosing) {
      return { endIndex: startIndex, isRegex: false };
    }

    // Look for regex flags (dgimsuvy)
    while (index < line.length && /[dgimsuvy]/.test(line[index])) {
      index++;
    }

    // Check what comes after the regex - should be non-alphanumeric or end of line
    if (index < line.length) {
      const nextChar = line[index];
      if (/[a-zA-Z0-9_]/.test(nextChar)) {
        return { endIndex: startIndex, isRegex: false };
      }
    }

    return { endIndex: index - 1, isRegex: true };
  }

  /**
   * Finalize a code part
   */
  private finalizePart(part: CodePart, lineEnd: number): void {
    part.lineEnd = lineEnd;
    // Remove trailing newline if present
    if (part.content.endsWith("\n")) {
      part.content = part.content.slice(0, -1);
    }
  }
}
