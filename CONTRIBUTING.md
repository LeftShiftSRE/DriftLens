# Contributing to DriftLens

Thanks for your interest! DriftLens is OSS-first: every commit, decision, and
discussion is public. This guide gets you productive fast.

## Ground rules

- **Deterministic before AI.** Every feature must work without an LLM. LLM
  integration is optional gravy, never the foundation.
- **Local-first.** No feature may require a signup, a cloud account, or telemetry
  to deliver its core value.
- **Tests are not optional.** New engine behavior ships with tests (golden files
  where practical).

## Prerequisites

- Node.js >= 20
- pnpm >= 10 (`npm install -g pnpm`)

## Getting started

```bash
git clone https://github.com/driftlens/driftlens
cd driftlens
pnpm install
pnpm build
pnpm test
```

## Repo layout

- `packages/engine` — the analysis engine (parser, graph, drift). Start here.
- `packages/graph` — graph store layer.
- `packages/extension` — VS Code extension shell.
- `docs/` — architecture, the `.driftlens.yml` spec, and ADRs.
- `examples/sample-repo` — fixture repo for demos and tests.

## Development workflow

1. Create a branch: `git checkout -b feat/<short-name>`.
2. Make your change with tests.
3. `pnpm lint && pnpm typecheck && pnpm test` must pass.
4. Open a PR against `main`. Fill out the PR template. Link any related issue.

## Adding a language parser

The engine defines a single `LanguageParser` interface (see
`packages/engine/src/parser`). To add a language:

1. Implement the interface, returning a normalized `ParsedFile`
   (imports, exports, definitions).
2. Register it in the parser registry by file extension.
3. Add golden-file tests under `packages/engine/tests`.

You do **not** need to touch the graph builder or drift detector — they consume
the normalized `ParsedFile` shape, so a new language lights up the whole pipeline.

## Architecture decisions

Non-trivial technical choices are recorded as ADRs in `docs/adr/`. If you're
proposing a significant change, add an ADR in the same PR.

## Code of conduct

Be kind, assume good faith, and keep discussion technical. Harassment of any kind
is not tolerated.
