# DriftLens — Master Spec Sheet (Single Source of Truth)

> **Purpose:** This document is the canonical reference for *what* DriftLens is building. Every feature is broken into a discrete **Spec** with its goal, technical decisions, sub-tasks, dependencies, and acceptance criteria. Use this for spec-driven development: read the spec, make the decisions, ship the tasks.
>
> **Companion docs:**
> - `PROJECT_FOUNDATION.md` — the *why* (problem, users, positioning)
> - `PROJECT_PLAN.md` — the *when* (timeline, milestones, weekly cadence)
> - `DEVELOPMENT_LOG.md` — the *what happened* (running record)
>
> **Status legend:** ⛔ Not started · 🟡 In progress · ✅ Done · 🚫 Cancelled
> **Last updated:** 2026-07-06

---

## How to use this document

1. **Read top-down on first pass** to understand the system.
2. **For each spec you tackle**, read the spec fully, decide the open technical questions, then work the sub-tasks in order.
3. **Each spec is independently shippable.** Don't let one spec block another unless the dependency is explicit.
4. **Status field is the contract.** When you start a spec, mark it 🟡. When you finish acceptance criteria, mark ✅. When you abandon, mark 🚫 with reason.

---

## Spec template (every spec follows this shape)

```
SPEC-NNN: <Title>
Component: <parser | graph | engine | extension | server | docs | community>
Phase: <1 | 2 | 3 | 4 | 5>
Goal: <one sentence>
Why: <the problem this solves>
Status: ⛔ | 🟡 | ✅ | 🚫

Technical decisions to make (decide BEFORE coding):
  - [ ] Decision 1
  - [ ] Decision 2

Sub-tasks (execute in order):
  1. ...
  2. ...

Depends on: [SPEC-XXX, ...]
Acceptance criteria:
  - [ ] ...
  - [ ] ...

Effort estimate: S (1-3 days) | M (1 week) | L (2 weeks) | XL (3+ weeks)
```

---

## Phase 1 — Foundation, Engine, Visualizer (MVP)

These specs produce the first credible demo and design-partner ship.

---

### ✅ SPEC-001: Monorepo & CI Setup
**Component:** infrastructure | **Phase:** 1 | **Status:** ✅ done
**Goal:** Working pnpm monorepo with CI on Node 20/22, lint, test, build.
**Why:** Single repo, shared types, no copy-paste.

**Sub-tasks:** pnpm workspaces, shared `tsconfig.base.json`, GitHub Actions CI workflow, `.npmrc`, `.gitignore`, Apache-2.0 LICENSE.
**Depends on:** none
**Acceptance:** `pnpm install && pnpm -r test && pnpm -r build` succeeds on a fresh clone.

---

### ✅ SPEC-002: TypeScript Parser
**Component:** parser | **Phase:** 1 | **Status:** ✅ done (see ADR 0001)
**Goal:** Parse `.ts/.tsx/.js/.jsx/.mts/.cts` and emit normalized `ParsedFile`.
**Why:** Code is the primary evidence source.

**Technical decisions made:**
- Use TS compiler API over tree-sitter (zero native build, first-party accuracy).
- Parser implements a `LanguageParser` interface so future languages drop in.

**Acceptance:** Extracts imports (named/default/namespace/type-only), exports (incl. re-exports), and definitions (class/method/function/interface/enum/type/variable).

---

### ✅ SPEC-003: Module Resolver
**Component:** graph | **Phase:** 1 | **Status:** ✅ done (partial)
**Goal:** Resolve relative, extensionless, and `.js`-suffixed imports to actual files.
**Why:** Without resolution, the graph has dangling edges.

**Technical decisions to make before SPEC-006:**
- [ ] Should we resolve `tsconfig.json` `paths` aliases? *(v1.1)*
- [ ] Should we walk `node_modules` for package entry points? *(v2)*
- [ ] Monorepo workspace protocol (`workspace:*`) support? *(v2)*

**Acceptance:** Relative imports across the sample repo resolve 100%.

---

### ✅ SPEC-004: In-Memory Code Graph
**Component:** graph | **Phase:** 1 | **Status:** ✅ done
**Goal:** `CodeGraph` with `setFile` / `removeFile` / `snapshot` over parsed files.
**Why:** Incremental updates + cheap assembly.

**Acceptance:** Snapshot of a 1k-file repo reconstructs in <100ms.

---

### ✅ SPEC-005: `.driftlens.yml` Schema
**Component:** engine | **Phase:** 1 | **Status:** ✅ done (v1)
**Goal:** Declared architecture as YAML: services, paths, owners, dependencies.
**Why:** Human intent, in version control.

