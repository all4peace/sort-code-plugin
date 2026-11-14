import type { SortOptions } from "../options";
import type { Access, Container, Element, FileModel, Hazard } from "../types";
import { lexCSharp, LexError, type Token } from "./lexer";

/**
 * Structural C# parser. It does not build a full syntax tree; it finds
 * namespaces, type bodies and the member declarations inside them, which is
 * all the sorter needs. Brace/paren/bracket balance is verified up front; a
 * file that does not balance is never touched.
 */

const MODIFIERS = new Set([
  "public",
  "private",
  "protected",
  "internal",
  "static",
  "readonly",
  "const",
  "volatile",
  "abstract",
  "virtual",
  "override",
  "sealed",
  "new",
  "extern",
  "unsafe",
  "async",
  "partial",
  "required",
  "file",
  "fixed",
  "ref",
  "scoped"
]);

const TYPE_KEYWORDS = new Set(["class", "struct", "interface", "enum", "record", "delegate"]);
const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE = new Set([")", "]", "}"]);

export class CSharpParseError extends Error {
  constructor(
    message: string,
    readonly offset: number
  ) {
    super(message);
  }
}

type CtxKind = "compilationUnit" | "namespace" | "type";

interface Ctx {
  kind: CtxKind;
  typeName?: string;
  typeKind?: string; // class | struct | interface | record
}

export function parseCSharp(text: string, opts: SortOptions): FileModel {
  let tokens: Token[];
  try {
    tokens = lexCSharp(text);
  } catch (e) {
    if (e instanceof LexError) throw new CSharpParseError(e.message, e.offset);
    throw e;
  }
  const p = new Parser(text, tokens, opts);
  const root = p.parseRoot();
  return { hazards: p.hazards, root };
}

class Parser {
  readonly hazards: Hazard[] = [];
  private readonly match: Int32Array;

  constructor(
    private readonly text: string,
    private readonly toks: Token[],
    private readonly opts: SortOptions
  ) {
    this.match = new Int32Array(toks.length).fill(-1);
    const stack: number[] = [];
    toks.forEach((t, i) => {
      if (t.kind !== "punct") return;
      if (OPEN[t.text]) stack.push(i);
      else if (CLOSE.has(t.text)) {
        const o = stack.pop();
        if (o === undefined || OPEN[toks[o].text] !== t.text) {
          throw new CSharpParseError(`Unbalanced '${t.text}'`, t.start);
        }
        this.match[o] = i;
        this.match[i] = o;
      }
    });
    if (stack.length) throw new CSharpParseError(`Unclosed '${toks[stack[0]].text}'`, toks[stack[0]].start);
  }

  parseRoot(): Container {
    return this.parseContainer(0, this.toks.length, 0, this.text.length, { kind: "compilationUnit" }, "file", true);
  }

