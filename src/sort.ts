import type { CodePart } from "./CodePart.js";
import { LineByLineParser } from "./parseContents.js";

/**
 * Sorts code using the structured CodePart array from LineByLineParser
 * Implements grouping, comment association, and proper spacing
 */
export class CodeSorter {
  private parser: LineByLineParser;

  constructor() {
    this.parser = new LineByLineParser();
  }

  /**
   * Main sorting function
   * @param content The file content to sort
   * @returns Sorted content with proper grouping and spacing
   */
  sortContent(content: string): string {
    const codeParts = this.parser.parseContents(content);

    // Prepare content with proper group numbers and handle empties
    const preparedParts = this.prepareParsedContent(codeParts);

    // Sort the prepared parts
    const sortedParts = this.sortCodeParts(preparedParts);

    // Generate output with proper spacing
    return this.generateSortedContent(sortedParts, true);
  }

  /**
   * Prepare parsed content by establishing group numbers cleanly and handling empties
   */
  prepareParsedContent(codeParts: CodePart[]): CodePart[] {
    let newCodeParts: CodePart[] = [];
    let groupNumber = 0;
    let previousType: CodePart["type"] | undefined;
    let nextType: CodePart["type"] | undefined = undefined;

    for (let i = 0; i < codeParts.length; i++) {
      const part = codeParts[i];

      previousType = nextType;

      if (part.type === "empty" && newCodeParts.length === 0) {
        // Skip leading empty lines
        continue;
      }

      if (part.type !== "empty") {
        nextType = part.type;
      }

      const isLastPart = i === codeParts.length - 1;
      const nextPart = isLastPart ? undefined : codeParts[i + 1];

      if (part.type === "comment") {
        // If next one is also a comment. This shouldn't happen, so we will merge them
        if (nextPart?.type === "comment") {
          nextPart.lineStart = part.lineStart;
          const connector = part.content.endsWith("\n") ? "" : "\n";
          nextPart.content = `${part.content}${connector}${nextPart.content}`;
          nextType = previousType;
        } else if (isLastPart || nextPart?.type == "empty") {
          // If it's a standalone comment
          newCodeParts.push({ ...part, groupNumber: ++groupNumber });
        } else if (nextPart) {
          // We will merge comments with the next statement
          nextPart.lineStart = part.lineStart;
          const connector = part.content.endsWith("\n") ? "" : "\n";
          nextPart.content = `${part.content}${connector}${nextPart.content}`;
          nextType = previousType;
        }
      } else if (part.type === "empty") {
        // For anything other than functions, enums, interfaces, we will respect empty lines as separators
        if (previousType !== "function" && previousType !== "enum" && previousType !== "interface") {
          ++groupNumber;
        }
      } else if (part.type === "class") {
        ++groupNumber;
        if (part.children && part.children.length > 0) {
          // Recursively prepare and sort the class children
          const preparedChildren = this.prepareParsedContent(part.children);
          const sortedChildren = this.sortCodeParts(preparedChildren);
          newCodeParts.push({ ...part, children: sortedChildren, groupNumber });
        } else {
          newCodeParts.push({ ...part, groupNumber });
        }
      } else if (part.type === "export-default") {
        // Export default always gets the highest group number to be sorted last
        newCodeParts.push({ ...part, groupNumber: 99999 });
      } else {
        if (previousType !== part.type) {
          ++groupNumber;
        }
        newCodeParts.push({ ...part, groupNumber });
      }
    }

    return newCodeParts;
  }

  /**
   * Sort code parts by group number and within each group by priority and name
   */
  private sortCodeParts(codeParts: CodePart[]): CodePart[] {
    // Group parts by groupNumber
    const groups = new Map<number, CodePart[]>();

    for (const part of codeParts) {
      const groupNum = part.groupNumber || 0;
      if (!groups.has(groupNum)) {
        groups.set(groupNum, []);
      }
      groups.get(groupNum)!.push(part);
    }

    // Sort each group and recursively sort children
    const sortedGroups: CodePart[] = [];

    for (const [, groupParts] of Array.from(groups.entries()).sort(([a], [b]) => a - b)) {
      const sortedGroupParts = this.sortPartsWithinGroup(groupParts);
      sortedGroups.push(...sortedGroupParts);
    }

    return sortedGroups;
  }