**Technical decisions to make for v2:**
- [ ] Layered architecture (`layer: ui | service | repo`) with allow/deny direction.
- [ ] Component-level (vs service-level) declarations.
- [ ] Multiple config files for monorepos.

**Acceptance:** Schema validated; loader rejects malformed configs with helpful errors.

---

### ✅ SPEC-006: Drift Detection Engine
**Component:** engine | **Phase:** 1 | **Status:** ✅ done (v1)
**Goal:** Compare declared vs actual architecture; emit `DriftReport` + health score.
**Why:** The reason DriftLens exists.

**Technical decisions to make for v2 (CRITICAL — this is the gap):**
- [ ] Replace naïve `compliant / (compliant + violating)` score with weighted model: coupling × blast radius.
- [ ] Spec-vs-actual drift (component being built outside its declared service).
- [ ] Decision violations (changes contradicting an ADR).
- [ ] Trend over time (improving vs degrading).

**Acceptance:** Reports undeclared dependencies (error), unused declarations (warning), unassigned files (info).

---

### ✅ SPEC-007: VS Code Extension Shell
**Component:** extension | **Phase:** 1 | **Status:** ✅ done (skeleton)
**Goal:** Build, typecheck, launch via F5. Status bar + commands wired.
**Why:** Container for the UI.

**Acceptance:** F5 launches Extension Host; "Show Architecture" command opens a panel.

---

### ✅ SPEC-008: Cytoscape Diagram Renderer
**Component:** extension | **Phase:** 1 | **Status:** ✅ done
**Goal:** Live component graph in a WebView with zoom/pan/click-to-open.
**Why:** The "wow" moment for design partners.

**Technical decisions to make:**
- [x] Cytoscape.js (chosen) vs D3 vs React Flow.
- [ ] Performance: how many nodes before layout chokes? (>2k → switch to canvas / sigma.js)
- [ ] Compound nodes (services containing components)?

**Acceptance:** Renders 500-node graph in <2s; click opens file in editor.

---

### ✅ SPEC-009: Drift Overlay Visualization
**Component:** extension | **Phase:** 1 | **Status:** ✅ done
**Goal:** Component keeps its service color; drift **origin** gets red overlay + border, **affected** gets amber overlay; violating edges are red.
**Why:** Show drift *on the component*, not just edges.

**Acceptance:** Devs can identify a drifted component at a glance.

---

### ✅ SPEC-010: Status Bar Health Indicator
**Component:** extension | **Phase:** 1 | **Status:** ✅ done
**Goal:** Live "Architecture Health: NN%" in the status bar; click → open panel.
**Why:** Always-on signal without intrusiveness.

**Acceptance:** Updates within 1s of a file save.

---

### 🟡 SPEC-011: Sample Repo & Runnable Demo
**Component:** docs | **Phase:** 1 | **Status:** 🟡
**Goal:** `scripts/analyze-sample.mjs` produces a real drift report on a checked-in sample repo.
**Why:** Show, don't tell.

**Sub-tasks:**
- [x] Create sample repo with intentional drift
- [x] Write the analyze script
- [ ] Record a 2-minute demo GIF / video
- [ ] Add demo GIF to README

**Depends on:** SPEC-006
**Acceptance:** Running the script prints a clear drift report with at least one of each severity.

---

### ⛔ SPEC-012: VS Code Diagnostics Integration
**Component:** extension | **Phase:** 1 | **Status:** ⛔
**Goal:** Drift events appear as squiggles in the Problems panel.
**Why:** Engineers don't open the diagram every save; Problems panel they already use.

**Technical decisions to make:**
- [ ] Map drift events to file/line where possible (currently we know source file, not line).
- [ ] Severity mapping (error/warning → Error/Warning diagnostics).

**Sub-tasks:**
1. Convert `DriftReport` events to `vscode.Diagnostic[]`
2. Wire to `languages.createDiagnosticCollection`
3. Test on sample repo

**Depends on:** SPEC-006, SPEC-007
**Acceptance:** Saving a file with a new illegal import produces a Problem-panel squiggle.
**Effort:** S

---

### ⛔ SPEC-013: Refined Health Score
**Component:** engine | **Phase:** 1 | **Status:** ⛔ (replaces naïve score in SPEC-006)
**Goal:** Replace naïve score with weighted model.
**Why:** Current score is gameable and ignores severity.

**Technical decisions to make:**
- [ ] Weighting formula: `score = 100 - Σ(violation_weight × blast_radius) / normalized_factor`
- [ ] What counts as "blast radius"? (number of downstream services, number of public symbols affected)
- [ ] Should trend matter? (improving by 5pts ≠ degrading by 5pts)
- [ ] Should spec-vs-actual and decision violations be in the score, or surfaced separately?