  private parseContainer(
    from: number,
    to: number,
    bodyStart: number,
    bodyEnd: number,
    ctx: Ctx,
    description: string,
    isTopLevel = false
  ): Container {
    const { toks } = this;
    const c: Container = {
      description,
      elements: [],
      end: bodyEnd,
      isTopLevel,
      kindOrder: this.opts.csharp.memberOrder,
      preserveKinds: new Map(),
      sortable: ctx.kind === "type" || this.opts.csharp.sortTypes,
      start: bodyStart
    };

    const conditionals: number[] = [];
    let i = from;
    while (i < to) {
      const t = toks[i];
      if (t.kind === "directive") {
        const name = directiveName(t);
        if (name === "if") {
          // The whole #if … #endif block becomes one immovable element; members around it still sort.
          const endIf = this.findEndIf(i, to);
          if (endIf >= 0) {
            const lastCode = [...toks.slice(i + 1, endIf)].reverse().find(x => x.kind !== "directive");
            const completesMember = !lastCode || lastCode.text === ";" || lastCode.text === "}";
            if (!completesMember && endIf + 1 < to) {
              // `#if X [Attr] #endif` belongs to the member below it: keep them together, in place.
              const m = this.scanMember(endIf + 1, to);
              const el = this.classify(m, ctx);
              el.start = t.start;
              el.barrier = true;
              c.elements.push(el);
              i = m.endIdx + 1;
            } else {
              c.elements.push(barrier(t.start, toks[endIf].end, "#conditional"));
              i = endIf + 1;
            }
            conditionals.push(c.elements.length - 1);
            continue;
          }
        }
        if (["if", "elif", "else", "endif"].includes(name) && c.sortable) {
          c.sortable = false;
          this.hazards.push({
            code: "preprocessor-conditional",
            message: `${description}: #${name} is not matched inside this block, so it is not sorted. Keep #if … #endif pairs around whole members.`,
            offset: t.start,
            severity: "warning"
          });
        }
        c.elements.push(barrier(t.start, t.end, "#directive"));
        i++;
        continue;
      }
      if (t.text === ";") {
        c.elements.push(barrier(t.start, t.end, "#empty"));
        i++;
        continue;
      }

      // Global attributes [assembly: …] stand alone.
      if (t.text === "[" && toks[i + 2]?.text === ":" && ["assembly", "module"].includes(toks[i + 1]?.text)) {
        const close = this.match[i];
        c.elements.push(barrier(t.start, toks[close].end, "#attribute"));
        i = close + 1;
        continue;
      }

      const m = this.scanMember(i, to);
      const el = this.classify(m, ctx);
      if (ctx.kind !== "type" && !isTypeKind(el.kind)) el.barrier = true;
      if (ctx.kind !== "type" && !this.opts.csharp.sortTypes) el.barrier = true;
      c.elements.push(el);
      i = m.endIdx + 1;
    }

    if (ctx.kind === "type") this.applyFieldRules(c, ctx);
    for (const idx of conditionals) {
      const before = c.elements.slice(0, idx).some(e => !e.barrier);
      const after = c.elements.slice(idx + 1).some(e => !e.barrier);
      if (c.sortable && before && after) {
        this.hazards.push({
          code: "preprocessor-conditional",
          message: `${description}: members inside #if … #endif stay where they are; members above and below it are sorted separately (nothing moves across it).`,
          offset: c.elements[idx].start,
          severity: "info"
        });
      }
    }
    return c;
  }

  /** Index of the #endif matching the #if at `i`, searching only this container's tokens. */
  private findEndIf(i: number, to: number): number {
    let depth = 0;
    for (let k = i; k < to; k++) {
      const t = this.toks[k];
      if (t.kind !== "directive") continue;
      const name = directiveName(t);
      if (name === "if") depth++;
      else if (name === "endif" && --depth === 0) return k;
    }
    return -1;
  }

  /** Finds where the member starting at `i` ends. */
  private scanMember(i: number, to: number): MemberScan {
    const { toks } = this;
    let j = i;
    while (j < to && toks[j].text === "[") j = this.match[j] + 1; // attributes
    const headerStart = j;
    let seenAssign = false;
    let body: [number, number] | undefined;
    let k = j;
    while (k < to) {
      const t = toks[k];
      if (t.text === "(" || t.text === "[") {
        k = this.match[k] + 1;
        continue;
      }
      if (t.text === "{") {
        const close = this.match[k];
        if (seenAssign) {
          k = close + 1;
          continue;
        }
        body = [k, close];
        const next = toks[close + 1];
        if (next && close + 1 < to && next.text === "=") {
          seenAssign = true; // auto-property initializer
          k = close + 1;
          continue;
        }
        if (next && close + 1 < to && next.text === ";") return { body, endIdx: close + 1, headerStart, start: i };
        return { body, endIdx: close, headerStart, start: i };
      }
      if (t.text === "=" || t.text === "=>") seenAssign = true;
      if (t.text === ";") return { body, endIdx: k, headerStart, start: i };
      k++;
    }
    // Ran into the end of the container without a terminator (e.g. a top-level statement w/o ';').
    return { body, endIdx: to - 1, headerStart, start: i };
  }

