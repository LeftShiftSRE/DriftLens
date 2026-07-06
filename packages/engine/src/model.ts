/**
 * The normalized, language-agnostic data model that flows through the engine.
 *
 * Every {@link LanguageParser} produces a {@link ParsedFile}. The graph builder
 * and drift detector consume only this shape — they never see language-specific
 * syntax. That is what lets a new language parser light up the whole pipeline
 * without touching anything downstream.
 */

/** The kind of a source-level definition. */
export type DefinitionKind =
  | "class"
  | "function"
  | "interface"
  | "variable"
  | "enum"
  | "type"
  | "method";

/** A single `import` (or equivalent) in a file. */
export interface ImportRef {
  /** The raw module specifier, e.g. `"./user-service"` or `"react"`. */
  readonly moduleSpecifier: string;
  /**
   * Imported binding names. Uses the sentinel `"*"` for a namespace import
   * (`import * as x`) and `"default"` for a default import.
   */
  readonly imported: readonly string[];
  /** True for `import type` / type-only imports. */
  readonly isTypeOnly: boolean;
  /** 1-based line number of the import statement. */
  readonly line: number;
}

/** A symbol exported from a file. */
export interface ExportRef {
  /** Exported name; `"default"` for a default export. */
  readonly name: string;
  readonly kind: DefinitionKind;
  readonly isTypeOnly: boolean;
  /** 1-based line number. */
  readonly line: number;
}

/** A top-level (or class-member) definition in a file. */
export interface Definition {
  readonly name: string;
  readonly kind: DefinitionKind;
  /** True if this definition is exported from the file. */
  readonly exported: boolean;
  /** 1-based line number. */
  readonly line: number;
  /** For methods, the name of the enclosing class. */
  readonly container?: string;
}

/** The normalized result of parsing one source file. */
export interface ParsedFile {
  /** Repo-relative, POSIX-normalized path (forward slashes). */
  readonly path: string;
  /** Language id, e.g. `"typescript"`. */
  readonly language: string;
  readonly imports: readonly ImportRef[];
  readonly exports: readonly ExportRef[];
  readonly definitions: readonly Definition[];
  /**
   * A content fingerprint of the source text at parse time (see
   * {@link import("./util/hash.js").fnv1a}). Feeds node/edge provenance and
   * change detection in the unified model. Optional so parsers that do not
   * hash stay valid; the first-party TypeScript parser always sets it.
   */
  readonly contentHash?: string;
}

/**
 * A parser for one or more languages. Register implementations with the parser
 * registry keyed by file extension. Implementations MUST be pure: no I/O, no
 * global state — `parse` maps `(path, source)` to a {@link ParsedFile}.
 */
export interface LanguageParser {
  /** Language id, e.g. `"typescript"`. */
  readonly language: string;
  /** File extensions this parser handles, incl. the dot, e.g. `[".ts", ".tsx"]`. */
  readonly extensions: readonly string[];
  parse(path: string, source: string): ParsedFile;
}