  /**
   * Sort parts within a group according to the priority order
   */
  private sortPartsWithinGroup(parts: CodePart[]): CodePart[] {
    return parts
      .map(part => {
        // Recursively sort children if they exist
        if (part.children && part.children.length > 0) {
          return {
            ...part,
            children: this.sortCodeParts(part.children)
          };
        }
        return part;
      })
      .sort((a, b) => {
        // FIRST: Sort by group number (most important)
        const groupA = a.groupNumber || 0;
        const groupB = b.groupNumber || 0;
        if (groupA !== groupB) {
          return groupA - groupB;
        }

        // SECOND: For constructor, always put it first within its group
        if (a.type === "constructor" && b.type !== "constructor") return -1;
        if (b.type === "constructor" && a.type !== "constructor") return 1;

        // THIRD: Sort by priority within the same group
        const priorityA = this.getPriority(a);
        const priorityB = this.getPriority(b);
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // FOURTH: Within same priority, sort alphabetically by name
        const aName = a.name || "";
        const bName = b.name || "";
        return aName.localeCompare(bName);
      });
  }

  /**
   * Get priority for sorting parts
   */
  private getPriority(part: CodePart): number {
    // Handle class members priority
    if (part.type === "constructor") {
      return 1; // Constructor first
    }

    if (part.type === "function") {
      // For functions/methods, use detailed priority based on visibility and static
      if (part.isPublic && part.isStatic) return 2; // public static
      if (part.isExported && part.isStatic) return 2; // export static (same as public static)
      if (part.isPublic && !part.isStatic) return 3; // public non-static
      if (part.isExported && !part.isStatic) return 3; // export non-static (same as public)
      if (!part.isPublic && !part.isPrivate && part.isStatic) return 4; // not specified static
      if (!part.isPublic && !part.isPrivate && !part.isStatic) return 5; // not specified non-static
      if (part.isPrivate && part.isStatic) return 6; // private static
      if (part.isPrivate && !part.isStatic) return 7; // private non-static

      return 8; // fallback for functions
    }

    // For non-class members, use simple priority
    switch (part.type) {
      case "import":
        return 1;
      case "variable":
        return 2;
      case "interface":
        return 3;
      case "enum":
        return 4;
      case "class":
        return 5;
      case "export":
        return 7;
      case "export-default":
        return 99; // Always last
      default:
        return 8;
    }
  }

  /**
   * Generate sorted content from code parts
   */
  private generateSortedContent(codeParts: CodePart[], isRoot: boolean = false): string {
    const result: string[] = [];
    let lastGroupNumber: number | undefined = undefined;

    for (let i = 0; i < codeParts.length; i++) {
      const part = codeParts[i];

      if (part.type !== "empty") {
        // Add empty line between groups OR between functions/constructors
        if (
          lastGroupNumber !== undefined &&
          (part.groupNumber !== lastGroupNumber || part.type === "function" || part.type === "constructor")
        ) {
          // Check if the last item in result is already an empty line
          if (result.length > 0 && result[result.length - 1].trim() !== "") {
            result.push(""); // Add empty line
          }
        }

        // Handle classes with children - reconstruct the class structure
        if (part.type === "class" && part.children && part.children.length > 0) {
          const classContent = this.reconstructClassContent(part);
          result.push(classContent);
        } else {
          // Remove trailing newlines from content to control spacing
          const cleanContent = part.content.replace(/\n+$/, "");
          result.push(cleanContent);
        }
      }

      lastGroupNumber = part.groupNumber;
    }

    const content = result.join("\n");

    // Only ensure file ends with newline if this is the root call (actual file)
    if (isRoot) {
      return content.endsWith("\n") ? content : content + "\n";
    } else {
      return content;
    }
  }

  /**
   * Reconstruct class content with sorted children
   */
  private reconstructClassContent(classPart: CodePart): string {
    if (!classPart.children || classPart.children.length === 0) {
      return classPart.content;
    }

    // Extract class header (everything before the first {)
    const openBraceIndex = classPart.content.indexOf("{");
    if (openBraceIndex === -1) {
      return classPart.content;
    }

    const classHeader = classPart.content.substring(0, openBraceIndex + 1);

    // Generate sorted children content as-is (not root, so no trailing newline)
    const sortedChildrenContent = this.generateSortedContent(classPart.children, false);

    // Reconstruct the class - content should be as-is
    return `${classHeader}\n${sortedChildrenContent}\n}`;
  }
}
