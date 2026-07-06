# DriftLens — Development Log

> A running record of what has been built, the architectural challenges hit along
> the way, the decisions made, and the full feature roadmap.
>
> **Last updated:** 2026-07-06 · **Current milestone:** Phase 1 MVP (engine + extension)

---

## 1. Where the project stands today

The **deterministic core is working end-to-end** and the **VS Code extension is
functional** (builds, typechecks, launches via F5). You can point it at a
TypeScript/JavaScript repo and see a live architecture diagram where components
are colored by service and **anything that has drifted from the declared
architecture is highlighted with a red overlay painted on top of the
component** — exactly the "one color for the component, another color overlapping
it for the drift" model.

| Layer | Status | Notes |
|---|---|---|
| Analysis engine (`@driftlens/engine`) | ✅ **Working, 33 tests passing** | Parser → graph → drift detector, pure TS, no UI/AI. |
| `.driftlens.yml` config + spec | ✅ Working | Schema, validated loader, documented spec. |
| Drift detection + health score | ✅ Working | Undeclared deps, unused deps, unassigned files, 0–100 score. |
| VS Code extension | ✅ Builds + typechecks | File watcher, status bar, command, webview. Not yet run in CI-headless. |
| Cytoscape diagram + drift overlay | ✅ Implemented | Component color + red drift overlay + red drift edges. |
| Sample repo + runnable demo | ✅ Working | `node scripts/analyze-sample.mjs` → 50% health, 1 error, 1 warning. |
| Persistence (SQLite + Kùzu) | 🔜 Planned | In-memory for now; extract to `packages/graph` next. |
| Python parser | 🔜 Planned | Interface is ready; drop-in per ADR 0001. |
| Team awareness / AI-bubble (Pillar 3) | ⛔ Not started | Phase 2. |
| SRE forecaster (Pillar 4) | ⛔ Not started | Phase 3. |

**Verification performed:**
- `pnpm -r test` → 33/33 engine tests pass.
- `pnpm -r typecheck` → both packages clean.
- `pnpm --filter driftlens build` → extension + webview bundles produced.
- `node scripts/analyze-sample.mjs` → correct drift report on real files on disk.

What has **not** been verified: running inside the actual VS Code Extension
Development Host (requires a GUI VS Code session — press **F5** with this folder
open; a launch config is provided). The bundles compile and the webview/host
message contract typechecks, but live rendering should be eyeballed by a human.

---

## 2. Progress by build step

### Phase 0 — Foundation (agent-driven parts): ✅ done
- pnpm monorepo (`packages/*`), shared `tsconfig.base.json`, `.npmrc`.
- README, CONTRIBUTING, Apache-2.0 LICENSE.
- GitHub CI (`.github/workflows/ci.yml`: typecheck, lint, test, build on Node 20/22).
- Issue + PR templates.
- `.gitignore` excludes `node_modules/`, `dist/`, `*.vsix`, coverage, etc.
- Deferred (human-only): GitHub org, domains, Discord/social, design-partner recruiting.

### Phase 1 — Engine: ✅ done and tested
- **Normalized model** (`model.ts`): `ParsedFile` / `ImportRef` / `ExportRef` /
  `Definition` + the `LanguageParser` interface every parser implements.
- **TypeScript parser** (`parser/typescript.ts`): extracts imports (named,
  default, namespace, type-only), exports (incl. re-exports as import edges),
  and definitions (class/method/function/interface/enum/type/variable) via the
  TypeScript compiler API. Handles `.ts/.tsx/.js/.jsx/.mts/...`.
- **Parser registry** (`parser/registry.ts`): routes files to parsers by extension.
- **Graph builder** (`graph/`): `CodeGraph` builds file/symbol/external nodes and
  import/contains edges; module resolution for relative/extensionless/index/`.js`
  specifiers; incremental `setFile`/`removeFile`.
- **Drift detector** (`drift/`): `.driftlens.yml` schema + loader, dependency-free
  glob matcher, and `detectDrift` producing events + health score + per-file
  service map + violating edges.
- **`analyzeProject`**: one-shot convenience over the whole pipeline.

### Phase 1 — Extension: ✅ implemented
- `controller.ts`: owns the live `CodeGraph`, loads `.driftlens.yml`, recomputes
  drift, emits change events. Incremental on file save.
- `extension.ts`: activation, status bar ("Architecture Health: NN%"), commands
  (`Show Architecture`, `Refresh Analysis`), debounced file watcher.
- `panel.ts`: webview lifecycle, CSP-locked HTML, host↔webview messaging,
  click-node-to-open-file.
- `webview/main.ts`: Cytoscape rendering, per-service colors, **drift overlay**.

---

## 3. Architectural challenges & how they were resolved

