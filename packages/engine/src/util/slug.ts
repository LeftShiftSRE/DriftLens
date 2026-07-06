/**
 * Turn a human name into a stable, url/id-safe slug used in declared-node ids
 * (`service:<slug>`, `owner:<slug>`, `adr:<slug>`, …). Deterministic; lossy for
 * names that differ only in punctuation (see `docs/architecture-data-model.md`).
 */
export function slug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
