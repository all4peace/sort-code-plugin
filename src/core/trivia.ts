import type { Range } from "./types";

/**
 * Scans a gap that should contain only whitespace and comments (the space
 * between two members). Returns the comment ranges, or null if anything else
 * is found — in which case the caller must not reorder that container.
 */
export function scanTrivia(text: string, from: number, to: number): Range[] | null {
  const comments: Range[] = [];
  let i = from;
  while (i < to) {
    const ch = text.charCodeAt(i);
    if (isWhitespace(ch)) {
      i++;
      continue;
    }
    if (ch === 47 /* / */ && text.charCodeAt(i + 1) === 47) {
      const end = lineEnd(text, i, to);
      comments.push({ end, start: i });
      i = end;
      continue;
    }
    if (ch === 47 && text.charCodeAt(i + 1) === 42 /* * */) {
      const close = text.indexOf("*/", i + 2);
      if (close < 0 || close + 2 > to) return null;
      comments.push({ end: close + 2, start: i });
      i = close + 2;
      continue;
    }
    if (i === 0 && ch === 35 /* # */ && text.charCodeAt(1) === 33 /* ! */) {
      const end = lineEnd(text, i, to);
      comments.push({ end, start: i });
      i = end;
      continue;
    }
    return null;
  }
  return comments;
}

export function isWhitespace(ch: number): boolean {
  return ch === 32 || ch === 9 || ch === 10 || ch === 13 || ch === 11 || ch === 12 || ch === 0xfeff || ch === 0xa0;
}

/** End of the line (exclusive, before \r\n or \n). */
export function lineEnd(text: string, from: number, limit = text.length): number {
  let i = from;
  while (i < limit) {
    const c = text.charCodeAt(i);
    if (c === 10 || c === 13) break;
    i++;
  }
  return i;
}

export function lineStart(text: string, pos: number): number {
  let i = pos;
  while (i > 0) {
    const c = text.charCodeAt(i - 1);
    if (c === 10 || c === 13) break;
    i--;
  }
  return i;
}

export function countNewlines(text: string, from: number, to: number): number {
  let n = 0;
  for (let i = from; i < to; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

export function offsetToLine(text: string, offset: number): number {
  return countNewlines(text, 0, Math.min(offset, text.length));
}