**Sub-tasks:**
1. Define weighting formula with test cases
2. Compute blast radius from dependency graph
3. Add trend tracking (last 30 days)
4. Add tests against hand-labeled scenarios

**Depends on:** SPEC-006, SPEC-020 (blast radius)
**Acceptance:** Score on the sample repo changes when blast radius changes; trend visible in UI.
**Effort:** M

---

### ⛔ SPEC-014: Performance & Bundle Size Optimization
**Component:** infrastructure | **Phase:** 1 | **Status:** ⛔
**Goal:** Extension bundle <2MB; analysis <5s on 5k-file repo.
**Why:** VS Code flags >2MB extensions on activation; current is 3.5MB.

**Technical decisions to make:**
- [ ] Move `typescript` out of bundle (mark external; ship as runtime dep).
- [ ] Move heavy parsing to a Web Worker or separate process.
- [ ] Lazy-load Cytoscape only when panel opens.
- [ ] Tree-shake unused TS compiler APIs.

**Sub-tasks:**
1. Profile current bundle (`esbuild --analyze`)
2. Externalize `typescript`
3. Move parsing to a Web Worker
4. Verify on 5k-file sample repo

**Depends on:** SPEC-007, SPEC-008
**Acceptance:** Bundle <2MB; full analysis <5s on 5k-file repo.
**Effort:** M

---

### ⛔ SPEC-015: Multi-root Workspace Support
**Component:** extension | **Phase:** 1 | **Status:** ⛔
**Goal:** Handle multiple workspace folders; one `.driftlens.yml` per folder.
**Why:** Real engineers have monorepos and adjacent repos open.

**Technical decisions to make:**
- [ ] Per-folder CodeGraph or one merged graph?
- [ ] Cross-folder dependency edges (rare but possible)?

**Depends on:** SPEC-007
**Acceptance:** Opening a multi-root workspace renders all folders; per-folder health in status bar.
**Effort:** S

---

## Phase 1.5 — Context Ingestion (the missing primitive)

These specs make DriftLens a **context engine**, not just a visualizer. Skip these and the project is a fancy file-graph viewer.

---

### 🟡 SPEC-016: Unified Architecture Data Model
**Component:** engine | **Phase:** 1.5 | **Status:** 🟡 (in progress — code merged on `spec/016-unified-model`)
**Goal:** One node/edge schema supporting services, components, modules, classes, contracts, ADRs, specs, owners — with provenance.
**Why:** File graph ≠ architecture. Every node/edge has a `source` (code | yaml | doc | spec) so we can show where knowledge came from.

