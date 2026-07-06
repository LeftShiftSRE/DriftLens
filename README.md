<h1 align="center">DriftLens</h1>

<p align="center">
  <b>See what your code is doing to your architecture — live, in the IDE, before it hits production.</b>
</p>

<p align="center">
  <a href="#status"><img alt="status" src="https://img.shields.io/badge/status-pre--alpha-orange"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
</p>

---

> ⚠️ **Status:** Pre-alpha, under active development. The engine (parser → graph →
> drift detector) is being built first; the VS Code extension is a thin shell on
> top of it. Not yet installable. Watch this repo for the first `.vsix` release.

## The problem

The architecture in your head and the architecture in your code drift apart
silently. AI coding agents make it dramatically worse: each agent works in a
*bubble* — it writes code for its narrow spec and never sees the wider system, or
what other agents are changing in parallel. Both diffs look fine in isolation.
Production breaks at merge time. Nobody saw it coming.

DriftLens is a **VS Code extension** that continuously extracts the *actual*
architecture from your code, renders it live as you save files, and warns you the
moment a change drifts from what your team declared — before it merges.

It is **not** another AI code generator. It's the observability + architecture +
collaboration layer that sits on top of whatever AI coding tool you already use.

## How it works

```
 file save ──▶ Parser ──▶ Graph Builder ──▶ Drift Detector ──▶ WebView
 (watcher)   (extract    (component graph,  (declared vs      (live diagram,
              imports,     incremental)      actual, health    drift in red)
              exports,                       score)
              defs)
```

Everything runs **locally by default** — no signup, no telemetry, no cloud
required. Determinism first: every feature works without an LLM.

## Repository layout

| Package | Status | What it is |
|---|---|---|
| [`packages/engine`](packages/engine) | ✅ working | Language-agnostic analysis engine: parser, graph builder, drift detector. Pure TypeScript, zero UI deps. Fully tested. |
| [`packages/extension`](packages/extension) | 🚧 scaffold | VS Code extension: file watcher, status bar, Cytoscape webview. |
| `packages/graph` | 🔜 planned | Persistence layer (SQLite + Kùzu). In-memory graph lives in the engine for now. |
| [`examples/sample-repo`](examples/sample-repo) | ✅ | A small three-service repo used for demos and tests. |
| [`docs`](docs) | ✅ | Architecture notes, the [`.driftlens.yml` spec](docs/driftlens-yml-spec.md), and [ADRs](docs/adr). |

Try the engine on the sample repo:

```bash
pnpm --filter @driftlens/engine build
node scripts/analyze-sample.mjs
# → Architecture Health: 50%, with one drift error and one warning
```

## Quickstart (developing on DriftLens)

```bash
# Requires Node >= 20 and pnpm >= 10
pnpm install
pnpm build       # build all packages
pnpm test        # run the test suite
pnpm typecheck   # type-check everything
```

Run just the engine's tests:

```bash
pnpm --filter @driftlens/engine test
```

## Roadmap

See [`PROJECT_PLAN.md`](PROJECT_PLAN.md) for the full roadmap and
[`PROJECT_FOUNDATION.md`](PROJECT_FOUNDATION.md) for the why.

- **Phase 1 (now):** Live architecture visualizer + drift detector (TS, then Python).
- **Phase 2:** AI bubble detection + team awareness.
- **Phase 3:** SRE reliability forecaster on PRs.
- **Phase 4:** Multi-language, integrations, public launch.

## Contributing

DriftLens is OSS-first — every commit and decision is public. See
[CONTRIBUTING.md](CONTRIBUTING.md). Good first contribution surfaces: language
parsers, drift rules, and diagram UX.

## License

[Apache 2.0](LICENSE).
