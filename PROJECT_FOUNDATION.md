# DriftLens — Project Foundation

> **Working name:** DriftLens (alternates: ShiftSentry, ArchPulse, SpecWeave)
> **Type:** Open-source VS Code extension (+ optional backend)
> **Status:** Pre-development / spec stage
> **Last updated:** 2026-07-05

---

## 1. One-Line Pitch

**DriftLens** is a VS Code extension that shows every developer on a team, in real time, what their code is *actually* doing to the system's architecture — and what their teammates' AI-assisted code is doing to theirs — *before* any of it hits production.

---

## 2. Why This Project Exists (Problem Statement)

Modern software development has five compounding pain points that no existing tool solves together.

### 2.1 Architecture Drift
The documented architecture and the actual architecture diverge silently over time. Confluence diagrams rot. ADRs get ignored. New developers copy patterns without understanding the system model. Six months in, nobody on the team can accurately describe the system.

**Cost:** New devs take 3–6 months to ramp. Refactors break things nobody knew were coupled. Incident response is slow because mental models are wrong.

### 2.2 The AI Coding Agent Bubble
Tools like Cursor, Copilot, Continue.dev, and Claude Code work per-developer, per-session. Each agent:
- Takes a narrow spec ("add a button that does X")
- Writes code for that spec
- Does **not** see the system outside its bubble
- Does **not** see what other agents are doing in parallel

**The concrete failure mode:** Developer A's agent writes a feature on Component A. Developer B's agent, working on Component B in parallel, ships a change that silently breaks A's contract. Both diffs look fine in isolation. Production breaks at merge time. Nobody saw it coming.

This is the **#1 new problem** in software engineering since 2024. It is getting worse, not better, as AI coding adoption accelerates.

### 2.3 Collaborative Blindness
In a team of 5+ developers working on the same monorepo or microservice mesh, no one has full visibility into what teammates are shipping at any given moment. PR reviews happen too late (post-implementation). Architecture decisions get made in isolation.

**Cost:** Merge conflicts, contract breaks, duplicated work, "wait, why did you change that?" surprises.

### 2.4 Expensive Production Validation
SRE observability traditionally happens **after** deployment. To check if your code degrades p99 latency, you must:
1. Deploy to staging (cost: $$ infra)
2. Generate load
3. Measure
4. Repeat for every PR

**Cost:** Cloud bills, engineer time, slow feedback loops. Mid-size companies spend $50k–$500k/month on staging/mirror environments.

### 2.5 LLM Context Inefficiency
Existing AI coding assistants dump large markdown blobs (READMEs, docs) into context. Result:
- Token waste
- Lost information (vector embeddings flatten structure)
- Stale or wrong context

PageIndex-style knowledge graphs and GraphRAG have demonstrated that **graph-structured context outperforms flat text** for code-aware tasks. No IDE-native tool currently does this well.

---

## 3. What DriftLens Is

DriftLens is a **VS Code extension** (with an optional local backend / team-sync service) that addresses all five pain points through four integrated features.

It is **not** another AI code generator. It is the **observability + architecture + collaboration layer** that sits on top of whatever AI coding tool the developer is already using.

---

## 4. Target Users

### Primary
- **Mid-to-senior software engineers** (3+ years experience) working in teams of 3–50 on:
  - Microservices architectures
  - Large monorepos
  - Cloud-native systems (Kubernetes, AWS/GCP/Azure)
- **Tech leads / staff engineers** who own architecture decisions and need visibility

### Secondary
- **SRE / platform engineers** who want shift-left of their observability practices
- **Engineering managers** who want better team coordination signal
- **New hires** who need to ramp on an unfamiliar codebase

### Anti-users (intentionally not targeting)
- Solo developers on small projects (no team coordination value)
- Hobby projects (no production concerns)
- Teams not using AI coding tools (partial value, but not the wedge)

---

## 5. Core Features (The Four Pillars)

### Pillar 1: Live Architecture Visualizer
- Auto-extracts service/module/component graph from code (using tree-sitter, LSP, static analysis)
- Updates in real time as the developer saves files
- Renders as interactive C4-style diagram in a VS Code WebView
- Supports zoom, filter by team, time-travel through git history

### Pillar 2: Architecture Drift Detector
- Reads declared architecture from `.driftlens.yml` or ADRs in repo
- Continuously diffs declared vs actual
- Surfaces drift as red edges, warnings, or PR comments
- Tracks architecture health score over time

### Pillar 3: AI Bubble Detection & Team Awareness
- Hooks into file save events
- Detects when a change in Component A might affect contracts / API surfaces / shared types used by Component B
- **Live team feed**: shows what teammates are working on *right now* (based on recent commits, open PRs, file activity)
- Warns: *"Heads up — Marcus just changed `UserService.getById()` signature. Your code in `CheckoutFlow.tsx` calls it."*
- This is the **killer feature** for the AI-agent era.