**Technical decisions (resolved for SPEC-016):**
- [x] **Node kinds:** `module`, `class`, `function`, `symbol`, `external`, `service`, `owner` are populated now. `component`, `contract`, `adr`, `spec`, `document` are reserved in the schema; builders for those land in SPEC-018/019/023.
- [x] **Edge types:** `imports`, `contains`, `member_of`, `owns`, `depends_on` are populated now. `implements`, `decided_by`, `specified_by`, `contradicts`, `references` are reserved for the later specs above.
- [x] **Provenance:** `source: { kind, path, line?, hash? }` on every node and edge; `hash` is an FNV-1a content fingerprint (not cryptographic; bundler-safe per ADR 0002).
- [x] **IDs:** path/slug based — identity must survive edits; the *revision* lives in `source.hash`. Declared-node ids go through a deterministic `slug(name)` (lossy for names differing only in punctuation; a known low-stakes limitation, documented in `docs/architecture-data-model.md`). This is a refinement of the spec's "content-hash for code-derived, slug for declared" — for code nodes we now use `module:<path>` so the identity is stable across edits and the hash stays in `source.hash`.
- [x] **Backward compatibility:** legacy `CodeGraph` / `GraphView` / `detectDrift(graph, config)` all keep their signatures. `CodeGraph.snapshot()` is one *projection* of the unified model (`projectCodeGraph`); `detectDrift(GraphView, …)` lifts into the unified graph and delegates to `detectDriftUnified`. A golden test (`tests/drift-equivalence.test.ts`) pins the unified detector to the exact legacy output byte-for-byte.
- [x] **Query surface:** `createQuery(graph)` indexes nodes by id/kind/path and edges in/out adjacency; exposes `node`, `nodesByKind`, `findByPath`, `edgesOf`, `neighbors`, and `component(name)` (the context subgraph foundation SPEC-020's MCP tools will expose).

**Sub-tasks (done on the branch):**
- [x] 1. Schema in `packages/engine/src/model/unified.ts`
- [x] 2. Builder in `packages/engine/src/graph/unified-builder.ts` (code + declared nodes/edges, deterministic, sorted)
- [x] 3. `projectCodeGraph` + `liftGraphView` in `packages/engine/src/graph/project.ts` (back-compat)
- [x] 4. `detectDriftUnified` in `packages/engine/src/drift/detector.ts`; legacy `detectDrift` becomes a thin adapter
- [x] 5. `createQuery` in `packages/engine/src/graph/query.ts` (MCP-ready surface)
- [x] 6. `analyzeProject` returns both `graph: GraphView` and `unified: UnifiedGraph`
- [x] 7. `ParsedFile.contentHash` (optional, additive) + TS parser stamps FNV-1a
- [x] 8. Tests: `hash.test.ts`, `unified-builder.test.ts`, `projection.test.ts` (golden), `drift-equivalence.test.ts` (golden), `query.test.ts`
- [x] 9. `docs/architecture-data-model.md` written
- [x] 10. `BRANCHING.md` written (companion to this spec sheet)

**Depends on:** SPEC-006
**Acceptance (must verify before closing the spec):**
- [x] Same drift events fire on the same code after migration (`drift-equivalence.test.ts` is the pinned proof)
- [x] New node types queryable (`createQuery.nodesByKind("service" | "owner")` works)
- [x] Legacy public API unchanged
- [x] `pnpm -r test` green; `pnpm -r typecheck` clean
- [x] `node scripts/analyze-sample.mjs` still produces the same drift report
**Effort:** L

---

### ⛔ SPEC-017: Persistence Layer (SQLite + Kùzu)
**Component:** graph | **Phase:** 1.5 | **Status:** ⛔
**Goal:** Persist the unified graph; queryable across sessions.
**Why:** Time-travel, large repos, shareable context.

**Technical decisions to make:**
- [ ] Kùzu vs Neo4j vs DuckDB with graph extension vs custom?
- [ ] Single DB per workspace or per service?
- [ ] Schema versioning for migrations.

**Sub-tasks:**
1. Pick the graph DB (benchmark 100k-node insert + traversal)
2. Define schema (mirrors unified model)
3. Implement `GraphStore` interface (in-memory + SQLite+Kùzu impls)
4. Add migration tooling

**Depends on:** SPEC-016
**Acceptance:** Persist a 10k-node graph; reload after restart; queries <50ms.
**Effort:** M

---

### ⛔ SPEC-018: Documentation Ingestion
**Component:** engine | **Phase:** 1.5 | **Status:** ⛔ (MISSING — high value)
**Goal:** Parse README, docs/, adr/; extract sections + link them to code nodes.
**Why:** Architecture intent lives in docs. Without this, DriftLens can't answer "why is this component here?"

**Technical decisions to make:**
- [ ] Markdown parser: unified/remark vs custom?
- [ ] Link extraction: `[text](./path)` → link doc section to file/symbol.
- [ ] ADR auto-detection: filename pattern (`adr/NNNN-*.md`) vs frontmatter vs both?
- [ ] Embedding strategy for semantic search: sentence-transformers local model, or LLM-on-demand only?

**Sub-tasks:**
1. Pick markdown parser; implement AST extraction
2. Extract sections, headings, links
3. Resolve file links to code nodes
4. Auto-detect ADRs by pattern
5. Build `Document` and `Decision` nodes
6. Add `decision_view` query to graph
7. Render dashed edges "ADR-007 → CheckoutService" in diagram

**Depends on:** SPEC-016, SPEC-017
**Acceptance:** Loading the sample repo produces `Document` nodes for README + `Decision` nodes for each ADR; diagram shows ADR→component edges.
**Effort:** L

---

### ⛔ SPEC-019: Spec Ingestion
**Component:** engine | **Phase:** 1.5 | **Status:** ⛔ (MISSING — high value)
**Goal:** Ingest specs (from `.spec/` folder or GitHub Issues) and link them to components being implemented.
**Why:** The whole "AI bubble" story is about specs colliding. Specs must be first-class.

**Technical decisions to make:**
- [ ] Spec format: `.spec/NNN-slug.md` with YAML frontmatter? Or just GitHub Issues API?
- [ ] How does a spec link to components? (Frontmatter field, or inferred from file paths?)
- [ ] Status tracking: proposed / in-progress / shipped / abandoned?

**Sub-tasks:**
1. Define `.spec.md` format with frontmatter (status, owner, components)
2. Implement parser
3. Build `Spec` nodes, link to `Component` nodes
4. Render in diagram: "Spec-047 → CheckoutFlow (in progress, Marcus)"

**Depends on:** SPEC-016
**Acceptance:** A spec that mentions `src/checkout/*` creates a `Spec → Component` edge; shown in diagram.
**Effort:** M

---

### ⛔ SPEC-020: MCP Server (Context API)
**Component:** server | **Phase:** 1.5 | **Status:** ⛔ (CRITICAL — the AI-era wedge)
**Goal:** Expose the graph as MCP (Model Context Protocol) tools so Cursor / Continue / Cody / Claude Code can query DriftLens as context.
**Why:** This is how DriftLens becomes the **context layer for the AI-coding ecosystem**, not just another IDE extension.

**Technical decisions to make:**
- [ ] MCP server runtime: stdio (subprocess) vs HTTP/SSE?
- [ ] Tool surface: which queries to expose first?
  - `query_component(name)` → subgraph + docs + specs + owners
  - `find_owners(file_or_symbol)` → ownership chain
  - `get_decision_history(component)` → ADRs + specs affecting this component
  - `find_drift(since)` → drift introduced since a commit/branch
  - `get_health()` → current architecture health + breakdown
- [ ] Token budgeting: cap response size, allow paging.
- [ ] Auth: local-only for v1 (stdio); remote in Phase 2.

**Sub-tasks:**
1. Pick MCP SDK (TypeScript: `@modelcontextprotocol/sdk`)
2. Implement server with stdio transport
3. Register tools listed above
4. Test from Cursor: configure MCP server, query "what's the architecture of checkout service?"
5. Measure token usage vs equivalent README query

**Depends on:** SPEC-016, SPEC-017
**Acceptance:** From Cursor, a query returns a structured subgraph using <2k tokens; the response includes doc context, ADRs, and owners.
**Effort:** M

---

### ⛔ SPEC-021: Decision View Renderer
**Component:** extension | **Phase:** 1.5 | **Status:** ⛔
**Goal:** Switch diagram view mode to show ADR → Component edges instead of (or alongside) import edges.
**Why:** Architecture decisions are first-class info; devs need to see "this is governed by ADR-007."

**Depends on:** SPEC-018, SPEC-008
**Acceptance:** Toggle in the diagram switches between Structural / Dependency / Decision / Temporal views.
**Effort:** S

---

### ⛔ SPEC-022: Temporal View Renderer
**Component:** extension | **Phase:** 1.5 | **Status:** ⛔
**Goal:** Time-travel slider: scrub through git history, watch architecture evolve.
**Why:** Drift doesn't happen at a moment; it accumulates. Visualizing this is the strongest "this tool earns its place" demo.

**Technical decisions to make:**
- [ ] How often to snapshot? (Per commit? Per day? Configurable?)
- [ ] Storage: same SQLite+Kùzu DB with timestamp columns?
- [ ] Performance: re-parse whole repo at every commit, or store deltas?

**Depends on:** SPEC-017, SPEC-018
**Acceptance:** Slider in diagram moves through last 100 commits; architecture visibly changes.
**Effort:** L

---

## Phase 2 — AI Bubble & Team Awareness

The differentiated value. These make DriftLens irreplaceable for AI-heavy teams.

---

### ⛔ SPEC-023: Contract Detection
**Component:** engine | **Phase:** 2 | **Status:** ⛔
**Goal:** Identify exported interfaces, API routes, RPC signatures as `Contract` nodes.
**Why:** Contracts are what AI agents break. Detecting them lets us warn on signature changes.

**Technical decisions to make:**
- [ ] TS: extract exported interfaces + type aliases + function signatures with `@public` JSDoc or `export` keyword?
- [ ] HTTP routes: detect Express/Fastify/Hono route declarations?
- [ ] RPC: detect tRPC/protobuf/gRPC definitions?
- [ ] Versioning: how to detect breaking vs non-breaking changes (compatible signature additions)?

**Depends on:** SPEC-016, SPEC-002
**Acceptance:** Every public interface in the sample repo is a `Contract` node; modifying it is detected as a contract change.
**Effort:** L

---

### ⛔ SPEC-024: AI Bubble Detection
**Component:** engine | **Phase:** 2 | **Status:** ⛔ (THE KILLER FEATURE)
**Goal:** On file save, find all callers of changed contracts; warn: *"This change to `UserService.getById` affects 7 callers."*
**Why:** The AI-agent-bubble problem is the #1 new engineering pain since 2024. DriftLens is uniquely positioned to solve it.

**Technical decisions to make:**
- [ ] Live: file-watcher trigger, or manual on save?
- [ ] Threshold: warn only if >N callers? Or always?
- [ ] Severity: which changes are high-risk? (return type changes > param additions, etc.)
- [ ] Action: warning only, or also offer to open all callers?

**Sub-tasks:**
1. Index callers per contract during graph build
2. On save, diff changed contracts
3. For each changed contract, query call sites
4. Emit warning via VS Code Diagnostics + pop-up
5. Test on sample: change one signature, verify 7 warnings

**Depends on:** SPEC-023
**Acceptance:** Changing `UserService.getById` signature produces a "7 callers affected" warning in the editor.
**Effort:** M

---

### ⛔ SPEC-025: Local Teammate Awareness
**Component:** engine | **Phase:** 2 | **Status:** ⛔
**Goal:** From `git log` + branch state, infer what teammates are working on and surface related changes.
**Why:** "Marcus pushed to CheckoutService 2h ago" — you should know before you start editing.

**Technical decisions to make:**
- [ ] Time window: last 24h? Configurable?
- [ ] Source: `git log --since` on the same repo, or fetch from remote?
- [ ] Privacy: only show what's already on the remote? (Local-only commits = nobody's business.)

