# DriftLens unified architecture data model (SPEC-016)

> A file graph is not an architecture. This document describes the **unified data
> model** — one node/edge schema that holds code, declared architecture, docs and
> specs, with **provenance** on everything — and how the old code graph became one
> *projection* of it.

Defined in [`packages/engine/src/model/unified.ts`](../packages/engine/src/model/unified.ts).
Built by [`buildUnifiedGraph`](../packages/engine/src/graph/unified-builder.ts).

## Why

The Phase-1 engine produced a `GraphView` of files, symbols and imports. That is
enough to *draw* a dependency graph but not to answer "why is this component
here?", "who owns it?", "which ADR governs it?", or "what spec is building it?".
The unified model makes services, components, contracts, ADRs, specs and owners
first-class, and records — on every node and edge — a `source` so the UI can show
**where each piece of knowledge came from** (code vs YAML vs a doc vs a spec).

## Node kinds

| Kind | Source | Id form | Populated by |
|---|---|---|---|
| `module` | code | `module:<path>` | SPEC-016 |
| `class` | code | `class:<path>#<name>` | SPEC-016 |
| `function` | code | `function:<path>#<name>` | SPEC-016 |
| `symbol` | code | `symbol:<path>#<name>` | SPEC-016 |
| `external` | code | `external:<specifier>` | SPEC-016 |
| `service` | yaml | `service:<slug>` | SPEC-016 |
| `owner` | yaml | `owner:<slug>` | SPEC-016 |
| `component` | yaml/spec | `component:<slug>` | *reserved* (SPEC-019) |
| `contract` | code | `contract:<path>#<name>` | *reserved* (SPEC-023) |
| `adr` | doc | `adr:<slug>` | SPEC-018 |
| `spec` | spec | `spec:<slug>` | SPEC-019 |
| `document` | doc | `document:<path>` | SPEC-018 |

## Edge types

| Type | from → to | Source | Populated by |
|---|---|---|---|
| `imports` | module → module \| external | code | SPEC-016 |
| `contains` | module → class/function/symbol | code | SPEC-016 |
| `member_of` | module → service | yaml | SPEC-016 |
| `owns` | owner → service | yaml | SPEC-016 |
| `depends_on` | service → service (declared) | yaml | SPEC-016 |
| `implements` | class → contract | code | *reserved* (SPEC-023) |
| `decided_by` | service → adr | doc | SPEC-018 |
| `specified_by` | service → spec | spec | SPEC-019 |
| `contradicts` | code/spec → adr | doc/spec | *reserved* (SPEC-018/019) |
| `references` | document → any | doc | SPEC-018 |

Edge endpoints are named `from`/`to` (not `source`/`target`) so that `.source`
is a single, uniform **provenance** accessor on both nodes and edges.

## Provenance & content hashing

```ts
type SourceKind = "code" | "yaml" | "doc" | "spec";
interface Provenance { kind: SourceKind; path: string; line?: number; hash?: string; }
```

`hash` is an [FNV-1a](../packages/engine/src/util/hash.ts) fingerprint of the
source artifact at extraction time, used for change detection. It is **not**
cryptographic and deliberately dependency-free: the engine is bundled into the VS
Code webview by esbuild, so `node:crypto` is off-limits (see
[ADR 0002](adr/0002-engine-bundling.md)). The TypeScript parser stamps
`ParsedFile.contentHash`, which flows into node/edge provenance.

## IDs & determinism

Identity is **path/slug based**, not content-hash based — a refinement of the
spec's wording. A module's *identity* must survive edits (otherwise every
keystroke would reparent all of its edges and destroy diffing / time-travel);
the content hash describes the *revision* and lives in `source.hash`. Declared
nodes use `slug(name)` (lossy for names differing only in punctuation — a known,
low-stakes limitation).

`buildUnifiedGraph` finalizes by sorting nodes and edges by `id`, so a snapshot is
canonical and independent of input iteration order.

## Projections

```
ParserRegistry ─▶ buildUnifiedGraph ─┬─▶ projectCodeGraph ─▶ GraphView   (compat: webview, status bar)
   (+ contentHash)   (UnifiedGraph)   ├─▶ detectDriftUnified ─▶ DriftReport
                                      └─▶ createQuery ───────▶ GraphQuery  (MCP context tools, SPEC-020)
```

[`projectCodeGraph(unified)`](../packages/engine/src/graph/project.ts) reproduces
the exact legacy `GraphView` (file/symbol/external + import/contains), dropping
declared and doc/spec nodes. A golden test
([`tests/projection.test.ts`](../packages/engine/tests/projection.test.ts)) pins
`projectCodeGraph(buildUnifiedGraph(files)) ≡ CodeGraph.snapshot()` across a
battery including the sample repo — this is what makes the statement "`CodeGraph`
is one projection of the unified model" literally true and regression-proof.

## Drift on the unified model

Drift detection now runs natively on the unified model via
`detectDriftUnified(UnifiedGraph, config)` (reads `module` nodes + `imports`
edges; assigns files to services with the shared
[`firstMatchingService`](../packages/engine/src/drift/assign.ts)). The public
`detectDrift(GraphView, config)` is a thin adapter that lifts the legacy view and
delegates, so existing callers are unchanged. Output is **byte-identical** to the
old detector — pinned by
[`tests/drift-equivalence.test.ts`](../packages/engine/tests/drift-equivalence.test.ts)
(the SPEC-016 acceptance test).

## Query surface

[`createQuery(graph)`](../packages/engine/src/graph/query.ts) builds id/kind/path
indexes and adjacency once, then answers `node`, `nodesByKind`, `findByPath`,
`edgesOf`, `neighbors`, and `component(name)` (a service's context subgraph:
members, their symbols, internal imports, owner, declared dependencies). This is
the foundation the MCP server (SPEC-020) exposes as context tools.

## Extension points

Later specs add *builders* that merge their nodes/edges into the same
`UnifiedGraph` — the schema and query layer do not change:

- **SPEC-018** (docs, ✅): `document`/`adr` nodes, `references`/`decided_by`
  edges. Built by [`ingest/docs.ts`](../packages/engine/src/ingest/docs.ts).
- **SPEC-019** (specs, ✅): `spec` nodes, `specified_by` edges. Built by
  [`ingest/specs.ts`](../packages/engine/src/ingest/specs.ts). A spec is any
  `*.spec.md` file; it is `specified_by`-linked to every `service` it names
  (frontmatter `components:`/`services:`, or a Markdown link resolving to one of
  the service's files). The edge is `service → spec` until component-level nodes
  exist (SPEC-005 v2), mirroring SPEC-018's `service → adr`; the builder emits
  `component → spec` unchanged once they do. `createQuery.specsFor(service)`
  reads them back, and `component(name)` pulls the targeting specs into the
  context subgraph.
- **SPEC-023** (contracts): `contract` nodes, `implements` edges.

## Migration & compatibility

- `ParsedFile` gained an optional `contentHash` (additive; non-hashing parsers
  stay valid).
- `CodeGraph`, `GraphView`, `detectDrift`, `analyzeProject`, `parseConfig`,
  `resolveImport`, `matchGlob` keep their signatures.
- `analyzeProject` now also returns `unified: UnifiedGraph`.
- `UnifiedGraph.schemaVersion` is `1`; it will drive persistence migrations in
  SPEC-017.
