# DriftLens — Branching & Commit Strategy

> **Audience:** anyone contributing to DriftLens (humans and AI agents).
> **Companion:** `SPECS.md` is the source of truth for *what* to build. This doc is the source of truth for *how* to land changes.

---

## The Golden Rule

> **The spec leads. The code follows.**
>
> 1. Read `SPECS.md` for the spec you're working on.
> 2. Update the spec if needed (decision changes, scope changes).
> 3. Write code that matches the spec.
> 4. Commit with messages that reference the spec ID.
> 5. The spec is updated again before the code if reality diverges from plan.

If a change shows up in the code without the spec being updated first, **the spec gets updated in the same PR**. No exceptions.

---

## The Model (in one diagram)

```
                          ┌─────────────────────────────────┐
                          │         SPECS.md                │
                          │  (manual / source of truth)     │
                          └────────────┬────────────────────┘
                                       │ "this spec is what we build"
                                       ▼
   ┌──────────────┐    ┌────────────────────────────┐    ┌──────────────┐
   │              │    │                            │    │              │
   │ spec/016-    │    │     spec/018-              │    │ spec/020-    │
   │ unified-     │    │     doc-ingestion          │    │ mcp-server   │
   │ model        │    │                            │    │              │
   │              │    │     ┌──────┐              │    │              │
   │ ┌──────┐     │    │     │ c1   │              │    │ ┌──────┐     │
   │ │ c1   │     │    │     ├──────┤              │    │ │ c1   │     │
   │ ├──────┤     │    │     │ c2   │              │    │ ├──────┤     │
   │ │ c2   │ ────────── merges to main only when  ────── │ c2   │     │
   │ ├──────┤     │    │     ├──────┤  spec is ✅   │    │ ├──────┤     │
   │ │ c3   │     │    │     │ c3   │              │    │ │ c3   │     │
   │ └──────┘     │    │     └──────┘              │    │ └──────┘     │
   │              │    │                            │    │              │
   └──────┬───────┘    └────────────┬───────────────┘    └──────┬───────┘
          │                         │                           │
          │      PR review          │      PR review            │
          ▼                         ▼                           ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │                          main                                   │
   │           (always green, always deployable)                     │
   └─────────────────────────────────────────────────────────────────┘
```

Each spec is a **sandbox**. You build there. You only ship to `main` when the spec's acceptance criteria are met.

---

## Branch Naming

```
spec/<SPEC-ID>-<short-slug>
```

| Spec ID | Branch name |
|---|---|
| SPEC-016 | `spec/016-unified-model` |
| SPEC-018 | `spec/018-doc-ingestion` |
| SPEC-019 | `spec/019-spec-ingestion` |
| SPEC-020 | `spec/020-mcp-server` |
| SPEC-013 | `spec/013-refined-score` |
| SPEC-011 | `spec/011-demo` |

**Rules:**
- Lowercase, dash-separated.
- Slug is short (3-5 words), descriptive.
- One branch per spec, even if a spec spans multiple PRs.
- Don't reuse a branch across specs — even if related, keep them isolated.

**Exceptions / other branch types:**

| Type | Pattern | Use |
|---|---|---|
| Hotfix | `hotfix/<short-desc>` | Critical fix to `main` |
| Spike | `spike/<topic>` | Throwaway exploration; never merges |
| Docs-only | `docs/<topic>` | Pure doc changes that don't touch code |

---

## Commit Messages

Format:

```
[<SPEC-ID>] <imperative verb> <what changed>

<optional body: why, what decision was made>
```

### Examples (good)

```
[016] add fnv1a hash util

Content-hash for change detection. Dependency-free, bundler-safe.
```

```
[018] parse ADR frontmatter for status/owner

ADR auto-detection now supports both path pattern (adr/NNNN-*.md)
and frontmatter (`status: accepted`). Spec says "both" so we honor both.
```

```
[020] cap query_component response at 4000 tokens

Pagination cursor added. Per-tool cap from spec; test asserts the cap.
```

### Examples (bad)

```
updated stuff
```

```
WIP
```

```
fix
```

```
[016] stuff
```

The spec ID in the prefix is what makes the history auditable. Six months from now you can `git log --oneline | grep 020` and see every commit tied to the MCP server spec.

---

## The Workflow (per spec)

### Step 1: Branch off main

```bash
git checkout main
git pull
git checkout -b spec/016-unified-model
```

### Step 2: Read the spec, decide the open questions

Open `SPECS.md`. Find SPEC-016. Read the "Technical decisions to make" section. Decide each one. If you change a decision from what's in the spec, **edit the spec first, commit it, then code**.

```bash
# Edit SPECS.md — change a decision
git add SPECS.md
git commit -m "[016] refine ID strategy: path-based, hash in source.hash"
```

### Step 3: Implement in small commits

Each commit = one sub-task. Don't bundle 4 sub-tasks into one commit.