**Depends on:** none (uses git CLI)
**Acceptance:** Sidebar shows "Recent teammate activity in components you depend on."
**Effort:** S

---

### ⛔ SPEC-026: Team Sync Service (Optional Self-Hostable)
**Component:** server | **Phase:** 2 | **Status:** ⛔
**Goal:** Optional WebSocket service for real-time team-wide drift events and presence.
**Why:** When local-only awareness isn't enough.

**Technical decisions to make:**
- [ ] Self-host via Docker image vs managed SaaS vs both?
- [ ] Auth: GitHub OAuth (read repo scope)?
- [ ] Data minimization: send drift events only, not full graph?
- [ ] P2P alternative? (Hard. Defer.)

**Depends on:** SPEC-024
**Acceptance:** Spinning up the Docker image; two VS Code instances see each other's drift events in real time.
**Effort:** L

---

### ⛔ SPEC-027: Spec Collision Detection
**Component:** engine | **Phase:** 2 | **Status:** ⛔
**Goal:** Two specs touching the same component are flagged for the team.
**Why:** The "developer A and developer B both editing related components" pain, made explicit.

**Technical decisions to make:**
- [ ] Detection: simple file-path intersection between specs, or semantic via embedding similarity?

**Depends on:** SPEC-019, SPEC-024
**Acceptance:** Two specs both targeting `src/checkout/*` produce a "spec collision" warning for both owners.
**Effort:** M

