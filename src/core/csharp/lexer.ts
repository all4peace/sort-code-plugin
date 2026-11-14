/**
 * Minimal C# lexer. It only needs to be exact about the things that can hide
 * braces, semicolons or `=` from the structural parser: comments, all string
 * flavours (regular, verbatim @"", interpolated $"", raw """ """, raw
 * interpolated $$""" """), char literals and preprocessor directives.
 */

export type TokKind = "ident" | "number" | "string" | "char" | "punct" | "directive";

export interface Token {
  kind: TokKind;
  start: number;
  end: number;
  text: string;
}

export class LexError extends Error {
  constructor(
    message: string,
    readonly offset: number
  ) {
    super(message);
  }
}

const PUNCT3 = ["??=", "<<=", "..."];
const PUNCT2 = ["=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "::", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", "->", ".."];

export function lexCSharp(text: string): Token[] {
  return new Lexer(text).run();
}

class Lexer {
  private pos = 0;
  private readonly tokens: Token[] = [];

  constructor(private readonly text: string) {}

  run(): Token[] {
    for (;;) {
      const t = this.next();
      if (!t) return this.tokens;
      this.tokens.push(t);
    }
  }

  /** Returns the next significant token (comments and whitespace skipped). */
  private next(): Token | null {
    const { text } = this;
    for (;;) {
      if (this.pos >= text.length) return null;
      const ch = text[this.pos];
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "\uFEFF" || ch === "\f" || ch === "\v") {
        this.pos++;
        continue;
      }
      if (ch === "/" && text[this.pos + 1] === "/") {
        while (this.pos < text.length && text[this.pos] !== "\n") this.pos++;
        continue;
      }
      if (ch === "/" && text[this.pos + 1] === "*") {
        const close = text.indexOf("*/", this.pos + 2);
        if (close < 0) throw new LexError("Unterminated block comment", this.pos);
        this.pos = close + 2;
        continue;
      }
      break;
    }

    const start = this.pos;
    const ch = text[start];

    if (ch === "#" && this.atLineStart(start)) {
      let e = start;
      while (e < text.length && text[e] !== "\n" && text[e] !== "\r") e++;
      this.pos = e;
      return this.tok("directive", start);
    }

    // Strings: optional $…$ and/or @ prefixes.
    const str = this.tryString();
    if (str) return str;

    if (ch === "'") {
      this.pos++;
      while (this.pos < text.length && text[this.pos] !== "'") {
        if (text[this.pos] === "\\") this.pos++;
        if (text[this.pos] === "\n") throw new LexError("Unterminated char literal", start);
        this.pos++;
      }
      if (this.pos >= text.length) throw new LexError("Unterminated char literal", start);
      this.pos++;
      return this.tok("char", start);
    }

    if (isIdentStart(ch) || (ch === "@" && isIdentStart(text[start + 1] ?? ""))) {
      this.pos++;
      while (this.pos < text.length && isIdentPart(text[this.pos])) this.pos++;
      return this.tok("ident", start);
    }

    if (ch >= "0" && ch <= "9") {
      this.pos++;
      while (this.pos < text.length && /[0-9a-zA-Z_.]/.test(text[this.pos])) {
        if (text[this.pos] === "." && !/[0-9]/.test(text[this.pos + 1] ?? "")) break;
        this.pos++;
      }
      return this.tok("number", start);
    }

    for (const p of PUNCT3) if (text.startsWith(p, start)) return this.punct(start, 3);
    for (const p of PUNCT2) if (text.startsWith(p, start)) return this.punct(start, 2);
    return this.punct(start, 1);
  }

  private tryString(): Token | null {
    const { text } = this;
    const start = this.pos;
    let i = start;
    let dollars = 0;
    let verbatim = false;
    while (text[i] === "$") {
      dollars++;
      i++;
    }
    if (text[i] === "@") {
      verbatim = true;
      i++;
      while (text[i] === "$") {
        dollars++;
        i++;
      }
    }
    if (text[i] !== '"') return null;

    // Raw string literal: three or more quotes.
    let quotes = 0;
    while (text[i + quotes] === '"') quotes++;
    if (!verbatim && quotes >= 3) {
      this.pos = i + quotes;
      this.scanRaw(quotes, dollars, start);
      return this.tok("string", start);
    }

    this.pos = i + 1;
    for (;;) {
      if (this.pos >= text.length) throw new LexError("Unterminated string literal", start);
      const c = text[this.pos];
      if (c === '"') {
        if (verbatim && text[this.pos + 1] === '"') {
          this.pos += 2;
          continue;
        }
        this.pos++;
        return this.tok("string", start);
      }
      if (!verbatim && c === "\\") {
        this.pos += 2;
        continue;
      }
      if (!verbatim && c === "\n") throw new LexError("Newline in string literal", start);
      if (dollars > 0 && c === "{") {
        if (text[this.pos + 1] === "{") {
          this.pos += 2;
          continue;
        }
        this.pos++;
        this.skipHole(start);
        continue;
      }
      if (dollars > 0 && c === "}" && text[this.pos + 1] === "}") {
        this.pos += 2;
        continue;
      }
      this.pos++;
    }
  }

  private scanRaw(quotes: number, dollars: number, start: number): void {
    const { text } = this;
    const closing = '"'.repeat(quotes);
    for (;;) {
      if (this.pos >= text.length) throw new LexError("Unterminated raw string literal", start);
      if (text.startsWith(closing, this.pos)) {
        this.pos += quotes;
        while (text[this.pos] === '"') this.pos++;
        return;
      }
      if (dollars > 0 && text[this.pos] === "{") {
        let run = 0;
        while (text[this.pos + run] === "{") run++;
        if (run >= dollars) {
          this.pos += run;
          this.skipHole(start);
          // a hole closes with `dollars` braces; skipHole consumed the first one
          for (let k = 1; k < dollars && text[this.pos] === "}"; k++) this.pos++;
          continue;
        }
        this.pos += run;
        continue;
      }
      this.pos++;
    }
  }

  /** Skips an interpolation hole `{ … }` (opening brace already consumed). */
  private skipHole(stringStart: number): void {
    let depth = 0;
    for (;;) {
      const t = this.next();
      if (!t) throw new LexError("Unterminated interpolation", stringStart);
      if (t.text === "{") depth++;
      else if (t.text === "}") {
        if (depth === 0) return;
        depth--;
      }
    }
  }

  private atLineStart(pos: number): boolean {
    let i = pos - 1;
    while (i >= 0 && (this.text[i] === " " || this.text[i] === "\t")) i--;
    return i < 0 || this.text[i] === "\n" || this.text[i] === "\r";
  }

  private punct(start: number, len: number): Token {
    this.pos = start + len;
    return this.tok("punct", start);
  }

  private tok(kind: TokKind, start: number): Token {
    return { end: this.pos, kind, start, text: this.text.slice(start, this.pos) };
  }
}

function isIdentStart(c: string): boolean {
  return /[A-Za-z_À-￿]/.test(c);
}

function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_À-￿]/.test(c);
}