  private classify(m: MemberScan, ctx: Ctx): Element {
    const { toks } = this;
    const start = toks[m.start].start;
    const end = toks[m.endIdx].end;
    const el: Element = { access: "private", barrier: false, children: [], end, kind: "unknown", name: "", start, staticRank: 1 };

    // Header tokens up to the first depth-0 terminator, with paren/bracket groups kept as single entries.
    const header: { tok: Token; idx: number }[] = [];
    let k = m.headerStart;
    while (k <= m.endIdx) {
      const t = toks[k];
      if (["{", "=", "=>", ";"].includes(t.text)) break;
      header.push({ idx: k, tok: t });
      if (t.text === "(" || t.text === "[") k = this.match[k] + 1;
      else k++;
    }
    const terminator = toks[k]?.text ?? ";";

    const mods = new Set<string>();
    let r = 0;
    while (r < header.length && MODIFIERS.has(header[r].tok.text)) {
      // `new()` / `ref` used as part of a type are rare at member start; treat as modifiers.
      mods.add(header[r].tok.text);
      r++;
    }
    const rest = header.slice(r);
    const first = rest[0]?.tok.text ?? "";

    el.staticRank = mods.has("static") || mods.has("const") ? 0 : 1;

    if (first === "namespace") {
      el.barrier = true;
      el.kind = "#namespace";
      el.name = rest[1]?.tok.text ?? "";
      if (m.body) {
        const [o, cl] = m.body;
        el.children.push(
          this.parseContainer(o + 1, cl, toks[o].end, toks[cl].start, { kind: "namespace" }, `namespace ${el.name}`)
        );
      }
      return el;
    }
    if (first === "using" || first === "extern" || first === "global") {
      el.barrier = true;
      el.kind = "#using";
      return el;
    }

    if (TYPE_KEYWORDS.has(first)) {
      let kw = first;
      let nameIdx = 1;
      if (first === "record") {
        const second = rest[1]?.tok.text;
        if (second === "struct" || second === "class") {
          kw = second === "struct" ? "struct" : "record";
          nameIdx = 2;
        }
      }
      el.kind = kw === "record" ? "class" : kw;
      if (kw === "delegate") {
        el.name = nameBeforeCallParen(rest) ?? "";
      } else {
        el.name = rest[nameIdx]?.tok.text ?? "";
      }
      el.access = accessFrom(mods, ctx.kind === "type" ? "private" : "internal");
      if (m.body && el.kind !== "enum" && el.kind !== "delegate") {
        const [o, cl] = m.body;
        const attrText = this.text.slice(start, toks[m.headerStart]?.start ?? start);
        const childCtx: Ctx = { kind: "type", typeKind: kw === "record" && first === "record" ? "record" : kw, typeName: el.name };
        const child = this.parseContainer(o + 1, cl, toks[o].end, toks[cl].start, childCtx, `${kw} ${el.name}`);
        if (/\bStructLayout\b/.test(attrText) || el.kind === "struct") {
          this.preserveFields(child, "struct-layout", structMessage(el.kind, el.name), start);
        }
        if (el.kind === "interface" && /\b(ComImport|InterfaceType)\b/.test(attrText)) {
          // COM vtable layout == declaration order. Never reorder.
          for (const kind of this.opts.csharp.memberOrder) {
            child.preserveKinds.set(kind, {
              code: "com-interop",
              message: `interface ${el.name}: COM interface ([ComImport]/[InterfaceType]) — member order is the vtable layout, so nothing is reordered.`,
              offset: start
            });
          }
          child.kindOrder = [];
        }
        el.children.push(child);
      }
      return el;
    }

    if (ctx.kind !== "type") {
      el.kind = "#statement";
      el.barrier = true;
      return el;
    }

    const defaultAccess: Access = ctx.typeKind === "interface" ? "public" : "private";

    if (first === "event") {
      el.kind = "event";
      el.name = lastIdent(rest) ?? "";
      el.access = accessFrom(mods, defaultAccess);
      return this.explicitImpl(el, rest);
    }

    const opIdx = rest.findIndex(h => h.tok.text === "operator");
    if (opIdx >= 0) {
      el.kind = "method";
      const sym = rest[opIdx + 1]?.tok.text ?? "";
      el.name = `operator ${sym}`;
      el.access = accessFrom(mods, defaultAccess);
      return el;
    }

    const thisIdx = rest.findIndex((h, n) => h.tok.text === "this" && rest[n + 1]?.tok.text === "[");
    if (thisIdx >= 0 && !rest.some(h => h.tok.text === "(")) {
      el.kind = "indexer";
      el.name = "this";
      el.access = accessFrom(mods, defaultAccess);
      return this.explicitImpl(el, rest);
    }

    const callIdx = findCallParen(rest);
    if (callIdx >= 0) {
      const nameEntry = nameEntryBefore(rest, callIdx);
      el.name = nameEntry ? nameEntry.text : "";
      const nameIdx = nameEntry ? nameEntry.pos : 0;
      if (nameIdx > 0 && rest[nameIdx - 1].tok.text === "~") el.kind = "destructor";
      else if (nameIdx === 0 && el.name === ctx.typeName) el.kind = "constructor";
      else el.kind = "method";
      el.access = accessFrom(mods, el.kind === "destructor" ? "private" : defaultAccess);
      if (el.kind === "constructor" && mods.has("static")) el.access = "public"; // static ctors take no modifier; run first
      return this.explicitImpl(el, rest);
    }

    el.kind = terminator === "{" || terminator === "=>" ? "property" : "field";
    el.name = el.kind === "field" ? (firstDeclarator(rest) ?? "") : (lastIdent(rest) ?? "");
    el.access = accessFrom(mods, defaultAccess);
    if (el.kind === "field") {
      if (mods.has("const")) el.staticRank = 0;
      else if (mods.has("static") && mods.has("readonly")) el.staticRank = 1;
      else if (mods.has("static")) el.staticRank = 2;
      else if (mods.has("readonly")) el.staticRank = 3;
      else el.staticRank = 4;
    }
    return this.explicitImpl(el, rest);
  }

