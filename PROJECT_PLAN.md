# DriftLens — Project Plan & Roadmap

> Companion to `PROJECT_FOUNDATION.md`. Read that first if you haven't.
> **Working name:** DriftLens
> **Target launch:** 8 months from project start
> **Last updated:** 2026-07-06

---

## Implementation Addendum (2026-07-06)

This plan was written pre-development. Implementation is now underway with an AI
coding agent (Claude) as the primary implementer working alongside the project
owner. That changes how Phase 0 is executed — not what gets built.

**Split of responsibility:**

- **Buildable now (agent-driven):** repo skeleton, monorepo tooling, engine
  (parser → graph → drift), extension, webview, tests, CI config, docs, sample
  repo. This is the critical path and where work starts immediately.
- **Human-only (owner-driven, tracked but not blocking code):** reserving the
  GitHub org, registering domains, standing up Discord/social accounts, and
  recruiting design partners. These are unblocked by having a working demo, so
  they are intentionally deferred until Phase 1 has something worth showing.

**Execution order chosen:** engine first, extension second. Per Guiding
Principle #3 ("Deterministic before AI") and #1 ("Ship the smallest thing that
demos well"), the engine — parser, in-memory graph, and drift detector — is the
true critical path. It is pure TypeScript, fully unit-testable with golden
files, and carries zero UI or AI dependencies. The VS Code extension is then a
thin presentation shell over a proven engine.

---

## Guiding Principles

1. **Ship the smallest thing that demos well** — Pillar 1 (Live Architecture Visualizer) alone is enough for a credible "Show HN."
2. **Local-first, cloud-optional** — works without any server, no signup, no telemetry.
3. **Deterministic before AI** — every feature works without an LLM. LLM is gravy, not the foundation.
4. **Real users early** — 5 design partners from week 4, not week 20.
5. **OSS-first** — every commit, decision, and discussion is public.

---

## Phase 0: Foundation (Weeks 1–2)

**Goal:** Set up the project skeleton, lock the name, write the README, recruit design partners.

### Tasks

**Agent-driven (buildable now):**
- [x] Create monorepo structure (pnpm workspaces)
- [x] Write the public README (problem, demo gif placeholder, install, contribute)
- [x] Write CONTRIBUTING.md
- [x] Set up basic CI (GitHub Actions: lint, test, build)
- [x] Create issue templates and PR template

**Owner-driven (deferred until Phase 1 has a demo — not blocking code):**
- [ ] Reserve GitHub org: `driftlens`
- [ ] Register domains: `driftlens.dev`, `driftlens.io`, `driftlens.sh`
- [ ] Set up Discord / GitHub Discussions
- [ ] Set up Twitter/X and LinkedIn accounts (for launch later)
- [ ] Write 1-pager (lift from foundation doc)
- [ ] Identify and recruit 5 design partners (mid-senior engineers at mid-size companies)

### Deliverable
- Public repo with README, 1-pager, and clear "we're building this" signal
- 5 design partners committed to weekly 30-min feedback sessions

---

## Phase 1: MVP — Live Architecture Visualizer + Drift Detector (Weeks 3–10)

**Goal:** A working VS Code extension that opens a panel, parses a TypeScript or Python codebase, renders a live component graph, and shows drift against a declared `.driftlens.yml`.

This is the "look mom, no AI yet" demo. It alone justifies the project.

### Architecture (Phase 1)

```
┌────────────────────────────────────────────┐
│       VS Code Extension (TypeScript)       │
│                                            │
│  ┌────────────────────────────────────┐    │
│  │  File Watcher (chokidar)           │    │
│  └────────────┬───────────────────────┘    │
│               │                            │
│  ┌────────────▼───────────────────────┐    │
│  │  Parser (tree-sitter)              │    │
│  │  - TS, JS, Python (v1)             │    │
│  │  - Extracts: imports, exports,     │    │
│  │    classes, functions, decorators  │    │
│  └────────────┬───────────────────────┘    │
│               │                            │
│  ┌────────────▼───────────────────────┐    │
│  │  Graph Builder (in-memory)         │    │
│  │  - Builds component graph          │    │
│  │  - Incremental updates             │    │
│  └────────────┬───────────────────────┘    │
│               │                            │
│  ┌────────────▼───────────────────────┐    │
│  │  Drift Detector                    │    │
│  │  - Reads .driftlens.yml            │    │
│  │  - Compares to actual graph        │    │
│  │  - Emits drift events               │    │
│  └────────────┬───────────────────────┘    │
│               │                            │
│  ┌────────────▼───────────────────────┐    │
│  │  WebView (React + Cytoscape.js)    │    │
│  │  - Renders live graph              │    │
│  │  - Highlights drift in red         │    │
│  │  - Click node → code peek          │    │
│  └────────────────────────────────────┘    │
└────────────────────────────────────────────┘
```

### Tasks

