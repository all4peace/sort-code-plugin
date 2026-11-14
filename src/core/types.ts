/**
 * Shared model used by every language front-end.
 *
 * A front-end (C# or TS/JS) turns a file into a tree of Containers.
 * A Container is a region whose direct children (Elements) may be re-ordered:
 * a file, a namespace body, a class body. Each Element is one declaration
 * (method, field, function, …) or a Barrier that must never move.
 *
 * The layout engine (layout.ts) is language-agnostic: it attaches comments,
 * splits containers into segments at barriers, sorts each segment and
 * re-renders the text. Front-ends never produce text themselves.
 */

export type Access = "public" | "internal" | "protectedInternal" | "protected" | "privateProtected" | "private";

export const ALL_ACCESS: Access[] = ["public", "internal", "protectedInternal", "protected", "privateProtected", "private"];

export interface Range {
  start: number;
  end: number;
}

export interface Element extends Range {
  /** Barriers keep their position; sortable elements move only within the segment between barriers. */
  barrier: boolean;
  /** Language specific kind, e.g. "method", "field", "function", "type". */
  kind: string;
  name: string;
  access: Access;
  /** Lower sorts first when `staticFirst` is on (const < static readonly < static < readonly < instance). */
  staticRank: number;
  /** Nested containers (e.g. the body of a nested class) rendered recursively. */
  children: Container[];
}

export interface PreserveReason {
  code: HazardCode;
  message: string;
  offset: number;
}

export interface Container extends Range {
  /** Human readable, used in messages: "class Foo". */
  description: string;
  elements: Element[];
  /** When false, the container keeps its order but children are still processed. */
  sortable: boolean;
  isTopLevel: boolean;
  kindOrder: string[];
  /** Kinds whose relative order must not change in this container, and why. */
  preserveKinds: Map<string, PreserveReason>;
}

export type HazardCode =
  | "syntax-error"
  | "preprocessor-conditional"
  | "field-initializer-dependency"
  | "struct-layout"
  | "com-interop"
  | "schema-order"
  | "load-time-dependency"
  | "generated-file"
  | "disabled-by-comment"
  | "too-large";

export interface Hazard {
  code: HazardCode;
  message: string;
  offset: number;
  severity: "info" | "warning";
  /** 0-based line, filled in by sortText. */
  line?: number;
}

export interface FileModel {
  root: Container;
  hazards: Hazard[];
}