---

## Phase 3 — SRE / Reliability Forecaster

This is the "left shift SRE" positioning. Pivots the project from "architecture tool" to "reliability platform."

---

### ⛔ SPEC-028: Static Latency Forecaster
**Component:** engine | **Phase:** 3 | **Status:** ⛔
**Goal:** For a code change, forecast p50/p95/p99 latency impact on the affected request path.
**Why:** Catch perf regressions in PR, not in prod.

**Technical decisions to make:**
- [ ] Model source: trained on OpenTelemetry traces, or heuristic (call depth × known I/O costs)?
- [ ] Calibration: needs ground truth; how to bootstrap?
- [ ] Granularity: per-endpoint or per-call-site?
- [ ] Validation: holdout test set of real PRs with measured latency delta?

**Sub-tasks:**
1. Define heuristic model (call depth, sync vs async, I/O type)
2. Train on synthetic + open-source traces
3. Build forecaster that takes (changed_call_site, baseline_metrics) → predicted_latency_delta
4. Generate PR comment text

**Depends on:** SPEC-023
**Acceptance:** PR comment: "This change forecasts p99 +45ms on /checkout, SLO 400ms (within budget)."
**Effort:** XL

---

### ⛔ SPEC-029: SLI/SLO Integration
**Component:** engine | **Phase:** 3 | **Status:** ⛔
**Goal:** Read SLO definitions; compare forecast vs SLO; surface budget burn.
**Why:** SLIs/SLOs are how reliability is measured. DriftLens should speak that language.

**Technical decisions to make:**
- [ ] SLO source: `.driftlens.yml` extension, Prometheus rules, Datadog monitors, all three?
- [ ] Multi-window burn rates (Google SRE workbook style) or simple comparison?

**Depends on:** SPEC-028
**Acceptance:** Forecast breaches SLO → error diagnostic in PR; within budget but high burn → warning.
**Effort:** M

---

### ⛔ SPEC-030: Cost Forecaster
**Component:** engine | **Phase:** 3 | **Status:** ⛔
**Goal:** Estimate $/month impact at projected traffic for a code change.
**Why:** Engineers don't see the AWS bill. DriftLens puts cost in the dev loop.

