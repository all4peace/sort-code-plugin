import type { Access } from "./types";

export type FieldOrder = "sortWhenSafe" | "preserve" | "sort";

export interface SortOptions {
  /** "kind": fields, ctors, properties, methods… then access inside each kind (CodeMaid default). "access": all public first, then kind. */
  primarySort: "kind" | "access";
  accessOrder: Access[];
  /** const / static members before instance members of the same kind and access. */
  staticFirst: boolean;
  /** Field ordering policy. sortWhenSafe keeps field order when initializers depend on each other or layout matters. */
  fieldOrder: FieldOrder;
  /** Comments separated from the next member by a blank line: move with it ("attach") or stay put as a boundary ("boundary"). */
  detachedComments: "attach" | "boundary";
  csharp: {
    memberOrder: string[];
    /** Also sort type declarations (classes, enums, …) inside a namespace / file. */
    sortTypes: boolean;
  };
  typescript: {
    memberOrder: string[];
    topLevelOrder: string[];
    sortTopLevel: boolean;
    sortClassMembers: boolean;
    /** `handle = () => {}` class properties sort with methods. */
    arrowFunctionPropertiesAsMethods: boolean;
    /** Treat `_name` members as private in JS/TS. */
    underscoreIsPrivate: boolean;
  };
  /** Test hook: shuffle every segment instead of sorting it (seeded). */
  shuffleSeed?: number;
}

/** CodeMaid's default member type order. */
export const CSHARP_DEFAULT_ORDER = [
  "field",
  "constructor",
  "destructor",
  "delegate",
  "event",
  "enum",
  "interface",
  "property",
  "indexer",
  "method",
  "struct",
  "class"
];

export const TS_DEFAULT_MEMBER_ORDER = ["indexSignature", "field", "constructor", "accessor", "method"];
export const TS_DEFAULT_TOP_LEVEL_ORDER = ["type", "enum", "variable", "function", "class"];

export const DEFAULT_OPTIONS: SortOptions = {
  accessOrder: ["public", "internal", "protectedInternal", "protected", "privateProtected", "private"],
  csharp: { memberOrder: CSHARP_DEFAULT_ORDER, sortTypes: true },
  detachedComments: "attach",
  fieldOrder: "sortWhenSafe",
  primarySort: "kind",
  staticFirst: true,
  typescript: {
    arrowFunctionPropertiesAsMethods: true,
    memberOrder: TS_DEFAULT_MEMBER_ORDER,
    sortClassMembers: true,
    sortTopLevel: true,
    topLevelOrder: TS_DEFAULT_TOP_LEVEL_ORDER,
    underscoreIsPrivate: false
  }
};

export type PartialOptions = Partial<Omit<SortOptions, "csharp" | "typescript">> & {
  csharp?: Partial<SortOptions["csharp"]>;
  typescript?: Partial<SortOptions["typescript"]>;
};

export function resolveOptions(partial: PartialOptions = {}): SortOptions {
  return {
    ...DEFAULT_OPTIONS,
    ...stripUndefined(partial),
    csharp: { ...DEFAULT_OPTIONS.csharp, ...stripUndefined(partial.csharp ?? {}) },
    typescript: { ...DEFAULT_OPTIONS.typescript, ...stripUndefined(partial.typescript ?? {}) }
  } as SortOptions;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
