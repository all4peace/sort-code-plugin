import * as vscode from "vscode";

import { createFileFilter, languageFor } from "../core";
import { settingsFrom, type SortCodeSettings } from "../core/config";

export type ExtensionSettings = SortCodeSettings;

export function readSettings(scope?: vscode.ConfigurationScope): ExtensionSettings {
  const c = vscode.workspace.getConfiguration("sortCode", scope);
  return settingsFrom(key => c.get(key));
}

/** Workspace-relative path with forward slashes, or the bare file name for files outside the workspace. */
export function relativePath(uri: vscode.Uri): string {
  const rel = vscode.workspace.asRelativePath(uri, false);
  return rel.replace(/\\/g, "/");
}

/** File type enabled (used for manual "Sort Current File"). */
export function isSupportedType(doc: vscode.TextDocument, s: ExtensionSettings): boolean {
  if (doc.uri.scheme !== "file" && doc.uri.scheme !== "untitled" && doc.uri.scheme !== "vscode-remote") return false;
  if (!languageFor(doc.fileName)) return false;
  const lower = doc.fileName.toLowerCase();
  return s.filter.fileTypes.some(e => lower.endsWith(e.toLowerCase()));
}

/** Type enabled AND include/exclude rules pass (used for sort on save and sort all). */
export function isIncluded(uri: vscode.Uri, s: ExtensionSettings): boolean {
  return createFileFilter(s.filter)(relativePath(uri));
}
