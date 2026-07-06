/**
 * A tiny, dependency-free content hash.
 *
 * We deliberately avoid `node:crypto` so the engine stays bundler- and
 * webview-safe (it is bundled into the VS Code extension by esbuild; see
 * `docs/adr/0002-engine-bundling.md`). FNV-1a is not cryptographic — it exists
 * only to fingerprint a source artifact for provenance and change detection.
 */

/**
 * FNV-1a (32-bit) hash of `input`, returned as an 8-character lowercase hex
 * string. Deterministic and stable across runs and platforms.
 */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 16777619, via shifts to stay in 32-bit unsigned range.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
