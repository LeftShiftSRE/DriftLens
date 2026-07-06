# ADR 0001: Parser strategy — TS compiler API now, tree-sitter interface for the rest

- **Status:** Accepted
- **Date:** 2026-07-06

## Context

The foundation and plan call for tree-sitter as the parser, chosen for
multi-language support. Phase 1, however, targets TypeScript first (then Python),
and the extension must install and run with zero friction on Windows, macOS, and
Linux. `node-tree-sitter` uses native bindings that require a compile step and
are a common source of install failures, especially on Windows and on
externally-mounted / non-standard filesystems.

## Decision

Define a single language-agnostic `LanguageParser` interface that produces a
normalized `ParsedFile` (imports, exports, definitions). Implement the first
parser — TypeScript/JavaScript — on the **TypeScript compiler API**, which:

- ships with the toolchain (no native build, no post-install compile),
- is first-party and accurate for the language most of our users write,
- gives us richer syntax handling than a tree-sitter grammar would for TS.

Parsers for other languages (Python, Go, …) implement the **same interface** and
may use tree-sitter (via WASM grammars, `web-tree-sitter`, to keep installs
native-build-free) or any other strategy. The graph builder and drift detector
consume only `ParsedFile`, so they are unaffected by the choice per language.

## Consequences

- **Positive:** Zero-friction install; accurate TS parsing; the pluggable-parser
  architecture the foundation wants is realized from day one.
- **Positive:** Adding a language is a self-contained task — implement the
  interface, register by extension, add golden tests.
- **Neutral:** We are not "tree-sitter everywhere." The plan's tree-sitter goal
  is preserved for languages where it is the best available option.
- **Negative:** Two parser technologies to understand long-term. Mitigated by the
  narrow, shared interface that hides the difference from everything downstream.
