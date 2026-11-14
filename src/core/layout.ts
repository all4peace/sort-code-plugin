import type { SortOptions } from "./options";
import { countNewlines, isWhitespace, lineStart, scanTrivia } from "./trivia";
import type { Container, Element, Hazard, Range } from "./types";

/**
 * Language-agnostic re-ordering engine.
 *
 * For each container:
 *  1. Build "items": an element plus the comments that belong to it
 *     (leading comment block(s) and a trailing same-line comment).
 *  2. Split the item list into segments at barriers. Barriers never move and
 *     nothing ever crosses one.
 *  3. Sort each segment with a stable comparator. If the order did not change,
 *     the original text (including spacing) is kept byte-for-byte.
 *  4. Render. Nested containers are rendered first, recursively.
 */

interface Item extends Range {
  el?: Element; // undefined for stand-alone comment barriers
  barrier: boolean;
  index: number;
  kind: string;
}

/**
 * Comments whose meaning depends on their POSITION, not on the member below
 * them. They never move and act as fences (like #region in C#).
 *   sort-code-disable/enable, eslint-disable/enable (block form), tslint:disable,
 *   //#region //#endregion (VS Code folding), @ts-nocheck, istanbul ignore file,
 *   prettier-ignore-start/end, ReSharper disable/restore (not "disable once"),
 *   @formatter:off/on, jshint / jscs / global directives.
 */