#### Week 3–4: Repo skeleton + parser
- [ ] Set up monorepo with `packages/extension` and `packages/engine`
- [ ] Implement tree-sitter parser wrapper for TypeScript
- [ ] Extract: file imports, exported symbols, class/function definitions
- [ ] Unit tests for parser (golden files)

#### Week 5–6: Graph builder + persistence
- [ ] Build in-memory graph from parser output
- [ ] Integrate SQLite + Kùzu for persistence
- [ ] Incremental updates (only re-analyze changed files)
- [ ] Bench: must handle 10k file repo in <30s initial parse

#### Week 7–8: WebView diagram
- [ ] React + Cytoscape.js WebView
- [ ] Render component graph with zoom/pan/filter
- [ ] Color-code by status (healthy, warning, drift)
- [ ] Click node → show file in editor

#### Week 9–10: Drift detection + polish
- [ ] Define `.driftlens.yml` schema (services, dependencies, owners)
- [ ] Implement drift comparator
- [ ] Visualize drift as red edges + warning icons
- [ ] Status bar indicator showing "Architecture Health: 87%"
- [ ] Add Python parser
- [ ] Write first public demo GIF / video

### Deliverable (end of Phase 1)
- Working VS Code extension, installable from `.vsix`
- Renders live architecture for any TS or Python repo
- Detects drift against declared architecture
- Demo video: <2 minutes, shows the killer use case
- 5 design partners using it weekly

### Definition of Done (MVP)
- [ ] Install on a fresh machine in <2 minutes
- [ ] Opens a 5k-file TS repo, renders graph in <60s
- [ ] Drift detection accuracy >80% on a labeled benchmark
- [ ] No crashes on 10 consecutive file edits
- [ ] README has install + 30-second quickstart

---

## Phase 2: Team Awareness & AI Bubble Detection (Weeks 11–16)

**Goal:** When Developer A is editing Component A, surface (a) what Component B dependencies their change touches and (b) what teammates are currently changing in related areas.

### Tasks

#### Week 11–12: Contract detection
- [ ] Detect exported interfaces, API routes, RPC definitions
- [ ] Build "contract graph" subset of the full graph
- [ ] On file save, find all callers of changed exports
- [ ] Warn: "This change to `UserService.getById` affects 7 callers"

#### Week 13–14: Local teammate awareness (no server)
- [ ] Parse `git log --since=24h` to find recent teammate commits
- [ ] Surface in sidebar: "Marcus pushed to `CheckoutService` 2h ago"
- [ ] Show file-level activity heatmap

#### Week 15–16: Team sync service (optional, self-hostable)
- [ ] Build minimal WebSocket server (Node.js)
- [ ] Docker image for self-hosting
- [ ] GitHub OAuth for repo access
- [ ] Real-time teammate activity stream
- [ ] Architecture-wide drift events broadcast

### Deliverable (end of Phase 2)
- AI bubble detection works on real teams
- Optional team sync service for org-wide awareness
- Public "Show HN" launch candidate

---

## Phase 3: SRE Forecaster (Weeks 17–24)

**Goal:** For every PR, predict reliability impact and surface as PR comments.

### Tasks

#### Week 17–19: Latency & cost forecasting
- [ ] Static analysis of function call depth, I/O patterns, sync vs async
- [ ] Baseline model: trained on OpenTelemetry traces (or synthetic)
- [ ] Forecast p50/p95/p99 for changed code paths
- [ ] Cost model: estimate $/month at projected traffic

#### Week 20–21: SLI/SLO integration
- [ ] Read SLO definitions from `.driftlens.yml` or external (Prometheus, Datadog)
- [ ] Compare forecast vs SLO
- [ ] PR comment: "This change pushes p99 from 240ms → 380ms (SLO: 400ms — within budget but 60% consumed)"

#### Week 22–23: Blast radius analysis
- [ ] Trace dependency graph from changed code
- [ ] Identify downstream services and user-facing flows
- [ ] Score: "If this breaks, 14 services and 3 user flows are affected"

#### Week 24: Optional local prod-mirror
- [ ] Integrate kind/k3d for local cluster
- [ ] Replay anonymized prod traffic against local code
- [ ] Measure actual latency vs forecast
- [ ] Continuous improvement of forecast model

### Deliverable (end of Phase 3)
- PR comments with reliability forecasts
- Local prod-mirror integration (beta)
- First enterprise design partner

---

## Phase 4: Polish & Public Launch (Weeks 25–32)

**Goal:** Public launch, community building, first 1,000 users.

### Tasks

#### Week 25–27: Multi-language expansion
- [ ] Add Go parser (community contribution likely)
- [ ] Add Rust parser (if interest)
- [ ] Plugin architecture for community parsers
- [ ] Performance pass: handle 100k-file repos

#### Week 28–30: Ecosystem integrations
- [ ] Continue.dev integration (expose DriftLens graph as context)
- [ ] Cursor integration (via context provider API)
- [ ] GitHub Action for CI drift checks
- [ ] GitLab MR support