**Technical decisions to make:**
- [ ] Cost model: heuristic (compute × time × traffic × $/lambda-second), or actual cloud-pricing API?
- [ ] Traffic source: configurable per environment.

**Depends on:** SPEC-028
**Acceptance:** PR comment: "This change increases projected cost by $340/mo at current traffic."
**Effort:** M

---

### ⛔ SPEC-031: Blast Radius Analyzer
**Component:** engine | **Phase:** 3 | **Status:** ⛔
**Goal:** For a change, identify downstream services and user flows affected if it breaks.
**Why:** "If this service degrades, 14 callers and 3 user flows are affected."

**Technical decisions to make:**
- [ ] User flows source: inferred from routes + tests? Or declared in `.driftlens.yml`?

**Depends on:** SPEC-023
**Acceptance:** Blast radius on sample repo: change one function → correctly identifies all callers and entry points.
**Effort:** M

---

### ⛔ SPEC-032: Local Prod-Mirror (kind/k3d)
**Component:** server | **Phase:** 3 | **Status:** ⛔
**Goal:** Optional local prod-like cluster for actual load testing.
**Why:** Forecasts are estimates; actual load is truth.

**Technical decisions to make:**
- [ ] kind vs k3d vs Docker Compose?
- [ ] Traffic replay: anonymized real prod traffic, or synthetic?
- [ ] Auto-cleanup on extension deactivate?

**Depends on:** SPEC-028
**Acceptance:** Run command `DriftLens: Run Load Test on /checkout` → local cluster spins up → replays traffic → measures actual p99.
**Effort:** XL

---

### ⛔ SPEC-033: PR Comment Integration (GitHub Action)
**Component:** server | **Phase:** 3 | **Status:** ⛔
**Goal:** GitHub Action that runs DriftLens on PR diff and posts comments.
**Why:** Reach engineers outside the IDE; widen distribution.

**Depends on:** SPEC-028, SPEC-029, SPEC-030, SPEC-031
**Acceptance:** Opening a PR on the sample repo triggers a DriftLens comment with health delta + forecasts.
**Effort:** M

---

## Phase 4 — Multi-language & Community

Make DriftLens universal.

---

### ⛔ SPEC-034: Python Parser
**Component:** parser | **Phase:** 4 | **Status:** ⛔
**Goal:** Parse `.py/.pyi`; emit normalized `ParsedFile`.
**Why:** Half the data/ML world.

**Technical decisions to make:**
- [ ] tree-sitter (WASM) vs ast module from stdlib vs libCST?
- [ ] Handle dynamic imports (`__import__`, `importlib`)?

**Depends on:** SPEC-002 (interface already exists)
**Acceptance:** Sample Python repo parses + graph builds + drift detection works.
**Effort:** M

---

### ⛔ SPEC-035: Go Parser
**Component:** parser | **Phase:** 4 | **Status:** ⛔
**Goal:** Parse `.go`; emit normalized `ParsedFile`.
**Why:** Backend services, infra code.

**Depends on:** SPEC-002
**Effort:** M

---

### ⛔ SPEC-036: Plugin Architecture for Community Parsers
**Component:** engine | **Phase:** 4 | **Status:** ⛔
**Goal:** `LanguageParser` interface discoverable via npm package convention; community can ship parsers.
**Why:** Don't bottleneck on core team.

**Depends on:** SPEC-002, SPEC-034, SPEC-035
**Acceptance:** A third-party `@driftlens/parser-rust` package is loaded automatically when `.rs` files exist.
**Effort:** M

---

### ⛔ SPEC-037: AI Coding Tool Integrations
**Component:** server | **Phase:** 4 | **Status:** ⛔
**Goal:** Beyond MCP, ship native integrations / docs for Cursor / Continue / Cody / Claude Code.
**Why:** Distribution.

**Depends on:** SPEC-020
**Acceptance:** Setup docs for each tool; demo videos.
**Effort:** M

---

## Phase 5 — Public Launch

---

### ⛔ SPEC-038: Public Launch
**Component:** community | **Phase:** 5 | **Status:** ⛔
**Goal:** Show HN post, 1k stars, 100 weekly active users, 10 external contributors.
**Why:** The project is real only when others use it.

**Sub-tasks:**
1. Polish README + landing page
2. Record demo video (under 3 minutes)
3. Write launch blog post
4. Submit talks (KubeCon, SREcon, StrangeLoop)
5. Reach out to 10 developer influencers
6. "Show HN" post

**Depends on:** SPEC-001 through SPEC-022 minimum
**Effort:** L (effort = coordination, not code)

---

## Cross-cutting decisions (decide once, apply everywhere)

