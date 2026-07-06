# ADR 0002: Bundle the engine into the extension instead of node-linking it

- **Status:** Accepted
- **Date:** 2026-07-06

## Context

The extension consumes `@driftlens/engine`. The natural monorepo approach is a
`workspace:*` dependency, which pnpm satisfies with a directory **symlink** into
`packages/extension/node_modules`. Some filesystems this project is developed on
(exFAT external drives on Windows) support neither symlinks nor hardlinks, so
`pnpm install` fails with `EISDIR` when creating that link. `node-linker=hoisted`
and `inject-workspace-packages` did not avoid the direct workspace symlink in the
pnpm version in use.

Separately, a VS Code extension ships as a single bundled file regardless — the
engine is bundled in by esbuild at build time, so a runtime `node_modules` copy
of it is not actually needed.

## Decision

Do **not** declare `@driftlens/engine` as a node-linked dependency of the
extension. Instead resolve it directly to the engine's source:

- **Build:** esbuild `alias` maps `@driftlens/engine` →
  `packages/engine/src/index.ts` (see `packages/extension/esbuild.mjs`).
- **Typecheck:** `tsconfig.json` `paths` maps the same specifier to the engine
  source. `noEmit` is on (esbuild owns emit), so no `rootDir` constraint applies.

The engine is still a first-class workspace package with its own build, tests,
and published `dist`; only the *extension's* consumption of it is via source
alias.

## Consequences

- **Positive:** `pnpm install` works on symlink-less filesystems; the build has
  no dependency on the engine being pre-built (esbuild compiles engine source
  directly); one fewer moving part in the extension bundle.
- **Negative:** The alias is duplicated in two places (esbuild + tsconfig) and is
  extension-specific config a newcomer must know about. Documented here and in
  both files.
- **Revisit if:** we publish the engine to npm (then a normal versioned
  dependency is preferable), or move development to a symlink-capable filesystem
  and want standard `workspace:*` wiring.