### 3.1 exFAT filesystem: no symlinks, no hardlinks
**Problem:** The repo lives on an `E:` exFAT drive. pnpm's default store uses
symlinks; workspace (`workspace:*`) dependencies are directory symlinks. Install
failed with `EISDIR` twice — first for the store, then for the engine→extension
workspace link.

**Resolution (two parts):**
1. `.npmrc` → `node-linker=hoisted`, `package-import-method=copy` (copy packages
   instead of linking them).
2. The extension does **not** node-link the engine. esbuild bundles it anyway, so
   `@driftlens/engine` is resolved via an esbuild `alias` + tsconfig `paths`
   pointing at engine source. Documented in **ADR 0002**.

**Trade-off:** the engine alias is duplicated in two config files; revisit if we
publish the engine to npm or move to a symlink-capable filesystem.

### 3.2 Parser: tree-sitter vs the TypeScript compiler API
**Problem:** The plan specifies tree-sitter, but `node-tree-sitter` needs native
builds that are fragile on Windows / non-standard filesystems, and Phase 1 is
TS-first.

**Resolution:** Implement the first parser on the **TypeScript compiler API**
(ships with the toolchain, zero native build, first-party accuracy) behind a
language-agnostic `LanguageParser` interface. Tree-sitter (via WASM) remains the
plan for Python/Go, implementing the same interface. Documented in **ADR 0001**.
The whole pipeline downstream only sees the normalized `ParsedFile`, so a new
language lights up graph + drift for free.

### 3.3 ESM / module resolution across Node, tests, and the bundler
**Problem:** Three consumers with different resolvers — Node (needs `.js`
extensions for NodeNext ESM), Vitest/Vite, and esbuild.

**Resolution:** Engine uses `NodeNext` with explicit `.js` import specifiers
(correct for Node ESM; Vite and esbuild both resolve `.js`→`.ts`). The built
`dist` runs in pure Node — verified with a standalone ESM smoke test. The
extension typechecks under `Bundler` resolution (esbuild owns emit, `noEmit` on).

### 3.4 Incremental analysis without stale graphs
**Problem:** Re-parsing an entire repo on every keystroke/save is too slow; but a
naive incremental graph can go stale (e.g. an import target appears/disappears).

**Resolution:** Incrementality lives at the **parse layer** (the expensive step):
`CodeGraph.setFile`/`removeFile` swap one file's parsed data. Graph *assembly*
(`snapshot()`) is cheap and recomputed fresh each time, so edges are always
consistent with the current file set. File events are debounced (150 ms).

### 3.5 Representing "drift" visually on the component itself
**Problem:** Red edges alone don't answer "which *component* has a problem?" The
requested UX is a drift color **overlapping** the component's own color.

**Resolution:** Cytoscape's `overlay-color`/`overlay-opacity` paints a
translucent layer *on top of* a node without replacing its fill. Nodes keep their
service color; drift **origin** components get a red overlay + red border, drift
**affected** components (the thing illegally imported) get an amber overlay.
Violating import edges are also drawn red. See §5.

### 3.6 Extension bundle size
**Observation (not yet resolved):** `dist/extension.js` is ~3.5 MB because the TS
compiler is bundled in (the engine depends on it for parsing). Acceptable for a
single-file VSIX now; a future option is to lazy-load or mark `typescript`
external and ship it as a runtime dependency. Tracked as a known limitation.

---

## 4. Comprehensive feature list

Legend: ✅ implemented · 🟡 partial · 🔜 planned (roadmap) · 💡 idea/backlog

### Pillar 1 — Live architecture visualizer
- ✅ Auto-extract component graph from TS/JS source (imports, exports, defs).
- ✅ File-level dependency graph with resolved relative imports.
- ✅ External-dependency nodes (npm packages) distinguished visually.
- ✅ Symbol-level nodes captured in the model (exported classes/functions/…).
- ✅ Interactive Cytoscape diagram (zoom, pan, `cose` layout).
- ✅ Click a node → open that file in the editor.
- ✅ Live update on file save (debounced, incremental).
- ✅ Status-bar "Architecture Health: NN%".
- 🟡 Component coloring by service (done); grouping/compound nodes per service (💡).
- 🔜 Filter by team/service, search, focus-a-subgraph.
- 🔜 Time-travel through git history.
- 💡 C4-style hierarchical zoom (context → container → component → code).
- 💡 Export diagram as SVG/PNG.

### Pillar 2 — Architecture drift detector
- ✅ `.driftlens.yml` schema + validated loader + published spec.
- ✅ Assign files to services via glob patterns.
- ✅ Detect **undeclared cross-service dependencies** (error).
- ✅ Detect **declared-but-unused dependencies** (warning).
- ✅ Detect **unassigned files** (info).
- ✅ Architecture **health score** (edge-compliance based, 0–100).
- ✅ **Drift overlay** on components + red drift edges in the diagram.
- 🔜 Drift as VS Code Diagnostics (squiggles in the Problems panel).
- 🔜 Read declared architecture from ADRs, not just `.driftlens.yml`.
- 🔜 Layering rules (e.g. "ui may not import infra"), allow/deny direction.
- 🔜 Health-score history / trend over time.
- 💡 Auto-suggest a `.driftlens.yml` from the current code (`driftlens init`).
- 💡 Per-PR drift diff as a GitHub Action / PR comment.

