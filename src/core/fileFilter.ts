import picomatch from "picomatch";

import { SUPPORTED_EXTENSIONS } from "./sortText";

export const BUILT_IN_EXCLUDES = [
  "**/node_modules/**",
  "**/local_modules/**",
  "**/dist/**",
  "**/bin/**",
  "**/obj/**",
  "**/out/**",
  "**/build/**",
  "**/coverage/**",
  "**/.git/**",
  "**/.vs/**",
  "**/.next/**",
  "**/.vscode-test/**",
  "**/*.Designer.cs",
  "**/*.g.cs",
  "**/*.g.i.cs",
  "**/*.generated.*",
  "**/*.min.js",
  "**/*.d.ts",
  "**/*.d.mts",
  "**/*.d.cts"
];

export interface FilterConfig {
  fileTypes: string[];
  include: string[];
  exclude: string[];
  useBuiltInExcludes: boolean;
}

/**
 * Returns a predicate over workspace-relative paths ("src/a/b.ts", forward slashes).
 * Order of checks: extension enabled → not excluded → included.
 */
export function createFileFilter(cfg: FilterConfig): (relativePath: string) => boolean {
  const exts = cfg.fileTypes.map(e => e.toLowerCase()).filter(e => SUPPORTED_EXTENSIONS.includes(e));
  const options = { dot: true, nocase: true };
  const excludes = [...(cfg.useBuiltInExcludes ? BUILT_IN_EXCLUDES : []), ...cfg.exclude];
  const isExcluded = excludes.length ? picomatch(excludes, options) : () => false;
  const isIncluded = picomatch(cfg.include.length ? cfg.include : ["**/*"], options);

  return (relativePath: string): boolean => {
    const p = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
    const lower = p.toLowerCase();
    if (!exts.some(e => lower.endsWith(e))) return false;
    // .d.ts must not be mistaken for .ts when the user removed built-in excludes: that is their call.
    if (isExcluded(p)) return false;
    return isIncluded(p);
  };
}

/** One brace glob for vscode.workspace.findFiles. */
export function extensionGlob(fileTypes: string[]): string {
  const exts = fileTypes.filter(e => SUPPORTED_EXTENSIONS.includes(e.toLowerCase())).map(e => e.replace(/^\./, ""));
  return exts.length === 1 ? `**/*.${exts[0]}` : `**/*.{${exts.join(",")}}`;
}
