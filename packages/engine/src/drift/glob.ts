/**
 * Minimal, dependency-free glob matching for path patterns used in
 * `.driftlens.yml`. Supports `**` (any depth, incl. zero), `*` (any run of
 * non-`/`), and `?` (a single non-`/`). Paths are POSIX-normalized first.
 */

const REGEX_SPECIALS = /[.+^${}()|[\]\\]/g;

/** Compile a glob pattern to an anchored RegExp. */
export function globToRegExp(glob: string): RegExp {
  let re = "^";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i += 2;
        if (glob[i] === "/") {
          re += "(?:.*/)?"; // `**/` — any number of leading dirs, including none
          i += 1;
        } else {
          re += ".*"; // trailing `**`
        }
        continue;
      }
      re += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      i += 1;
      continue;
    }
    re += c.replace(REGEX_SPECIALS, "\\$&");
    i += 1;
  }
  return new RegExp(re + "$");
}

/** True if `path` matches `glob`. */
export function matchGlob(glob: string, path: string): boolean {
  return globToRegExp(glob).test(normalize(path));
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}