### Pillar 4: SRE / Reliability Forecaster
- For every PR, predicts:
  - p50 / p95 / p99 latency impact
  - Error rate impact
  - Cost impact ($$ per month at projected traffic)
  - Blast radius (which services / users affected if this breaks)
- Surfaces SLI/SLO breach risk before code ships
- Optional: spins up local prod-mirror (kind/k3d cluster) for actual load testing

### Supporting Layer: Project Knowledge Graph
- Internal data structure: nodes = services, modules, functions, decisions, people, incidents
- Edges = dependencies, calls, contracts, ownership
- Powers all four pillars
- Exposed as a queryable API for LLM tools (so external Cursor/Copilot can query project context efficiently instead of stuffing markdown)
- Token-efficient: query returns only the relevant subgraph, not the whole codebase

---

## 6. System Design (High-Level)

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension (TS)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ TreeView │  │ WebView  │  │ StatusBar│  │ PR Commenter │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │ LSP / IPC
┌─────────────────────────▼───────────────────────────────────┐
│            Local Analysis Engine (Python or Node)           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  tree-sitter │  │  Drift       │  │  Forecaster      │  │
│  │  Parser      │  │  Detector    │  │  (SLI/SLO/Cost)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ GraphQL / JSON
┌─────────────────────────▼───────────────────────────────────┐
│           Knowledge Graph Store (SQLite + Kùzu)             │
│   Nodes: services, modules, functions, ADRs, incidents      │
│   Edges: imports, calls, contracts, ownership               │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebSocket (optional)
┌─────────────────────────▼───────────────────────────────────┐
│         Team Sync Service (Optional, Self-Hostable)         │
│   - Recent teammate activity stream                         │
│   - Shared drift events                                     │
│   - Cross-repo architecture map                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where to run analysis | Local by default, cloud optional | Privacy, latency, no vendor lock-in |
| Graph store | SQLite + Kùzu (embedded graph DB) | No infra, works offline, fast for project-sized graphs |
| Real-time updates | File watcher + debounced incremental analysis | Sub-second feedback |
| Team sync | Optional WebSocket service, self-hostable | OSS-friendly, no SaaS required |
| LLM usage | Minimal & optional | Determinism first; LLM for natural-language summaries only |
| Parser | tree-sitter | Multi-language, fast, accurate |

---

## 7. Tech Stack (Proposed)

### Extension Frontend (VS Code)
- **Language:** TypeScript
- **UI:** React (WebView) + native VS Code TreeView
- **Diagram rendering:** Cytoscape.js or React Flow
- **State:** Zustand or Redux Toolkit
- **Build:** esbuild + VS Code Extension bundler

### Analysis Engine
- **Language:** Python (rich ML/analysis ecosystem) **OR** Node.js (single-language with extension)
- **Recommendation:** Start with Node.js for v1 (single binary distribution, no Python dependency); add Python backend in v2 for advanced ML-based forecasting
- **Parser:** tree-sitter (multi-language)
- **Symbol resolution:** LSP integration when available

### Graph Store
- **Primary:** SQLite + Kùzu (embedded graph database)
- **Alternative:** Neo4j (for very large projects)
- **In-memory cache:** For real-time queries

### Team Sync (v2)
- **Self-hostable:** Docker container
- **Real-time:** WebSocket (Socket.IO or native WS)
- **Auth:** GitHub OAuth (read repo access)

### LLM Integration (Optional)
- **Local:** Ollama-compatible endpoints
- **Cloud:** Anthropic / OpenAI / open models
- **Use cases:** Natural-language summaries, drift explanation, SLO recommendations

---

## 8. Why DriftLens Is Different

| Existing Tool | What It Does | What DriftLens Adds |
|---|---|---|
| Cursor / Copilot | Generate code | Doesn't show architecture impact of generated code |
| Sentry / Datadog | Monitor prod | Only after deployment, not at dev time |
| Structurizr / C4 tools | Document architecture | Static, manual, no drift detection |
| Backstage | Service catalog | Web-based, not in IDE, no real-time updates |
| GitHub PR review | Review code | Per-PR, no cross-component awareness |
| Signadot / Speedscale | Preview environments | Infra-heavy, no architecture layer |

**DriftLens's wedge:** The only tool that sits in the IDE, tracks architecture drift **continuously**, surfaces AI-bubble problems in real time, and forecasts reliability impact **before merge**.

---

## 9. Open Source Strategy

### License
**Apache 2.0** — permissive, business-friendly, what serious infra tools use.

### Repository Structure
```
driftlens/
├── packages/
│   ├── extension/          # VS Code extension (TS)
│   ├── engine/             # Analysis engine (Node/Python)
│   ├── graph/              # Graph store layer
│   └── team-sync/          # Optional team sync server
├── docs/
├── examples/
│   └── sample-repo/
└── README.md
```

### Community Hooks
- **Plugin architecture** for language analyzers (let community add Rust, Go, Kotlin, etc.)
- **ADR format** as the standard for declared architecture (build an ecosystem)
- **Public dashboard** showing architecture health of OSS projects (showcase + dogfooding)
- **Discord / GitHub Discussions** for community

