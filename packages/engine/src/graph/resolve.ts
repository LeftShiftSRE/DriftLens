/**
 * Resolve a relative import specifier to a known file path.
 *
 * This is deliberately dependency-free path resolution (no `tsconfig` paths, no
 * `node_modules` walking yet): given the importer's path and the set of known
 * project files, it resolves `./`, `../`, and extensionless / index imports the
 * way Node and bundlers do. Bare specifiers (e.g. `"react"`) return `undefined`
 * and are treated as external by the caller.
 */

const RESOLVE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

/** True if the specifier is relative (`./` or `../`). */
export function isRelative(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/**
 * Resolve `specifier` imported from `importerPath` against `knownFiles`.
 * Returns the matched project path, or `undefined` if nothing matches.
 */
export function resolveImport(
  importerPath: string,
  specifier: string,
  knownFiles: ReadonlySet<string>,
): string | undefined {
  if (!isRelative(specifier)) return undefined;

  const baseDir = dirname(importerPath);
  const joined = normalize(join(baseDir, specifier));

  for (const candidate of candidates(joined, specifier)) {
    if (knownFiles.has(candidate)) return candidate;
  }
  return undefined;
}

/** Candidate paths to probe, in priority order. */
function* candidates(joined: string, specifier: string): Generator<string> {
  const hasExplicitExt = RESOLVE_EXTENSIONS.some((ext) => specifier.endsWith(ext));

  if (hasExplicitExt) {
    yield joined;
    // Allow `./x.js` to resolve to `./x.ts` (TS ESM rewriting convention).
    const withoutExt = joined.slice(0, joined.lastIndexOf("."));
    for (const ext of RESOLVE_EXTENSIONS) yield withoutExt + ext;
    return;
  }

  // Extensionless: try file with each extension, then `/index` with each.
  for (const ext of RESOLVE_EXTENSIONS) yield joined + ext;
  for (const ext of RESOLVE_EXTENSIONS) yield `${joined}/index${ext}`;
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function join(base: string, rel: string): string {
  return base ? `${base}/${rel}` : rel;
}

/** Normalize `.`/`..` segments in a POSIX-style path. */
function normalize(path: string): string {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else out.push("..");
    } else {
      out.push(segment);
    }
  }
  return out.join("/");
}
