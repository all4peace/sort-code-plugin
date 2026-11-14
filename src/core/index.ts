export { BUILT_IN_EXCLUDES, createFileFilter, extensionGlob, type FilterConfig } from "./fileFilter";
export { DEFAULT_OPTIONS, resolveOptions, type PartialOptions, type SortOptions } from "./options";
export { languageFor, sortText, SUPPORTED_EXTENSIONS, type SortResult } from "./sortText";
export type { Hazard, HazardCode } from "./types";

/** Smallest single replacement that turns `before` into `after` (keeps cursor, folding and undo tidy). */
export function minimalEdit(before: string, after: string): { start: number; end: number; text: string } | null {
  if (before === after) return null;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before.charCodeAt(endB - 1) === after.charCodeAt(endA - 1)) {
    endB--;
    endA--;
  }
  return { end: endB, start, text: after.slice(start, endA) };
}