  /** `void IFoo.Bar()` has no access modifier but is reachable through the interface: sort it as public. */
  private explicitImpl(el: Element, rest: { tok: Token }[]): Element {
    const nameAt = rest.findIndex(h => h.tok.text === el.name);
    if (nameAt > 0 && rest[nameAt - 1].tok.text === "." && !rest.some(h => ["public", "private", "protected", "internal"].includes(h.tok.text))) {
      el.access = "public";
    }
    return el;
  }

  /**
   * C# runs field and auto-property initializers in textual order. If one
   * initializer reads another member that also has an initializer, reordering
   * can change program behaviour (classic static readonly null bug).
   */
  private applyFieldRules(c: Container, ctx: Ctx): void {
    if (this.opts.fieldOrder === "preserve") {
      this.preserveFields(c, "field-initializer-dependency", `${ctx.typeKind} ${ctx.typeName}: field order preserved (fieldOrder = "preserve").`, c.start);
      return;
    }
    if (this.opts.fieldOrder === "sort") {
      c.preserveKinds.clear();
      return;
    }
    const initialized: { el: Element; names: string[]; inits: [number, number][] }[] = [];
    for (const el of c.elements) {
      if (el.kind !== "field" && el.kind !== "property") continue;
      const info = this.initializerInfo(el);
      if (info.inits.length || el.kind === "field") initialized.push({ el, inits: info.inits, names: info.names });
    }
    const names = new Set(initialized.flatMap(x => x.names));
    const refs = (t: number): boolean => {
      const tok = this.toks[t];
      if (tok.kind !== "ident" || !names.has(tok.text.replace(/^@/, ""))) return false;
      if (this.toks[t - 1]?.text !== ".") return true;
      return this.toks[t - 2]?.text === ctx.typeName; // TypeName.Member
    };
    for (const x of initialized) {
      for (const [from, upto] of x.inits) {
        const t = Array.from({ length: upto - from }, (_, n) => from + n).find(refs);
        if (t === undefined) continue;
        const tok = this.toks[t];
        {
          const target = initialized.find(y => y.names.includes(tok.text.replace(/^@/, "")));
          const kinds = new Set([x.el.kind, target?.el.kind ?? x.el.kind]);
          for (const kind of kinds) {
            if (!c.preserveKinds.has(kind)) {
              c.preserveKinds.set(kind, {
                code: "field-initializer-dependency",
                message: `${ctx.typeKind} ${ctx.typeName}: initializer of '${x.el.name}' reads '${tok.text}'. Initializers run in declaration order, so ${kind} order is kept as written.`,
                offset: x.el.start
              });
            }
          }
        }
      }
    }
  }

  private preserveFields(c: Container, code: "struct-layout" | "field-initializer-dependency", message: string, offset: number): void {
    if (this.opts.fieldOrder === "sort") return;
    c.preserveKinds.set("field", { code, message, offset });
  }