### Pillar 3 — AI bubble detection & team awareness (Phase 2)
- 🔜 Contract detection (exported interfaces, API routes, RPC signatures).
- 🔜 "This change to `X.foo()` affects N callers" on save.
- 🔜 Local teammate awareness from `git log` (who touched related code recently).
- 🔜 File-level activity heatmap.
- 🔜 Optional self-hostable WebSocket team-sync service + Docker image.
- 💡 Real-time "Marcus is editing CheckoutService right now" presence.

### Pillar 4 — SRE / reliability forecaster (Phase 3)
- 🔜 Static latency/cost forecasting for changed code paths (p50/p95/p99).
- 🔜 SLI/SLO integration; "within budget / 60% consumed" PR comments.
- 🔜 Blast-radius analysis (downstream services + user flows affected).
- 💡 Local prod-mirror (kind/k3d) replaying anonymized traffic.

### Supporting layer — project knowledge graph
- ✅ In-memory graph (nodes: file/symbol/external; edges: import/contains).
- 🔜 Persistence: SQLite + Kùzu embedded graph DB (`packages/graph`).
- 🔜 Queryable subgraph API for LLM tools (token-efficient context).
- 💡 GraphRAG-style community detection for large repos.

### Platform / DX
- ✅ pnpm monorepo, CI, tests, ADRs, sample repo, F5 launch config.
- ✅ Pluggable parser architecture (add a language = implement one interface).
- 🔜 Golden-file parser fixtures per language.
- 🔜 `.vsix` packaging + Marketplace publish pipeline.
- 🔜 Multi-root workspace support (today: first workspace folder).

---

## 5. The visualization model (what you asked for)

```
   ┌─────────────┐        import (allowed)        ┌─────────────┐
   │  checkout   │ ─────────────────────────────▶ │    user     │
   │  (blue =    │                                 │  (green =   │
   │   service)  │ ═══ import (DRIFT) ═══════════▶ │   service)  │
   └─────────────┘         red edge                └─────────────┘
        ▲ ▲                                              
        │ └── red translucent OVERLAY + red border       ┌─────────────┐
        │     painted on top of the blue node            │  payments   │
        │     = "this component has drifted"             │  (amber     │
        └──────────────────────────────────────────────▶ │  overlay =  │
                                                          │  affected)  │
                                                          └─────────────┘
```

- **Component color = service** (deterministic per service name).
- **Drift origin** (the component doing a disallowed import): keeps its color,
  gets a **red overlay + red border** on top.
- **Drift affected** (the component being illegally imported): **amber overlay**.
- **Drift edge**: the offending import is drawn as a thick red arrow.
- Header shows **Architecture Health: NN%** and error/warning counts; the status
  bar mirrors it.

Implementation: `packages/extension/src/webview/main.ts` (Cytoscape styles keyed
on `node[drift="origin"|"affected"]` and `edge[drift="true"]`).

---

## 6. How to run it

```bash
# From the repo root (Node >= 20, pnpm >= 10)
pnpm install
pnpm -r test          # 33 engine tests
pnpm -r typecheck

# See a drift report on the sample repo (no VS Code needed):
pnpm --filter @driftlens/engine build
node scripts/analyze-sample.mjs
#   → Architecture Health: 50%
#     ✗ [error]  "checkout" imports "payments" but does not declare it...
#     ! [warning] "payments" declares a dependency on "user" that is never used.

# Run the actual extension:
#   1. Open this folder in VS Code.
#   2. Press F5 ("Run DriftLens Extension (sample-repo)").
#   3. In the new window: Command Palette → "DriftLens: Show Architecture".
```

---

## 7. Known limitations / next up

1. **Extension not yet exercised in a live Extension Host** — needs a human F5
   pass (no GUI in the build environment).
2. **Bundle size** ~3.5 MB (bundled TS compiler) — see §3.6.
3. **Single workspace folder** only; multi-root is planned.
4. **Import resolution** handles relative/index/`.js` but not `tsconfig` path
   aliases or `node_modules` deep resolution yet.
5. **No persistence** — graph is rebuilt per session (fine at current scale).

**Immediate next tasks:** (a) human F5 smoke test + screenshot for the README/demo
GIF; (b) drift-as-Diagnostics so issues show in the Problems panel; (c) `driftlens
init` to scaffold `.driftlens.yml`; (d) Python parser via the existing interface.