#### Week 31–32: Public launch
- [ ] "Show HN" post
- [ ] Launch blog post (dev.to, Medium, Hashnode)
- [ ] Conference talk submissions (KubeCon, SREcon, StrangeLoop)
- [ ] Twitter/X launch thread
- [ ] Reach out to 10 developer influencers
- [ ] Public roadmap published

### Deliverable (end of Phase 4)
- Public launch
- 1,000 GitHub stars target
- 100 weekly active users target
- 10 external contributors target

---

## Resource & Time Budget

### Solo developer estimate
- 8 months to launch, ~25–30 hours/week
- Phase 1 (MVP) is the critical path — must be done in 10 weeks

### Team of 2–3 estimate
- 5 months to launch with parallel work on engine + extension + docs

### Costs (Open Source)
| Item | Cost |
|---|---|
| Domain names | ~$50/year |
| GitHub org (free for OSS) | $0 |
| CI (GitHub Actions free tier) | $0 |
| Discord (free) | $0 |
| **Total** | **~$50/year** |

### Costs (if hosted team sync)
- VPS for WebSocket server: ~$20/month
- Or: free for OSS users, paid SaaS for enterprise (later)

---

## Risk Register

| Risk | Phase | Mitigation |
|---|---|---|
| Tree-sitter complexity slows parser work | P1 | Start with TS only, add Python in week 9 |
| Performance on large repos | P1 | Incremental analysis, debouncing, worker threads |
| Design partners ghost | P1 | Recruit 10, expect 5 to stay engaged |
| Scope creep (trying to do too much) | P2, P3 | Strict "Definition of Done" gates |
| Big player (GitHub/Microsoft) ships similar | All | Move fast, build community moat |

---

## Definition of Success — Each Phase

| Phase | Success = |
|---|---|
| P0 | Repo live, name reserved, 5 design partners |
| P1 | 5 design partners using it weekly, demo video exists |
| P2 | "Show HN" candidate, AI bubble detection works on real team |
| P3 | Enterprise design partner signs on, PR comments valuable |
| P4 | Public launch, 1k stars, 100 WAU |

---

## Open Decisions (need to make before each phase)

### Before P1 starts
- [ ] VS Code only, or also JetBrains / Cursor? (Recommendation: VS Code first, JetBrains v2)
- [ ] `.driftlens.yml` schema — finalize spec
- [ ] Graph store: Kùzu vs Neo4j vs custom? (Recommendation: Kùzu for embedded)

### Before P2 starts
- [ ] Team sync: server-only, or peer-to-peer? (Recommendation: server for v2, P2P for v3)
- [ ] Auth: GitHub OAuth, or org-managed? (Recommendation: GitHub OAuth v1)

### Before P3 starts
- [ ] Forecast model: train on what data? (OpenTelemetry traces, or synthetic)
- [ ] Local prod-mirror: required feature, or opt-in beta?

---

## Weekly Cadence (Solo Developer)

| Day | Activity |
|---|---|
| Monday | Design partner call (rotating, 30 min each, 2 per week) |
| Tue–Thu | Deep work (code, design, writing) |
| Friday | Public work (blog post, community, OSS maintenance) |
| Saturday | Optional: refactor, exploration, learning |

---

## Key Milestones

| Milestone | Date | What unlocks |
|---|---|---|
| M0: Foundation done | Week 2 | Repo live, public signal |
| M1: MVP demo | Week 10 | First "wow" moment, design partner love |
| M2: Team awareness live | Week 16 | AI bubble problem demonstrated |
| M3: Forecaster live | Week 24 | Enterprise-ready positioning |
| M4: Public launch | Week 32 | Show HN, community growth |

---

## Appendix A: Repo Skeleton (Phase 0)

```
driftlens/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── release.yml
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── packages/
│   ├── extension/         # VS Code extension (TS)
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── engine/            # Analysis engine (Node, then optionally Python)
│   │   ├── src/
│   │   │   ├── parser/
│   │   │   ├── graph/
│   │   │   ├── drift/
│   │   │   └── forecast/  # (P3)
│   │   └── tests/
│   ├── graph/             # Graph store layer
│   │   ├── src/
│   │   └── tests/
│   └── team-sync/         # (P2) Optional team sync server
│       └── src/
├── docs/
│   ├── architecture.md
│   ├── driftlens-yml-spec.md
│   └── adr/
├── examples/
│   └── sample-repo/       # For demos
├── README.md
├── CONTRIBUTING.md
├── LICENSE                # Apache 2.0
└── package.json           # Workspace root
```

---

## Appendix B: 30-Second Pitch (for when someone asks)

> *"DriftLens is a VS Code extension that shows every dev on a team, live in the IDE, what their code is doing to the system architecture — and what their teammates' code is doing to theirs — before any of it hits production. It's the architecture + observability + collaboration layer for the AI-coding era. We extract the actual architecture from code continuously, surface drift as you save files, and warn when AI-generated changes break contracts you didn't know existed."*

---

*End of Project Plan. Foundation document is at `PROJECT_FOUNDATION.md`.*