import ts from "typescript";
import type {
  Definition,
  DefinitionKind,
  ExportRef,
  ImportRef,
  LanguageParser,
  ParsedFile,
} from "../model.js";

/**
 * TypeScript / JavaScript parser built on the TypeScript compiler API.
 *
 * We use the compiler API rather than tree-sitter for TS/JS specifically
 * because it ships with the toolchain (no native build, works on every OS the
 * extension runs on) and gives us accurate, first-party syntax handling for the
 * language most of our target users write. Tree-sitter parsers for other
 * languages implement the same {@link LanguageParser} interface. See
 * `docs/adr/0001-parser-strategy.md`.
 */
export class TypeScriptParser implements LanguageParser {
  readonly language = "typescript";
  readonly extensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"] as const;

  parse(path: string, source: string): ParsedFile {
    const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));

    const imports: ImportRef[] = [];
    const exports: ExportRef[] = [];
    const definitions: Definition[] = [];

    const lineOf = (node: ts.Node): number =>
      sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

    for (const stmt of sf.statements) {
      collectImports(stmt, imports, lineOf);
      collectDefinitions(stmt, definitions, lineOf);
    }

    // Named exports (`export { a, b }` and `export { a } from './x'`) are
    // resolved against the definitions we just found so their kind is accurate.
    const kindByName = new Map<string, DefinitionKind>();
    for (const def of definitions) {
      if (def.container === undefined) kindByName.set(def.name, def.kind);
    }
    for (const stmt of sf.statements) {
      collectExportStatements(stmt, exports, imports, kindByName, lineOf);
    }

    // Exported definitions are also exports.
    for (const def of definitions) {
      if (def.exported && def.container === undefined) {
        exports.push({
          name: def.name,
          kind: def.kind,
          isTypeOnly: def.kind === "interface" || def.kind === "type",
          line: def.line,
        });
      }
    }

    return { path: normalizePath(path), language: this.language, imports, exports, definitions };
  }
}

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false)
    : false;
}

function isExported(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function isDefault(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.DefaultKeyword);
}

function collectImports(
  stmt: ts.Statement,
  out: ImportRef[],
  lineOf: (n: ts.Node) => number,
): void {
  if (!ts.isImportDeclaration(stmt)) return;
  if (!ts.isStringLiteral(stmt.moduleSpecifier)) return;

  const moduleSpecifier = stmt.moduleSpecifier.text;
  const clause = stmt.importClause;
  const imported: string[] = [];
  let isTypeOnly = false;

  if (clause) {
    isTypeOnly = clause.isTypeOnly;
    if (clause.name) imported.push("default");
    const named = clause.namedBindings;
    if (named) {
      if (ts.isNamespaceImport(named)) {
        imported.push("*");
      } else {
        for (const el of named.elements) imported.push(el.name.text);
      }
    }
  }

  out.push({ moduleSpecifier, imported, isTypeOnly, line: lineOf(stmt) });
}

function collectDefinitions(
  stmt: ts.Statement,
  out: Definition[],
  lineOf: (n: ts.Node) => number,
): void {
  if (ts.isClassDeclaration(stmt) && stmt.name) {
    out.push({
      name: stmt.name.text,
      kind: "class",
      exported: isExported(stmt),
      line: lineOf(stmt),
    });
    for (const member of stmt.members) {
      if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
        out.push({
          name: member.name.text,
          kind: "method",
          exported: false,
          line: lineOf(member),
          container: stmt.name.text,
        });
      }
    }
    return;
  }

  if (ts.isFunctionDeclaration(stmt) && stmt.name) {
    out.push({
      name: stmt.name.text,
      kind: "function",
      exported: isExported(stmt),
      line: lineOf(stmt),
    });
    return;
  }

  if (ts.isInterfaceDeclaration(stmt)) {
    out.push({
      name: stmt.name.text,
      kind: "interface",
      exported: isExported(stmt),
      line: lineOf(stmt),
    });
    return;
  }

  if (ts.isEnumDeclaration(stmt)) {
    out.push({
      name: stmt.name.text,
      kind: "enum",
      exported: isExported(stmt),
      line: lineOf(stmt),
    });
    return;
  }

  if (ts.isTypeAliasDeclaration(stmt)) {
    out.push({
      name: stmt.name.text,
      kind: "type",
      exported: isExported(stmt),
      line: lineOf(stmt),
    });
    return;
  }

  if (ts.isVariableStatement(stmt)) {
    const exported = isExported(stmt);
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        out.push({
          name: decl.name.text,
          kind: "variable",
          exported,
          line: lineOf(decl),
        });
      }
    }
    return;
  }
}

function collectExportStatements(
  stmt: ts.Statement,
  exportsOut: ExportRef[],
  importsOut: ImportRef[],
  kindByName: Map<string, DefinitionKind>,
  lineOf: (n: ts.Node) => number,
): void {
  // `export { a, b }` and `export { a } from './x'` and `export * from './x'`.
  if (ts.isExportDeclaration(stmt)) {
    const line = lineOf(stmt);
    const fromModule =
      stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)
        ? stmt.moduleSpecifier.text
        : undefined;

    if (!stmt.exportClause) {
      // `export * from './x'` — a re-export edge with no explicit names.
      if (fromModule) {
        importsOut.push({ moduleSpecifier: fromModule, imported: ["*"], isTypeOnly: stmt.isTypeOnly, line });
      }
      return;
    }

    if (ts.isNamedExports(stmt.exportClause)) {
      const reExportNames: string[] = [];
      for (const el of stmt.exportClause.elements) {
        const name = el.name.text;
        const isTypeOnly = stmt.isTypeOnly || el.isTypeOnly;
        exportsOut.push({
          name,
          kind: kindByName.get(name) ?? "variable",
          isTypeOnly,
          line,
        });
        reExportNames.push(el.propertyName?.text ?? name);
      }
      if (fromModule) {
        importsOut.push({ moduleSpecifier: fromModule, imported: reExportNames, isTypeOnly: stmt.isTypeOnly, line });
      }
    }
    return;
  }

  // `export default <decl-or-expr>`.
  if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
    exportsOut.push({ name: "default", kind: "variable", isTypeOnly: false, line: lineOf(stmt) });
    return;
  }

  // `export default function/class ...` — a default-modified declaration.
  if (isDefault(stmt)) {
    let kind: DefinitionKind = "variable";
    if (ts.isFunctionDeclaration(stmt)) kind = "function";
    else if (ts.isClassDeclaration(stmt)) kind = "class";
    exportsOut.push({ name: "default", kind, isTypeOnly: false, line: lineOf(stmt) });
  }
}

/** The default, ready-to-use TypeScript/JavaScript parser instance. */
export const typeScriptParser = new TypeScriptParser();