### Why OSS Will Work
1. The pain is universal — every mid-size engineering org has it
2. Privacy-first (runs locally) — enterprises will adopt it
3. Self-hostable — no vendor lock-in concerns
4. Clear contribution surface (parsers, forecasters, integrations)
5. Aligns with the AI-coding-tools ecosystem — those tools can integrate as clients

---

## 10. Roadmap (Summary — see PROJECT_PLAN.md for detail)

| Phase | Duration | Deliverable |
|---|---|---|
| **P0: Foundation** | Weeks 1–2 | Repo, README, 1-pager, name + domain reserved |
| **P1: MVP** | Weeks 3–10 | Live architecture visualizer + drift detector + basic graph store |
| **P2: Team Awareness** | Weeks 11–16 | AI bubble detection + team feed |
| **P3: SRE Forecaster** | Weeks 17–24 | SLI/SLO/cost prediction + PR comments |
| **P4: Polish** | Weeks 25–32 | Performance, multiple languages, public launch |

**Target public launch:** ~8 months from project start.

---

## 11. Success Metrics

### Quantitative
- 1,000 GitHub stars in first 6 months post-launch
- 100 active weekly users by month 9
- 10 external contributors by month 12
- Architecture drift detection precision/recall >85% on benchmark repos

### Qualitative
- Cited in at least 3 conference talks (KubeCon, SREcon, StrangeLoop)
- Integrated into at least 1 major AI coding tool (Cursor / Continue.dev / Cody) as a context provider
- Mentioned in Hacker News "Show HN" with >100 points

---

## 12. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Performance overhead in IDE | High | High | Incremental analysis, debouncing, background workers |
| Hard to detect "AI bubble" reliably | High | High | Start with simple contract-change detection; iterate |
| Big players (GitHub, Microsoft) build it | Medium | Critical | Move fast, build community, focus on the IDE-native UX |
| Slow adoption (developers hate new tools) | Medium | High | Zero-config install, immediate value, no signup |
| Multi-language support is hard | High | Medium | Plugin architecture, start with TS/Python/Go, community-driven for rest |

---

## 13. The "Interview-Ready" Framing

When asked about this project in an interview, the defensible narrative is:

> *"I kept seeing the same problem on every team I've worked with: the architecture in our heads and the architecture in the code diverged silently, and AI coding tools made it dramatically worse because each agent works in a bubble without seeing the broader system. So I'm building DriftLens — a VS Code extension that continuously extracts the actual architecture from code, surfaces drift before merge, and warns developers when their change (or their teammate's change) is about to break a contract they didn't know they had. It also forecasts SRE metrics on PRs, basically shift-left observability into the dev loop. The interesting part technically is that we represent the project as a live knowledge graph instead of flat markdown, which both powers the visualization and gives AI coding tools token-efficient project context."*

This answers: **what problem, why now, what's the technical angle, what's the engineering depth.**

---

## 14. Open Questions (to resolve before MVP starts)

1. **Single repo vs. monorepo assumption?** — Affects the graph schema. Recommendation: assume monorepo first, microservice mesh later.
2. **How invasive is the install?** — Should it auto-index on install, or require a `driftlens init` command? Recommendation: auto-index, with opt-out.
3. **Team sync — peer-to-peer or server?** — P2P is cooler but harder to scale and secure. Recommendation: optional server, peer-to-peer in v3.
4. **Pricing model if it goes commercial?** — Out of scope for now (OSS-first), but reserve the option for hosted team-sync SaaS later.

---

## 15. References & Inspiration

- **PageIndex** — vectorless, graph-based RAG for documents. Inspiration for our context graph.
- **Microsoft GraphRAG** — community detection over graphs for retrieval.
- **Structurizr** — C4 model tooling. Inspiration for the diagram UX.
- **Backstage** — service catalog. Inspiration for the broader system.
- **Sentry** — shift-left error monitoring. Inspiration for the SRE positioning.
- **Telepresence / Signadot** — local prod-mirror. Inspiration for the simulation runtime (v2+).
- **Sourcegraph** — code intelligence at scale. Inspiration for cross-repo indexing.

---

## Appendix A: Glossary

- **Architecture drift** — divergence between documented/intended architecture and actual code structure.
- **AI bubble** — the limited context window an AI coding agent has when generating code; lacks system-wide awareness.
- **SLI / SLO** — Service Level Indicator / Objective. E.g., p99 latency < 400ms.
- **C4 model** — Context, Containers, Components, Code — hierarchical way to describe architecture.
- **ADR** — Architecture Decision Record. A markdown file capturing a decision and its rationale.
- **Knowledge graph** — graph data structure where nodes = entities, edges = relationships. Better than vectors for structured domain knowledge.
- **Shift-left** — moving a concern (testing, security, observability) earlier in the development lifecycle.

---

*End of Foundation Document. See `PROJECT_PLAN.md` for the implementation roadmap.*