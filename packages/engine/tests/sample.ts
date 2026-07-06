import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { parseConfig, type DriftConfig } from "../src/drift/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "examples", "sample-repo");

/** Recursively collect source files under a dir, keyed by POSIX-relative path. */
function collect(dir: string, root: string, out: Map<string, string>): Map<string, string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, root, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      out.set(relative(root, full).replaceAll("\\", "/"), readFileSync(full, "utf8"));
    }
  }
  return out;
}

/** The checked-in sample repo's TypeScript sources, keyed by repo-relative path. */
export function sampleFiles(): Map<string, string> {
  return collect(join(repoRoot, "src"), repoRoot, new Map());
}

/** The sample repo's parsed `.driftlens.yml`. */
export function sampleConfig(): DriftConfig {
  return parseConfig(readFileSync(join(repoRoot, ".driftlens.yml"), "utf8"));
}
