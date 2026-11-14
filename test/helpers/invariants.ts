import * as ts from "typescript";

import { lexCSharp } from "../../src/core/csharp/lexer";
import { POSITIONAL_COMMENT_RE } from "../../src/core/layout";
import { languageFor, sortText } from "../../src/core/sortText";
import type { PartialOptions } from "../../src/core/options";

/**
 * Properties every sort must satisfy, whatever the input. Fixtures check the
 * *intended* output; invariants catch the bugs nobody wrote a fixture for
 * (lost code, duplicated code, detached comments, broken syntax).
 */

export interface Violation {
  invariant: string;
  detail: string;
}

interface Tok {
  text: string;
  start: number;
  end: number;
}

interface Comment {
  text: string;
  start: number;
  end: number;
}

export function tokenize(text: string, fileName: string): { tokens: Tok[]; comments: Comment[] } {
  if (languageFor(fileName) === "csharp") {
    const tokens = lexCSharp(text).map(t => ({ end: t.end, start: t.start, text: t.text }));
    return { comments: commentsBetween(text, tokens), tokens };
  }
  // A full parse gives exact token boundaries (regex vs divide, JSX text) — walk the tree's tokens.
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const tokens: Tok[] = [];
  const visit = (n: ts.Node): void => {
    if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return;
    if (n.kind >= ts.SyntaxKind.FirstToken && n.kind <= ts.SyntaxKind.LastToken) {
      tokens.push({ end: n.end, start: n.getStart(sf), text: n.getText(sf) });
      return;
    }
    if (n.kind === ts.SyntaxKind.JsxText || ts.isTemplateLiteralToken(n) || ts.isStringLiteral(n) || ts.isIdentifier(n)) {
      tokens.push({ end: n.end, start: n.getStart(sf), text: n.getText(sf) });
      return;
    }
    const children = n.getChildren(sf);
    if (!children.length) {
      tokens.push({ end: n.end, start: n.getStart(sf), text: n.getText(sf) });
      return;
    }
    children.forEach(visit);
  };
  visit(sf);
  const real = tokens.filter(t => t.end > t.start);
  return { comments: commentsBetween(text, real), tokens: real };
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/i.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** Comments live in the gaps between tokens. */
function commentsBetween(text: string, tokens: Tok[]): Comment[] {
  const out: Comment[] = [];
  let prev = 0;
  const scanGap = (from: number, to: number): void => {
    let i = from;
    while (i < to) {
      if (text.startsWith("//", i)) {
        let e = i;
        while (e < to && text[e] !== "\n" && text[e] !== "\r") e++;
        out.push({ end: e, start: i, text: text.slice(i, e) });
        i = e;
      } else if (text.startsWith("/*", i)) {
        const e = Math.min(to, text.indexOf("*/", i + 2) + 2 || to);
        out.push({ end: e, start: i, text: text.slice(i, e) });
        i = e;
      } else i++;
    }
  };
  for (const t of tokens) {
    scanGap(prev, t.start);
    prev = t.end;
  }
  scanGap(prev, text.length);
  return out;
}

function multiset(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return m;
}

function diffMultiset(a: string[], b: string[]): string | null {
  const ma = multiset(a);
  const mb = multiset(b);
  const problems: string[] = [];
  for (const [k, v] of ma) if ((mb.get(k) ?? 0) !== v) problems.push(`${JSON.stringify(k.slice(0, 80))}: ${v} → ${mb.get(k) ?? 0}`);
  for (const [k, v] of mb) if (!ma.has(k)) problems.push(`${JSON.stringify(k.slice(0, 80))}: 0 → ${v}`);
  return problems.length ? problems.slice(0, 5).join("; ") : null;
}

/**
 * The anchor of a comment: the tokens it is glued to.
 *  - trailing comment (code before it on the same line): the 2 tokens before it
 *  - leading comment directly above code: the next tokens up to 3, stopping at a brace
 * Detached comments (blank line after them) are not anchored — they may legitimately stay put.
 */
function anchors(text: string, fileName: string): string[] {
  const { tokens, comments } = tokenize(text, fileName);
  const out: string[] = [];
  for (const c of comments) {
    const lineStart = text.lastIndexOf("\n", c.start - 1) + 1;
    const before = text.slice(lineStart, c.start);
    const idx = tokens.findIndex(t => t.start >= c.end);
    const lineEnd = text.indexOf("\n", c.end) < 0 ? text.length : text.indexOf("\n", c.end);
    const after = text.slice(c.end, lineEnd).trim();
    if (before.trim() !== "" && after !== "" && idx >= 0 && tokens[idx].start < lineEnd) {
      // inline comment between two tokens of the same line: `export /*c*/ function`
      const prev = tokens.filter(t => t.end <= c.start).slice(-1);
      out.push(`${prev.map(t => t.text).join(" ")} ⟵ ${c.text} ⟶ ${tokens[idx].text}`);
      continue;
    }
    if (before.trim() !== "" && !before.trim().startsWith("/*") && !before.trim().startsWith("//")) {
      const prev = tokens.filter(t => t.end <= c.start).slice(-2);
      out.push(`${prev.map(t => t.text).join(" ")} ⟵ ${c.text}`);
      continue;
    }
    if (idx < 0) continue;
    const gap = text.slice(c.end, tokens[idx].start);
    if ((gap.match(/\n/g) ?? []).length >= 2) continue; // detached
    if (POSITIONAL_COMMENT_RE.test(c.text)) continue; // fences, not anchors
    const isFileHeader = !tokens.some(t => t.end <= c.start) && !/^\/\*\*(?!\/)|^\/\/\/(?!\/)/.test(c.text);
    if (isFileHeader) continue; // file headers stay at the top by design
    const next: string[] = [];
    for (let k = idx; k < tokens.length && next.length < 3; k++) {
      next.push(tokens[k].text);
      if (["{", "}", ";"].includes(tokens[k].text)) break;
    }
    out.push(`${c.text} ⟶ ${next.join(" ")}`);
  }
  return out;
}

export function parsesCleanly(text: string, fileName: string): string | null {
  if (languageFor(fileName) === "csharp") {
    try {
      const r = sortText(text, fileName);
      return r.skippedReason === "syntax error" ? r.hazards[0]?.message ?? "syntax error" : null;
    } catch (e) {
      return String(e);
    }
  }
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const d = (sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
  return d.length ? ts.flattenDiagnosticMessageText(d[0].messageText, " ") : null;
}

const stripBlankLines = (s: string): string =>
  s
    .split(/\r?\n/)
    .filter(l => l.trim() !== "")
    .join("\n");

export function checkInvariants(input: string, fileName: string, options: PartialOptions = {}): Violation[] {
  const v: Violation[] = [];
  const first = sortText(input, fileName, options);
  const out = first.text;

  // 1. Idempotent: sorting sorted code changes nothing.
  const second = sortText(out, fileName, options).text;
  if (second !== out) v.push({ detail: firstDifference(out, second), invariant: "idempotent" });

  if (!first.changed) return v;

  // 2. Still valid syntax.
  const inputOk = parsesCleanly(input, fileName) === null;
  const err = parsesCleanly(out, fileName);
  if (inputOk && err) v.push({ detail: err, invariant: "output parses" });

  // 3. Exactly the same tokens (nothing lost, nothing duplicated).
  const a = tokenize(input, fileName);
  const b = tokenize(out, fileName);
  const tokDiff = diffMultiset(
    a.tokens.map(t => t.text),
    b.tokens.map(t => t.text)
  );
  if (tokDiff) v.push({ detail: tokDiff, invariant: "same tokens" });

  // 4. Same comments, and each attached comment still sits next to the same code.
  const comDiff = diffMultiset(
    a.comments.map(c => c.text),
    b.comments.map(c => c.text)
  );
  if (comDiff) v.push({ detail: comDiff, invariant: "same comments" });
  const anchorDiff = diffMultiset(anchors(input, fileName), anchors(out, fileName));
  if (anchorDiff) v.push({ detail: anchorDiff, invariant: "comments stay attached" });

  // 5. Same line endings.
  const bareLf = (t: string): number => (t.match(/(^|[^\r])\n/g) ?? []).length;
  if (input.includes("\r\n") && bareLf(out) > bareLf(input)) v.push({ detail: "LF introduced into CRLF file", invariant: "line endings" });

  return v;
}

/**
 * Order independence: shuffle every sortable segment, sort again, and expect
 * the same code as sorting the original (blank lines aside — spacing of
 * already-sorted segments is intentionally preserved).
 */
export function checkPermutationIndependence(input: string, fileName: string, options: PartialOptions = {}, seeds = 5): Violation[] {
  const expected = stripBlankLines(sortText(input, fileName, options).text);
  const v: Violation[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const shuffled = sortText(input, fileName, { ...options, shuffleSeed: seed }).text;
    const resorted = stripBlankLines(sortText(shuffled, fileName, options).text);
    if (resorted !== expected) {
      v.push({ detail: `seed ${seed}: ${firstDifference(expected, resorted)}`, invariant: "order independent" });
      break;
    }
  }
  return v;
}

export function firstDifference(a: string, b: string): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return `line ${i + 1}: expected ${JSON.stringify(la[i])}, got ${JSON.stringify(lb[i])}`;
  }
  return "(identical lines, different line endings?)";
}
