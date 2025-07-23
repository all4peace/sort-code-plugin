export interface CodePart {
  children?: CodePart[]; // For parts inside parts, like functions inside classes
  content: string;
  groupNumber?: number;
  isArrowFunction: boolean; // For const someFunc = () => ...
  isExported: boolean;
  isPrivate: boolean;
  isProtected: boolean;
  isPublic: boolean;
  isStatic: boolean;
  leadingComments?: string[];
  lineEnd: number;
  lineStart: number; // Original line number in the file
  name: string; // Name of the function, variable, class, etc.
  originalOrder: number; // To preserve original order when needed
  trailingComments?: string[];
  type:
    | "comment"
    | "import"
    | "variable"
    | "function"
    | "class"
    | "interface"
    | "enum"
    | "export"
    | "export-default"
    | "empty"
    | "constructor";
}
