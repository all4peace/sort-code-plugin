import * as ts from "typescript";

import type { SortOptions } from "../options";
import type { Access, Container, Element, FileModel, Hazard } from "../types";

/**
 * TS/JS front-end built on the real TypeScript parser (bundled), so JSX,
 * regex literals, template strings, decorators etc. are handled exactly.
 *
 * Top level is the risky part of JS: module code executes top to bottom.
 * Only declarations that run no code when they are evaluated may move:
 *   - function declarations (hoisted)
 *   - interfaces / type aliases (erased)
 *   - `const x = () => …` / `const x = function …` (creating a function runs nothing)
 *   - `const X = <side-effect free literal>` that does not read another same-file binding
 *   - enums / classes whose load-time parts (extends, decorators, static
 *     initializers, computed keys, enum initializers) do not read same-file bindings
 * Everything else (imports, calls, `export default expr`, `module.exports`,
 * object literals referencing other consts, …) is a barrier and nothing crosses it.
 */

export class TsParseError extends Error {
  constructor(
    message: string,
    readonly offset: number
  ) {
    super(message);
  }
}

export function scriptKindFor(fileName: string): ts.ScriptKind {
  const ext = fileName.toLowerCase().replace(/^.*(\.[^.]+)$/, "$1");
  switch (ext) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

export function parseTypeScript(text: string, fileName: string, opts: SortOptions): FileModel {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const diags = (sf as unknown as { parseDiagnostics?: ts.DiagnosticWithLocation[] }).parseDiagnostics ?? [];
  if (diags.length) {
    throw new TsParseError(ts.flattenDiagnosticMessageText(diags[0].messageText, " "), diags[0].start ?? 0);
  }
  return new Builder(text, sf, opts).build();
}

class Builder {
  private readonly hazards: Hazard[] = [];
  private readonly containers: Container[] = [];
  /** Same-file names that are NOT hoisted (const/let/var/class/enum) — reading them at load time pins order. */
  private readonly lateBound = new Set<string>();

  constructor(
    private readonly text: string,
    private readonly sf: ts.SourceFile,
    private readonly opts: SortOptions
  ) {}

  build(): FileModel {
    collectLateBound(this.sf.statements, this.lateBound);
    const root = this.statementsContainer(this.sf.statements, 0, this.text.length, "file", true);
    this.walk(this.sf);
    this.attachChildren(root);
    return { hazards: this.hazards, root };
  }

  /** Finds class bodies and namespace blocks anywhere in the file. */
  private walk(node: ts.Node): void {
    if (ts.isClassLike(node) && this.opts.typescript.sortClassMembers) {
      const open = node.members.pos;
      const close = node.end - 1;
      if (this.text[close] === "}") this.containers.push(this.classContainer(node, open, close));
    } else if (ts.isModuleBlock(node)) {
      const inner = new Set<string>();
      collectLateBound(node.statements, inner);
      const saved = new Set(this.lateBound);
      inner.forEach(n => this.lateBound.add(n));
      this.containers.push(this.statementsContainer(node.statements, node.statements.pos, node.end - 1, "namespace", false));
      ts.forEachChild(node, n => this.walk(n));
      this.lateBound.clear();
      saved.forEach(n => this.lateBound.add(n));
      return;
    }
    ts.forEachChild(node, n => this.walk(n));
  }

  /** Each container becomes a child of the innermost element that contains it. */
  private attachChildren(root: Container): void {
    const all = [root, ...this.containers];
    const elements = all.flatMap(c => c.elements);
    for (const c of this.containers) {
      let best: Element | undefined;
      for (const el of elements) {
        if (el.start <= c.start && c.end <= el.end && (!best || el.end - el.start < best.end - best.start)) best = el;
      }
      if (best) best.children.push(c);
    }
  }

  // ---------------------------------------------------------------- top level

  private statementsContainer(
    statements: ts.NodeArray<ts.Statement>,
    start: number,
    end: number,
    description: string,
    isTopLevel: boolean
  ): Container {
    const elements: Element[] = [];
    for (const st of statements) elements.push(this.statementElement(st));
    return {
      description,
      elements: mergeOverloads(elements, statements as unknown as ts.Node[]),
      end,
      isTopLevel,
      kindOrder: this.opts.typescript.topLevelOrder,
      preserveKinds: new Map(),
      sortable: this.opts.typescript.sortTopLevel,
      start
    };
  }

  private statementElement(st: ts.Statement): Element {
    const el = this.element(st);
    const exported = hasModifier(st, ts.SyntaxKind.ExportKeyword);
    el.access = exported ? "public" : "private";
    const declared = hasModifier(st, ts.SyntaxKind.DeclareKeyword);

    if (ts.isFunctionDeclaration(st)) {
      el.kind = "function";
      el.name = st.name?.text ?? "default";
      el.barrier = false;
      return el;
    }
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) {
      el.kind = "type";
      el.name = st.name.text;
      el.barrier = false;
      return el;
    }
    if (ts.isEnumDeclaration(st)) {
      el.kind = "enum";
      el.name = st.name.text;
      const deps = st.members.flatMap(m => (m.initializer ? this.loadTimeRefs(m.initializer) : []));
      el.barrier = deps.length > 0;
      if (el.barrier) this.loadTimeHazard(st, `enum ${el.name}`, deps);
      return el;
    }
    if (ts.isClassDeclaration(st)) {
      el.kind = "class";
      el.name = st.name?.text ?? "default";
      const deps = this.classLoadTimeRefs(st);
      el.barrier = deps.length > 0;
      if (el.barrier) this.loadTimeHazard(st, `class ${el.name}`, deps);
      return el;
    }
    if (ts.isVariableStatement(st) && !declared && st.declarationList.flags & ts.NodeFlags.Const) {
      const decls = st.declarationList.declarations;
      const first = decls[0];
      if (!first || !ts.isIdentifier(first.name)) return el;
      el.name = first.name.text;
      const inits = decls.map(d => (d.initializer ? unwrap(d.initializer) : undefined));
      if (inits.every(i => i && (ts.isArrowFunction(i) || ts.isFunctionExpression(i)))) {
        el.kind = "function";
        el.barrier = false;
      } else if (inits.every(i => i && this.isPure(i))) {
        el.kind = "variable";
        el.barrier = false;
      }
      return el;
    }
    return el;
  }

  // ---------------------------------------------------------------- classes

  private classContainer(node: ts.ClassLikeDeclaration, start: number, end: number): Container {
    const name = node.name?.text ?? "(anonymous)";
    const elements: Element[] = node.members.map(m => this.memberElement(m));
    const c: Container = {
      description: `class ${name}`,
      elements: [],
      end,
      isTopLevel: false,
      kindOrder: this.opts.typescript.memberOrder,
      preserveKinds: new Map(),
      sortable: true,
      start
    };
    this.applyFieldRules(node, name, elements, c);
    this.applySchemaRules(node, name, c);
    c.elements = mergeOverloads(elements, node.members as unknown as ts.Node[]);
    return c;
  }

  private memberElement(m: ts.ClassElement): Element {
    const el = this.element(m);
    el.barrier = false;
    el.name = memberName(m, this.sf);
    const isStatic = hasModifier(m, ts.SyntaxKind.StaticKeyword);
    el.staticRank = isStatic ? 0 : 1;
    el.access = memberAccess(m, el.name, this.opts.typescript.underscoreIsPrivate);
    el.name = el.name.replace(/^#/, "");

    if (ts.isPropertyDeclaration(m)) {
      const init = m.initializer ? unwrap(m.initializer) : undefined;
      const isFn = !!init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
      el.kind = isFn && this.opts.typescript.arrowFunctionPropertiesAsMethods ? "method" : "field";
    } else if (ts.isMethodDeclaration(m)) el.kind = "method";
    else if (ts.isConstructorDeclaration(m)) el.kind = "constructor";
    else if (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) el.kind = "accessor";
    else if (ts.isIndexSignatureDeclaration(m)) el.kind = "indexSignature";
    else {
      el.kind = "#other"; // static blocks, stray semicolons: run in order / don't move
      el.barrier = true;
    }
    return el;
  }

  /**
   * Class fields initialize top-to-bottom. If an initializer reads another
   * instance/static field (`b = this.a + 1`), field order is kept. Arrow
   * function properties are fields at runtime, so when they are read during
   * initialization they are treated as fields too.
   */
  private applyFieldRules(node: ts.ClassLikeDeclaration, className: string, elements: Element[], c: Container): void {
    if (this.opts.fieldOrder === "sort") return;
    if (this.opts.fieldOrder === "preserve") {
      c.preserveKinds.set("field", {
        code: "field-initializer-dependency",
        message: `class ${className}: field order preserved (fieldOrder = "preserve").`,
        offset: node.getStart(this.sf)
      });
      return;
    }
    const props = node.members
      .map((m, i) => ({ el: elements[i], m }))
      .filter((x): x is { el: Element; m: ts.PropertyDeclaration } => ts.isPropertyDeclaration(x.m));
    const names = new Set(props.map(p => memberName(p.m, this.sf)));
    for (const { el, m } of props) {
      if (!m.initializer) continue;
      const init = unwrap(m.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) continue;
      const reads = findMemberReads(m.initializer, names, className);
      if (!reads.length) continue;
      const read = reads[0];
      for (const p of props) if (p.el.kind === "method" && reads.some(r => r.replace(/^#/, "") === p.el.name)) p.el.kind = "field";
      c.preserveKinds.set("field", {
        code: "field-initializer-dependency",
        message: `class ${className}: initializer of '${el.name}' reads '${read}'. Fields initialize in declaration order, so field order is kept as written.`,
        offset: m.getStart(this.sf)
      });
    }
  }

  /**
   * ORMs and schema builders read field order from the class: TypeORM / MikroORM /
   * sequelize-typescript column order, TypeGraphQL / NestJS GraphQL field order,
   * Mongoose @Schema property order. Reordering changes generated migrations and schemas.
   */
  private applySchemaRules(node: ts.ClassLikeDeclaration, className: string, c: Container): void {
    if (this.opts.fieldOrder === "sort" || c.preserveKinds.has("field")) return;
    const decorator = (ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [])
      .map(d => decoratorName(d))
      .find(n => SCHEMA_DECORATORS.has(n));
    if (!decorator) return;
    c.preserveKinds.set("field", {
      code: "schema-order",
      message: `class ${className}: @${decorator} classes map fields to columns / schema fields in declaration order; field order is kept.`,
      offset: node.getStart(this.sf)
    });
  }

  // ---------------------------------------------------------------- purity

  /** Same-file late-bound names read while the declaration itself is evaluated. */
  private loadTimeRefs(node: ts.Node): string[] {
    const found: string[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) return;
      if (ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isConstructorDeclaration(n)) return;
      if (ts.isTypeNode(n)) return;
      if (ts.isIdentifier(n) && isValueReference(n) && this.lateBound.has(n.text)) found.push(n.text);
      ts.forEachChild(n, visit);
    };
    visit(node);
    return found;
  }

  private classLoadTimeRefs(node: ts.ClassDeclaration): string[] {
    const parts: ts.Node[] = [];
    for (const d of ts.getDecorators(node) ?? []) parts.push(d);
    for (const h of node.heritageClauses ?? []) if (h.token === ts.SyntaxKind.ExtendsKeyword) parts.push(...h.types.map(t => t.expression));
    for (const m of node.members) {
      if (ts.canHaveDecorators(m)) for (const d of ts.getDecorators(m) ?? []) parts.push(d);
      if (m.name && ts.isComputedPropertyName(m.name)) parts.push(m.name);
      if (ts.isClassStaticBlockDeclaration(m)) parts.push(m.body);
      if (ts.isPropertyDeclaration(m) && hasModifier(m, ts.SyntaxKind.StaticKeyword) && m.initializer) parts.push(m.initializer);
      if (ts.isConstructorDeclaration(m)) {
        for (const p of m.parameters) if (ts.canHaveDecorators(p)) for (const d of ts.getDecorators(p) ?? []) parts.push(d);
      }
      if (ts.isMethodDeclaration(m)) {
        for (const p of m.parameters) if (ts.canHaveDecorators(p)) for (const d of ts.getDecorators(p) ?? []) parts.push(d);
      }
    }
    const self = node.name?.text;
    return parts.flatMap(p => this.loadTimeRefs(p)).filter(n => n !== self);
  }

  /** Side-effect free and independent of other same-file bindings. */
  private isPure(n: ts.Expression): boolean {
    n = unwrap(n);
    switch (n.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.BigIntLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      case ts.SyntaxKind.RegularExpressionLiteral:
      case ts.SyntaxKind.TrueKeyword:
      case ts.SyntaxKind.FalseKeyword:
      case ts.SyntaxKind.NullKeyword:
      case ts.SyntaxKind.ArrowFunction:
      case ts.SyntaxKind.FunctionExpression:
        return true;
      case ts.SyntaxKind.Identifier:
        return !this.lateBound.has((n as ts.Identifier).text);
      case ts.SyntaxKind.PropertyAccessExpression:
        return this.isPure((n as ts.PropertyAccessExpression).expression);
      case ts.SyntaxKind.ElementAccessExpression: {
        const e = n as ts.ElementAccessExpression;
        return this.isPure(e.expression) && this.isPure(e.argumentExpression);
      }
      case ts.SyntaxKind.TemplateExpression:
        return (n as ts.TemplateExpression).templateSpans.every(s => this.isPure(s.expression));
      case ts.SyntaxKind.PrefixUnaryExpression: {
        const p = n as ts.PrefixUnaryExpression;
        return p.operator !== ts.SyntaxKind.PlusPlusToken && p.operator !== ts.SyntaxKind.MinusMinusToken && this.isPure(p.operand);
      }
      case ts.SyntaxKind.TypeOfExpression:
        return this.isPure((n as ts.TypeOfExpression).expression);
      case ts.SyntaxKind.BinaryExpression: {
        const b = n as ts.BinaryExpression;
        const op = b.operatorToken.kind;
        const assignment = op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment;
        return !assignment && this.isPure(b.left) && this.isPure(b.right);
      }
      case ts.SyntaxKind.ConditionalExpression: {
        const c = n as ts.ConditionalExpression;
        return this.isPure(c.condition) && this.isPure(c.whenTrue) && this.isPure(c.whenFalse);
      }
      case ts.SyntaxKind.ArrayLiteralExpression:
        return (n as ts.ArrayLiteralExpression).elements.every(e =>
          ts.isSpreadElement(e) ? this.isPure(e.expression) : ts.isOmittedExpression(e) || this.isPure(e)
        );
      case ts.SyntaxKind.ObjectLiteralExpression:
        return (n as ts.ObjectLiteralExpression).properties.every(p => {
          if (p.name && ts.isComputedPropertyName(p.name) && !this.isPure(p.name.expression)) return false;
          if (ts.isPropertyAssignment(p)) return this.isPure(p.initializer);
          if (ts.isShorthandPropertyAssignment(p)) return !this.lateBound.has(p.name.text);
          if (ts.isSpreadAssignment(p)) return this.isPure(p.expression);
          return true; // methods / accessors are not evaluated
        });
      default:
        return false; // calls, new, tagged templates, await, class expressions, …
    }
  }

  private loadTimeHazard(node: ts.Node, what: string, deps: string[]): void {
    this.hazards.push({
      code: "load-time-dependency",
      message: `${what} reads '${[...new Set(deps)].join("', '")}' while the module loads (extends / decorator / static or enum initializer). It stays where it is so it is never evaluated before what it reads.`,
      offset: node.getStart(this.sf),
      severity: "info"
    });
  }

  private element(node: ts.Node): Element {
    return {
      access: "public",
      barrier: true,
      children: [],
      end: node.end,
      kind: "#statement",
      name: "",
      start: node.getStart(this.sf),
      staticRank: 1
    };
  }
}

// ---------------------------------------------------------------- helpers

const SCHEMA_DECORATORS = new Set(["Entity", "ViewEntity", "ObjectType", "InputType", "ArgsType", "InterfaceType", "Schema", "Table", "Embeddable"]);

function decoratorName(d: ts.Decorator): string {
  let e = d.expression;
  if (ts.isCallExpression(e)) e = e.expression;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return ts.isIdentifier(e) ? e.text : "";
}

function collectLateBound(statements: ts.NodeArray<ts.Statement>, into: Set<string>): void {
  const addBinding = (n: ts.BindingName): void => {
    if (ts.isIdentifier(n)) into.add(n.text);
    else for (const e of n.elements) if (!ts.isOmittedExpression(e)) addBinding(e.name);
  };
  for (const st of statements) {
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) addBinding(d.name);
    else if ((ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) into.add(st.name.text);
    else if (ts.isModuleDeclaration(st) && ts.isIdentifier(st.name)) into.add(st.name.text);
  }
}

/** An identifier used as a value (not a property name, not a declaration name, not a type). */
function isValueReference(id: ts.Identifier): boolean {
  const p = id.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if (ts.isPropertyAssignment(p) && p.name === id) return false;
  if ((ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p)) && p.name === id) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name === id) return false;
  if (ts.isQualifiedName(p) || ts.isTypeReferenceNode(p)) return false;
  return true;
}

function unwrap(e: ts.Expression): ts.Expression {
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression;
    else if (ts.isSatisfiesExpression(e)) e = e.expression;
    else return e;
  }
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some(m => m.kind === kind);
}

