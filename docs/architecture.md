# DriftLens architecture (Phase 1)

DriftLens is split into a **deterministic engine** and a thin **VS Code
extension** that presents it. Everything runs locally.

```
                 ┌──────────────────────────────────────────────┐
                 │            VS Code Extension (TS)             │
                 │  file watcher · status bar · Cytoscape webview │
                 └───────────────────────┬──────────────────────┘
                                         │ calls
                 ┌───────────────────────▼──────────────────────┐
                 │              @driftlens/engine                │
                 │                                              │
                 │  ParserRegistry ──▶ CodeGraph ──▶ detectDrift │
                 │  (TS compiler API)  (in-memory)   (vs config) │
                 └──────────────────────────────────────────────┘
```

## Package: `@driftlens/engine`

Pure TypeScript, no UI, no I/O beyond what the caller passes in. This is the
critical path and is fully unit-tested.

- **`model.ts`** — the normalized, language-agnostic data model
  (`ParsedFile`, `ImportRef`, `ExportRef`, `Definition`) and the `LanguageParser`
  interface every parser implements.
- **`parser/`** — `TypeScriptParser` (built on the TS compiler API; see
  [ADR 0001](adr/0001-parser-strategy.md)) and a `ParserRegistry` that routes
  files to parsers by extension.
- **`graph/`** — `CodeGraph` assembles a `GraphView` (file / symbol / external
  nodes; import / contains edges) from parsed files. Import resolution
  (`resolve.ts`) handles relative, extensionless, and index imports. Incremental
  at the parse layer via `setFile` / `removeFile`.
- **`drift/`** — the `.driftlens.yml` schema + loader (`config.ts`), a
  dependency-free glob matcher (`glob.ts`), and `detectDrift` which compares the
  actual graph to the declared architecture and emits a `DriftReport`
  (events + health score + per-file service assignment + violating edges).
- **`analyze.ts`** — `analyzeProject(files, { config })` ties the pipeline
  together for one-shot analysis.

## Data flow

1. A file changes → the extension's watcher reads it.
2. `ParserRegistry.parse(path, source)` → `ParsedFile`.
3. `CodeGraph.setFile(parsed)` updates the in-memory model (only the changed file
   is re-parsed — the expensive step).
4. `CodeGraph.snapshot()` → `GraphView`.
5. `detectDrift(view, config)` → `DriftReport`.
6. The extension pushes the graph + report to the webview and status bar.

## Deferred / planned

- **Persistence (`packages/graph`):** Phase 1 keeps the graph in memory. SQLite +
  Kùzu persistence (for large repos and time-travel) is extracted into a
  dedicated package in the graph-persistence milestone (plan weeks 5–6).
- **Team sync (`packages/team-sync`):** Phase 2.
- **Forecaster:** Phase 3.