These come up in multiple specs. Decide them early.

### CD-001: Local-first vs cloud-first
**Decision:** Local-first. Engine + extension run entirely on the user's machine. Optional self-hostable services (team sync, MCP server) come later.
**Rationale:** Privacy, latency, zero-friction install, no vendor lock-in.

### CD-002: LLM usage policy
**Decision:** Minimal & optional. Every feature works deterministically. LLM is used only for:
- Natural-language summaries (Spec → 1-paragraph summary)
- Drift explanation ("here's why this might matter")
- SLO recommendations
Users can plug in any LLM (Anthropic, OpenAI, Ollama local) or use none.

### CD-003: Open source license
**Decision:** Apache 2.0.

### CD-004: Backward compatibility
**Decision:** `.driftlens.yml` schema versions are honored. Loader rejects unknown future versions with clear errors. No silent migrations.

### CD-005: Telemetry
**Decision:** Opt-in only. No data leaves the user's machine without explicit consent. Default: zero telemetry.

---

## Dependency graph (high level)

```
SPEC-001 (monorepo)
  └─ SPEC-002 (TS parser)
       └─ SPEC-003 (resolver)
            └─ SPEC-004 (in-mem graph)
                 ├─ SPEC-005 (config)
                 │    └─ SPEC-006 (drift detection v1)
                 │         ├─ SPEC-013 (refined score)
                 │         └─ SPEC-016 (unified model) ←── CRITICAL PATH
                 │              ├─ SPEC-017 (persistence)
                 │              │    └─ SPEC-022 (temporal view)
                 │              ├─ SPEC-018 (doc ingestion) ←── MISSING
                 │              ├─ SPEC-019 (spec ingestion) ←── MISSING
                 │              ├─ SPEC-020 (MCP server) ←── AI-ERA WEDGE
                 │              └─ SPEC-023 (contract detection)
                 │                   ├─ SPEC-024 (AI bubble)
                 │                   │    └─ SPEC-026 (team sync)
                 │                   ├─ SPEC-028 (latency forecaster)
                 │                   │    └─ SPEC-029 (SLO)
                 │                   ├─ SPEC-030 (cost forecaster)
                 │                   └─ SPEC-031 (blast radius)
                 ├─ SPEC-007 (extension shell)
                 │    ├─ SPEC-008 (cytoscape)
                 │    │    └─ SPEC-021 (decision view)
                 │    ├─ SPEC-009 (drift overlay)
                 │    ├─ SPEC-010 (status bar)
                 │    ├─ SPEC-012 (diagnostics)
                 │    └─ SPEC-015 (multi-root)
                 └─ SPEC-014 (perf)
SPEC-011 (sample repo & demo) — runs alongside everything

Phase 4 specs branch from SPEC-002 (parser interface).
SPEC-033 (PR comments), SPEC-032 (prod mirror), SPEC-025 (local team awareness) branch from respective earlier deps.
SPEC-038 (launch) is last.
```

---

## Critical path (the 6 specs to ship before anything else)

If you only finish 6 things, make them these:

| # | Spec | Why critical |
|---|---|---|
| 1 | **SPEC-016** Unified Architecture Data Model | Refactor base; everything downstream builds on this |
| 2 | **SPEC-018** Documentation Ingestion | The missing primitive; without it, DriftLens is just a file-graph viewer |
| 3 | **SPEC-019** Spec Ingestion | The AI-bubble story can't exist without specs as nodes |
| 4 | **SPEC-020** MCP Server | The AI-era wedge; turns DriftLens into ecosystem infrastructure |
| 5 | **SPEC-013** Refined Health Score | Honest measurement replaces the naïve score |
| 6 | **SPEC-011** Sample Repo & Demo GIF | Without this, nobody can see what you've built |

**Recommended execution order:** 016 → 018 → 019 → 020 → 013 → 011.

---

## Open questions (need answers before coding)

1. **Should SPEC-016 be a refactor or a fresh module?** — Recommendation: fresh module in `packages/engine/src/model/unified.ts`, keep `CodeGraph` as a projection for backward compat.
2. **MCP server: ship as separate npm package or embedded in extension?** — Recommendation: separate package `packages/mcp-server` so it can be invoked independently.
3. **Spec format: define our own `.spec.md` or ingest GitHub Issues via API?** — Recommendation: both. `.spec.md` for offline/local-first, Issues for online teams.
4. **Doc ingestion: do we need embeddings, or just structural extraction?** — Recommendation: start structural only. Embeddings if/when needed for semantic search.

---

*End of Master Spec Sheet. Total: 38 specs, organized into 5 phases. Critical path: 6 specs.*