```bash
git add packages/engine/src/util/hash.ts packages/engine/test/hash.test.ts
git commit -m "[016] add fnv1a hash util"

git add packages/engine/src/model/model.ts packages/engine/src/parser/typescript.ts
git commit -m "[016] add contentHash to ParsedFile, set in TS parser"

git add packages/engine/src/model/unified.ts
git commit -m "[016] add unified graph types (SourceKind, Node, Edge, Graph)"

# ... etc
```

### Step 4: Verify locally before pushing

```bash
pnpm -r test
pnpm -r typecheck
pnpm --filter @driftlens/engine build
node scripts/analyze-sample.mjs
```

All green? Push.

### Step 5: Open PR

PR title: `[SPEC-016] Unified Architecture Data Model`

PR body template:
```markdown
## Spec
SPEC-016 — Unified Architecture Data Model

## Acceptance criteria (from SPECS.md)
- [x] Same drift events fire on the same code after migration
- [x] New node types queryable
- [x] All 33 existing tests still pass
- [x] New tests: hash, builder, projection, drift equivalence, query

## Decision changes from spec
- ID strategy refined: path-based IDs, content-hash lives in source.hash
  (spec updated in commit `[016] refine ID strategy`)

## Verification
- `pnpm -r test` — N/N passing
- `pnpm -r typecheck` — clean
- `node scripts/analyze-sample.mjs` — same drift report as before
```

### Step 6: Review → Merge

- Human review (or self-review checklist if solo).
- Squash-merge to `main`. Squash commit message keeps the `[016]` prefix.
- Tag the merge commit: `git tag spec-016-merged main`.

### Step 7: Update SPECS.md status

Change the spec's `Status:` from `⛔` to `✅`. Commit it to `main` directly (tiny change, no spec needed).

```bash
git checkout main
git pull
# edit SPECS.md: SPEC-016 status ⛔ → ✅
git add SPECS.md
git commit -m "[016] mark spec complete"
git push
```

---

## When specs collide

Two specs touching the same file? Two options:

**(A) Sequence them.** Finish spec A's PR, then start spec B. Simpler. Loses parallelism.

**(B) Coordinate via shared interface.** If you must parallelize:
- Spec A defines an **interface** (`UnifiedNode`).
- Spec A merges first (with a stub implementation).
- Spec B implements against the interface.
- Spec A replaces stub with real implementation.

For DriftLens today, prefer (A). You're solo. Serial is fine.

---

## When reality diverges from spec mid-implementation

You start implementing SPEC-018 and realize the markdown parser needs to handle a case you didn't foresee (e.g. inline HTML in headings). What now?

**Process:**

1. **Stop coding.**
2. **Edit SPECS.md** — add the case to SPEC-018's "Technical decisions to make" or as a new sub-task.
3. **Commit the spec change alone** (`[018] add: handle inline HTML in headings`).
4. **Resume coding.**

Never silently absorb a design change into the code. The spec is the audit trail. Six months from now, "why does the parser handle inline HTML?" — `git log SPECS.md` answers it.

---

## When you need to revert

```bash
# Find the spec's merge commit
git log --oneline | grep "016"

# Revert it
git revert <merge-commit-sha>
```

One spec's breakage doesn't poison the rest of the project.

---

## Solo vs. Team

This strategy works for both. The difference:

| Solo | Team |
|---|---|
| You are the reviewer | One human reviews each PR |
| Squash-merge keeps history clean | Squash-merge OR rebase-merge |
| Branches stay local until ready | Branches pushed immediately, draft PR for visibility |

For DriftLens, you're solo. Keep it simple: local branches, push when ready for `main`, squash-merge.

---

## Quick reference

```bash
# Start a new spec
git checkout main && git pull
git checkout -b spec/<ID>-<slug>

# Commit while working
git add <files>
git commit -m "[<ID>] <verb> <what>"

# Before pushing — verify
pnpm -r test && pnpm -r typecheck

# Push and PR
git push -u origin spec/<ID>-<slug>
gh pr create --title "[SPEC-<ID>] <Title>" --body "<acceptance + decisions + verification>"

# After merge — tag and update status
git tag spec-<ID>-merged main
# Edit SPECS.md: ⛔ → ✅, commit to main
```

---

## What this prevents

| Failure mode | How branching+specs prevents it |
|---|---|
| Agent invents features not in spec | Each commit must reference a spec sub-task. PR review catches drift. |
| Code and docs diverge | Spec update is a required step before the code change. |
| One broken spec poisons the build | Spec is on its own branch; revert is one command. |
| Can't remember why X exists | `git log SPECS.md` and `git log --grep X` give you the audit trail. |
| Hard to onboard a contributor | They read SPECS.md → pick a spec → branch → ship. |

---

## TL;DR

- **One branch per spec.** Always.
- **Commit messages start with `[SPEC-ID]`.** Always.
- **Spec gets edited before code, in the same PR, when reality diverges.** Always.
- **PRs only merge when acceptance criteria in SPECS.md are met.** Always.
- **`main` is always green, always deployable.** Always.

Five "always." That's the whole strategy.