  /** Declarator names and the token ranges of the initializers of a field / auto-property. */
  private initializerInfo(el: Element): { names: string[]; inits: [number, number][] } {
    const { toks } = this;
    let i = this.tokenAt(el.start);
    const last = this.tokenAt(el.end - 1);
    while (toks[i].text === "[") i = this.match[i] + 1;
    const names: string[] = [];
    const inits: [number, number][] = [];
    let k = i;
    let initStart = -1;
    const addName = (idx: number): void => {
      const p = prevIdent(toks, idx);
      if (p && !names.includes(p)) names.push(p);
    };
    while (k <= last) {
      const t = toks[k];
      if (initStart < 0) {
        if (t.text === "{") {
          addName(k); // property accessor body; an initializer may follow
          k = this.match[k] + 1;
          continue;
        }
        if (t.text === "=>") break; // expression-bodied property: evaluated lazily
        if (t.text === "=") {
          addName(k);
          initStart = k + 1;
        } else if (t.text === "," || t.text === ";") addName(k);
        if (OPEN[t.text]) {
          k = this.match[k] + 1;
          continue;
        }
      } else {
        if (OPEN[t.text]) {
          k = this.match[k] + 1;
          continue;
        }
        if (t.text === "," || t.text === ";") {
          inits.push([initStart, k]);
          initStart = -1;
        }
      }
      k++;
    }
    return { inits, names: names.map(n => n.replace(/^@/, "")) };
  }

  /** Index of the token that contains `offset` (binary search). */
  private tokenAt(offset: number): number {
    let lo = 0;
    let hi = this.toks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.toks[mid].start <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

interface MemberScan {
  start: number;
  headerStart: number;
  endIdx: number;
  body?: [number, number];
}

function directiveName(t: Token): string {
  return /^#\s*(\w+)/.exec(t.text)?.[1] ?? "";
}

function barrier(start: number, end: number, kind: string): Element {
  return { access: "private", barrier: true, children: [], end, kind, name: "", start, staticRank: 1 };
}

function isTypeKind(kind: string): boolean {
  return ["class", "struct", "interface", "enum", "delegate"].includes(kind);
}

function accessFrom(mods: Set<string>, dflt: Access): Access {
  if (mods.has("public")) return "public";
  if (mods.has("protected") && mods.has("internal")) return "protectedInternal";
  if (mods.has("private") && mods.has("protected")) return "privateProtected";
  if (mods.has("protected")) return "protected";
  if (mods.has("internal")) return "internal";
  if (mods.has("private")) return "private";
  return dflt;
}

function findCallParen(rest: { tok: Token }[]): number {
  for (let n = 1; n < rest.length; n++) {
    if (rest[n].tok.text !== "(") continue;
    const prev = rest[n - 1].tok;
    if (prev.kind === "ident" || prev.text === ">") return n;
  }
  return -1;
}

function nameEntryBefore(rest: { tok: Token }[], callIdx: number): { text: string; pos: number } | null {
  let n = callIdx - 1;
  if (rest[n].tok.text === ">") {
    let depth = 0;
    for (; n >= 0; n--) {
      const t = rest[n].tok.text;
      if (t === ">") depth++;
      else if (t === "<") {
        depth--;
        if (depth === 0) break;
      }
    }
    n--;
  }
  if (n < 0 || rest[n].tok.kind !== "ident") return null;
  return { pos: n, text: rest[n].tok.text.replace(/^@/, "") };
}

function nameBeforeCallParen(rest: { tok: Token }[]): string | null {
  const idx = findCallParen(rest);
  return idx >= 0 ? (nameEntryBefore(rest, idx)?.text ?? null) : null;
}

function lastIdent(rest: { tok: Token }[]): string | null {
  for (let n = rest.length - 1; n >= 0; n--) if (rest[n].tok.kind === "ident") return rest[n].tok.text.replace(/^@/, "");
  return null;
}

function firstDeclarator(rest: { tok: Token }[]): string | null {
  const comma = rest.findIndex(h => h.tok.text === ",");
  const upto = comma >= 0 ? rest.slice(0, comma) : rest;
  return lastIdent(upto);
}

function prevIdent(toks: Token[], k: number): string | null {
  let j = k - 1;
  if (toks[j]?.text === "]") return null;
  return toks[j]?.kind === "ident" ? toks[j].text : null;
}

function structMessage(kind: string, name: string): string {
  return kind === "struct"
    ? `struct ${name}: field order defines memory layout (interop, Unsafe, serialization); fields keep their order.`
    : `class ${name}: [StructLayout] makes field order part of the memory layout; fields keep their order.`;
}
