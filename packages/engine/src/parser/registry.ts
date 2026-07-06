import type { LanguageParser, ParsedFile } from "../model.js";
import { typeScriptParser } from "./typescript.js";

/**
 * Maps file extensions to {@link LanguageParser}s. This is the single extension
 * point for language support: register a parser here (or via {@link ParserRegistry.register})
 * and it lights up the whole downstream pipeline.
 */
export class ParserRegistry {
  private readonly byExtension = new Map<string, LanguageParser>();

  /** Register a parser for all of its declared extensions. */
  register(parser: LanguageParser): this {
    for (const ext of parser.extensions) {
      this.byExtension.set(ext.toLowerCase(), parser);
    }
    return this;
  }

  /** Return the parser for a file path, or `undefined` if unsupported. */
  parserFor(path: string): LanguageParser | undefined {
    const ext = extname(path);
    return ext ? this.byExtension.get(ext.toLowerCase()) : undefined;
  }

  /** True if some registered parser handles this file. */
  supports(path: string): boolean {
    return this.parserFor(path) !== undefined;
  }

  /** Parse a file, or return `undefined` if no parser handles its extension. */
  parse(path: string, source: string): ParsedFile | undefined {
    return this.parserFor(path)?.parse(path, source);
  }
}

/** Extract the lowercased extension (with dot) from a path, or `""`. */
function extname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot);
}

/** A registry pre-loaded with all first-party parsers. */
export function defaultRegistry(): ParserRegistry {
  return new ParserRegistry().register(typeScriptParser);
}
