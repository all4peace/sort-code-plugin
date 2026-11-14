import type { FilterConfig } from "./fileFilter";
import type { PartialOptions } from "./options";

/**
 * Maps `sortCode.*` settings (VS Code configuration or a parsed
 * .vscode/settings.json) to engine options. Shared by the extension and the CLI
 * so both always sort identically.
 */
export interface SortCodeSettings {
  filter: FilterConfig;
  maxFileSizeKB: number;
  options: PartialOptions;
  showHazards: boolean;
}

/** `get("primarySort")` must return the value of `sortCode.primarySort`, or undefined. */
export function settingsFrom(get: (key: string) => unknown): SortCodeSettings {
  const v = <T>(key: string, dflt: T): T => (get(key) as T | undefined) ?? dflt;
  const o = <T>(key: string): T | undefined => get(key) as T | undefined;
  return {
    filter: {
      exclude: v<string[]>("exclude", []),
      fileTypes: v<string[]>("fileTypes", [".cs", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]),
      include: v<string[]>("include", ["**/*"]),
      useBuiltInExcludes: v<boolean>("useBuiltInExcludes", true)
    },
    maxFileSizeKB: v<number>("maxFileSizeKB", 512),
    options: {
      accessOrder: o("accessOrder"),
      csharp: {
        memberOrder: o("csharp.memberOrder"),
        sortTypes: o("csharp.sortTypes")
      },
      detachedComments: o("detachedComments"),
      fieldOrder: o("fieldOrder"),
      primarySort: o("primarySort"),
      staticFirst: o("staticFirst"),
      typescript: {
        arrowFunctionPropertiesAsMethods: o("typescript.arrowFunctionPropertiesAsMethods"),
        memberOrder: o("typescript.memberOrder"),
        sortClassMembers: o("typescript.sortClassMembers"),
        sortTopLevel: o("typescript.sortTopLevel"),
        topLevelOrder: o("typescript.topLevelOrder"),
        underscoreIsPrivate: o("typescript.underscoreIsPrivate")
      }
    },
    showHazards: v<boolean>("showHazards", true)
  };
}

/** Reads `sortCode.*` keys from a flat settings.json object (`{"sortCode.fieldOrder": "preserve"}`) or a nested one. */
export function settingsFromJson(json: Record<string, unknown>): SortCodeSettings {
  const nested = (json.sortCode ?? {}) as Record<string, unknown>;
  return settingsFrom(key => {
    if (`sortCode.${key}` in json) return json[`sortCode.${key}`];
    const parts = key.split(".");
    let cur: unknown = nested;
    for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p];
    return cur ?? nested[key];
  });
}