export const POSITIONAL_COMMENT_RE =
  /^(?:\/\/|\/\*)\s*(?:sort-code-(?:disable|enable)(?![-\w])|eslint-(?:disable|enable)(?!-next-line|-line)|eslint\s|global\s|jshint\s|jscs:|tslint:(?:disable|enable)(?!-next-line|-line)|#?\s*(?:end)?region\b|@ts-nocheck|istanbul ignore file|prettier-ignore-(?:start|end)|ReSharper (?:disable|restore)(?! once)|@formatter:(?:off|on))/;

export class Renderer {
  private readonly eol: string;
  private readonly frozen: Range[];

  constructor(
    private readonly text: string,
    private readonly opts: SortOptions,
    private readonly hazards: Hazard[]
  ) {
    this.eol = text.includes("\r\n") ? "\r\n" : "\n";
    this.frozen = findFrozenRanges(text);
  }

  renderContainer(c: Container): string {
    if (!c.sortable || c.elements.length === 0) return this.renderPlain(c);
    const items = this.buildItems(c);
    if (!items) return this.renderPlain(c);

    const { text } = this;
    const rendered = items.map(it => this.renderItem(it));
    const gaps: string[] = [];
    gaps.push(text.slice(c.start, items.length ? items[0].start : c.end));
    for (let k = 1; k <= items.length; k++) {
      gaps.push(text.slice(items[k - 1].end, k < items.length ? items[k].start : c.end));
    }

    let out = gaps[0];
    let k = 0;
    while (k < items.length) {
      if (items[k].barrier) {
        out += rendered[k] + gaps[k + 1];
        k++;
        continue;
      }
      let e = k;
      while (e + 1 < items.length && !items[e + 1].barrier) e++;
      const seg = this.renderSegment(c, items, rendered, gaps, k, e);
      // A multi-line member that moved next to a fixed neighbour gets a blank line, like everywhere else.
      if (k > 0 && seg.first !== k && !isSingleLine(rendered[seg.first]) && countNewlines(gaps[k], 0, gaps[k].length) < 2) {
        out = out.slice(0, out.length - gaps[k].length) + this.eol + this.eol;
      }
      out += seg.text;
      const after = gaps[e + 1];
      const atEnd = e + 1 === items.length;
      out += !atEnd && seg.last !== e && !isSingleLine(rendered[seg.last]) && countNewlines(after, 0, after.length) < 2 ? this.eol + this.eol : after;
      k = e + 1;
    }
    return out;
  }

  private buildItems(c: Container): Item[] | null {
    const { text } = this;
    const items: Item[] = [];
    let cursor = c.start;

    const pushCommentBarrier = (start: number, end: number): boolean => {
      const ls = lineStart(text, start);
      if (ls < cursor || !isBlank(text, ls, start)) return false;
      items.push({ barrier: true, end, index: items.length, kind: "#comment", start: ls });
      cursor = end;
      return true;
    };

    for (let i = 0; i < c.elements.length; i++) {
      const el = c.elements[i];
      const comments = scanTrivia(text, cursor, el.start);
      if (!comments) return null;

      // Positional comments (sort-code-disable, eslint-disable, //#region …) never attach to a member.
      let lead = comments;
      const lastPragma = findLastIndex(lead, r => POSITIONAL_COMMENT_RE.test(text.slice(r.start, r.end)));
      if (lastPragma >= 0) {
        if (!pushCommentBarrier(lead[0].start, lead[lastPragma].end)) return null;
        lead = lead.slice(lastPragma + 1);
      }

      let start = el.start;
      // File header: a non-doc comment at the very top of a file stays at the top.
      if (lead.length && c.isTopLevel && items.length === 0 && !el.barrier && isBlank(text, c.start, lead[0].start)) {
        const blocks = groupBlocks(text, lead);
        const header = blocks[0];
        const glued = blocks.length === 1 && countNewlines(text, header.end, el.start) < 2;
        if (!(glued && isDocComment(text.slice(header.start, header.end)))) {
          if (!pushCommentBarrier(header.start, header.end)) return null;
          lead = lead.filter(r => r.start >= header.end);
        }
      }
      if (lead.length) {
        const blocks = groupBlocks(text, lead);
        const last = blocks[blocks.length - 1];
        const lastAttached = countNewlines(text, last.end, el.start) < 2;
        const detached = lastAttached ? blocks.slice(0, -1) : blocks;
        if (lastAttached) start = last.start;
        if (detached.length) {
          const first = detached[0].start;
          const lastDetachedEnd = detached[detached.length - 1].end;
          const keepInPlace = !el.barrier && (this.opts.detachedComments === "boundary" || i === 0);
          if (keepInPlace) {
            if (!pushCommentBarrier(first, lastDetachedEnd)) return null;
          } else {
            start = first;
          }
        }
      }

      const ls = lineStart(text, start);
      if (ls < cursor || !isBlank(text, ls, start)) return null;

      const end = this.trailingEnd(el.end, c);
      if (end < 0) return null;

      items.push({ barrier: el.barrier, el, end, index: items.length, kind: el.kind, start: ls });
      cursor = end;
    }

    const tail = scanTrivia(text, cursor, c.end);
    if (!tail) return null;
    if (tail.length && !pushCommentBarrier(tail[0].start, tail[tail.length - 1].end)) return null;

    for (const it of items) {
      if (!it.barrier && this.frozen.some(r => it.start < r.end && it.end > r.start)) it.barrier = true;
    }
    items.forEach((it, idx) => (it.index = idx));
    return items;
  }

  /** Extends past same-line trailing comments; -1 if something else shares the line. */
  private trailingEnd(pos: number, c: Container): number {
    const { text } = this;
    let i = pos;
    let end = pos;
    for (;;) {
      while (i < c.end && (text[i] === " " || text[i] === "\t")) i++;
      if (text.startsWith("//", i)) {
        while (i < c.end && text[i] !== "\n" && text[i] !== "\r") i++;
        end = i;
        continue;
      }
      if (text.startsWith("/*", i)) {
        const close = text.indexOf("*/", i + 2);
        if (close < 0 || close + 2 > c.end || text.slice(i, close).includes("\n")) break;
        i = close + 2;
        end = i;
        continue;
      }
      break;
    }
    if (i >= c.end) return c.isTopLevel && c.end === text.length ? end : -1;
    return text[i] === "\n" || text[i] === "\r" ? end : -1;
  }

  private renderSegment(
    c: Container,
    items: Item[],
    rendered: string[],
    gaps: string[],
    a: number,
    b: number
  ): { text: string; first: number; last: number } {
    const seg = items.slice(a, b + 1);
    const original = (): { text: string; first: number; last: number } => {
      let s = "";
      for (let k = a; k <= b; k++) s += rendered[k] + (k < b ? gaps[k + 1] : "");
      return { first: a, last: b, text: s };
    };
    if (seg.length < 2) return original();

    const sorted =
      this.opts.shuffleSeed !== undefined
        ? this.shufflePreserving(c, seg, this.opts.shuffleSeed + a)
        : [...seg].sort((x, y) => this.compare(c, x, y, false));

    this.reportPreserved(c, seg);

    if (sorted.every((it, idx) => it === seg[idx])) return original();

    // Learn blank-line style for single-line members of the same kind from the original.
    const tight = new Set<string>();
    const loose = new Set<string>();
    for (let k = a; k < b; k++) {
      const x = items[k];
      const y = items[k + 1];
      if (x.kind === y.kind && isSingleLine(rendered[k]) && isSingleLine(rendered[k + 1])) {
        (countNewlines(gaps[k + 1], 0, gaps[k + 1].length) >= 2 ? loose : tight).add(x.kind);
      }
    }

    let out = "";
    sorted.forEach((it, idx) => {
      if (idx > 0) {
        const prev = sorted[idx - 1];
        const sameKindSingle =
          prev.kind === it.kind && isSingleLine(rendered[prev.index]) && isSingleLine(rendered[it.index]);
        const blank = !sameKindSingle || (loose.has(it.kind) && !tight.has(it.kind));
        out += blank ? this.eol + this.eol : this.eol;
      }
      out += rendered[it.index];
    });
    return { first: sorted[0].index, last: sorted[sorted.length - 1].index, text: out };
  }

  /** Test hook: random order, except preserved kinds keep their relative order (as real sorting would). */
  private shufflePreserving(c: Container, seg: Item[], seed: number): Item[] {
    const out = shuffle(seg, seed);
    const preserved = seg.filter(it => c.preserveKinds.has(it.kind));
    let p = 0;
    return out.map(it => (c.preserveKinds.has(it.kind) ? preserved[p++] : it));
  }

  /** Emits a hazard when a preserved kind would have been re-ordered by the normal rules. */
  private reportPreserved(c: Container, seg: Item[]): void {
    for (const [kind, reason] of c.preserveKinds) {
      const members = seg.filter(it => it.kind === kind);
      if (members.length < 2) continue;
      const wouldBe = [...members].sort((x, y) => this.compare(c, x, y, true));
      if (wouldBe.some((it, idx) => it !== members[idx])) {
        if (!this.hazards.some(h => h.offset === reason.offset && h.code === reason.code)) {
          this.hazards.push({ code: reason.code, message: reason.message, offset: reason.offset, severity: "info" });
        }
      }
    }
  }

  private compare(c: Container, x: Item, y: Item, ignorePreserve: boolean): number {
    const kx = this.key(c, x, ignorePreserve);
    const ky = this.key(c, y, ignorePreserve);
    for (let i = 0; i < kx.length; i++) {
      if (kx[i] < ky[i]) return -1;
      if (kx[i] > ky[i]) return 1;
    }
    return 0;
  }

  private key(c: Container, it: Item, ignorePreserve: boolean): (number | string)[] {
    const el = it.el!;
    const kindRank = rank(c.kindOrder, el.kind);
    if (!ignorePreserve && c.preserveKinds.has(el.kind)) {
      const p = this.opts.primarySort === "access" ? [0, kindRank] : [kindRank, 0];
      return [...p, 0, "", "", it.index];
    }
    const accessRank = rank(this.opts.accessOrder, el.access);
    const p = this.opts.primarySort === "access" ? [accessRank, kindRank] : [kindRank, accessRank];
    const s = this.opts.staticFirst ? el.staticRank : 0;
    return [...p, s, el.name.toLowerCase(), el.name, it.index];
  }

  private renderItem(it: Item): string {
    const { text } = this;
    if (!it.el) return text.slice(it.start, it.end);
    return text.slice(it.start, it.el.start) + this.renderCore(it.el) + text.slice(it.el.end, it.end);
  }

  private renderCore(el: Element): string {
    const { text } = this;
    let out = "";
    let pos = el.start;
    for (const child of [...el.children].sort((p, q) => p.start - q.start)) {
      out += text.slice(pos, child.start) + this.renderContainer(child);
      pos = child.end;
    }
    return out + text.slice(pos, el.end);
  }

  private renderPlain(c: Container): string {
    const { text } = this;
    let out = "";
    let pos = c.start;
    for (const el of c.elements) {
      out += text.slice(pos, el.start) + this.renderCore(el);
      pos = el.end;
    }
    return out + text.slice(pos, c.end);
  }
}

function rank(order: readonly string[], value: string): number {
  const i = order.indexOf(value);
  return i < 0 ? order.length : i;
}

function isBlank(text: string, from: number, to: number): boolean {
  for (let i = from; i < to; i++) if (!isWhitespace(text.charCodeAt(i))) return false;
  return true;
}

function isDocComment(s: string): boolean {
  return /^\/\*\*(?!\/)/.test(s) || /^\/\/\/(?!\/)/.test(s);
}

function isSingleLine(s: string): boolean {
  return !s.includes("\n");
}

/** Comments separated by at most one newline form a block. */
function groupBlocks(text: string, comments: Range[]): Range[] {
  const blocks: Range[] = [];
  for (const cm of comments) {
    const last = blocks[blocks.length - 1];
    if (last && countNewlines(text, last.end, cm.start) < 2) last.end = cm.end;
    else blocks.push({ ...cm });
  }
  return blocks;
}

function findLastIndex<T>(arr: T[], pred: (t: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

/** Ranges between `sort-code-disable` and `sort-code-enable` comments. */
export function findFrozenRanges(text: string): Range[] {
  const re = /(?:\/\/|\/\*)[ \t]*sort-code-(disable|enable)(?![-\w])/g;
  const ranges: Range[] = [];
  let open = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1] === "disable" && open < 0) open = m.index;
    else if (m[1] === "enable" && open >= 0) {
      ranges.push({ end: m.index + m[0].length, start: open });
      open = -1;
    }
  }
  if (open >= 0) ranges.push({ end: text.length, start: open });
  return ranges;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = (seed * 2654435761) >>> 0 || 1;
  const rnd = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