function memberName(m: ts.ClassElement, sf: ts.SourceFile): string {
  if (ts.isConstructorDeclaration(m)) return "constructor";
  if (ts.isIndexSignatureDeclaration(m)) return "[index]";
  if (!m.name) return "";
  if (ts.isIdentifier(m.name) || ts.isPrivateIdentifier(m.name)) return m.name.text;
  if (ts.isStringLiteral(m.name) || ts.isNumericLiteral(m.name)) return m.name.text;
  return m.name.getText(sf);
}

function memberAccess(m: ts.ClassElement, name: string, underscoreIsPrivate: boolean): Access {
  if (hasModifier(m, ts.SyntaxKind.PrivateKeyword) || name.startsWith("#")) return "private";
  if (hasModifier(m, ts.SyntaxKind.ProtectedKeyword)) return "protected";
  if (underscoreIsPrivate && name.startsWith("_") && !hasModifier(m, ts.SyntaxKind.PublicKeyword)) return "private";
  return "public";
}

/** `this.x`, `ClassName.x` (and `this.#x`) reads of sibling members, ignoring nested function bodies. */
function findMemberReads(node: ts.Node, names: Set<string>, className: string): string[] {
  const found: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return;
    if (ts.isPropertyAccessExpression(n)) {
      const target = n.expression;
      const isSelf = target.kind === ts.SyntaxKind.ThisKeyword || (ts.isIdentifier(target) && target.text === className);
      if (isSelf && names.has(n.name.text)) found.push(n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/**
 * Overload signatures must stay directly in front of their implementation and
 * a getter/setter pair reads best together: consecutive declarations with the
 * same kind, name and static-ness become one element.
 */
function mergeOverloads(elements: Element[], nodes: ts.Node[]): Element[] {
  const out: Element[] = [];
  elements.forEach((el, i) => {
    const prev = out[out.length - 1];
    const prevNode = i > 0 ? nodes[i - 1] : undefined;
    const sameGroup =
      prev &&
      !prev.barrier &&
      !el.barrier &&
      prev.kind === el.kind &&
      prev.name === el.name &&
      prev.staticRank === el.staticRank &&
      el.kind !== "field" &&
      el.kind !== "variable" &&
      (el.kind !== "type" || isOverloadable(prevNode));
    if (sameGroup && (el.kind === "accessor" || isOverloadable(prevNode))) {
      prev.end = el.end;
      prev.children.push(...el.children);
      if (rankAccess(el.access) < rankAccess(prev.access)) prev.access = el.access;
    } else out.push(el);
  });
  return out;
}

function isOverloadable(n: ts.Node | undefined): boolean {
  if (!n) return false;
  return (
    ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n)) && !n.body) ||
    ts.isGetAccessor(n) ||
    ts.isSetAccessor(n)
  );
}

function rankAccess(a: Access): number {
  return ["public", "internal", "protectedInternal", "protected", "privateProtected", "private"].indexOf(a);
}
