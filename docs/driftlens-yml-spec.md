# `.driftlens.yml` specification (v1)

`.driftlens.yml` lives at the root of your repository and declares your
*intended* architecture: the services/components that make up your system, which
files belong to each, and which components are allowed to depend on which. The
drift detector compares this declaration against the architecture actually
extracted from your code and reports the divergences.

## Top-level shape

```yaml
version: 1            # optional, defaults to 1
services:             # required, non-empty list
  - name: checkout
    paths:
      - "src/checkout/**"
    owner: marcus     # optional
    dependencies:     # optional, defaults to []
      - user
      - payments
  - name: user
    paths:
      - "src/user/**"
  - name: payments
    paths:
      - "src/payments/**"
```

## Fields

### `version` (number, optional)
Schema version. Defaults to `1`.

### `services` (list, required)
Each entry declares one service/component.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `name` | string | yes | Unique service identifier. |
| `paths` | string[] | yes (non-empty) | Globs of files that belong to this service. |
| `owner` | string | no | Owning person/team (surfaced in the UI; used by team features later). |
| `dependencies` | string[] | no | Names of other services this one is **allowed** to depend on. Defaults to `[]`. |

Every name in `dependencies` must refer to a declared service, or the config is
rejected.

## Glob syntax

Paths use a small, dependency-free glob dialect (matched against
POSIX-normalized, repo-relative paths):

- `**` — matches any number of path segments, including zero (`src/checkout/**`).
- `*` — matches any run of characters **except** `/` (`src/*.ts`).
- `?` — matches exactly one non-`/` character.

A file is assigned to the **first** service (in document order) whose `paths`
match it.

## What the detector reports

| Kind | Severity | Meaning |
|---|---|---|
| `undeclared-dependency` | error | Service A imports service B, but B is not in A's `dependencies`. |
| `unused-declared-dependency` | warning | A declares a dependency on B that never actually occurs in code. |
| `unassigned-file` | info | A parsed file matches no service's `paths`. |

## Architecture health score

`healthScore` is `round(100 × compliant / (compliant + violating))`, computed
over **cross-service import edges** only. An edge is *compliant* if the target
service is declared in the source service's `dependencies`, and *violating*
otherwise. With no cross-service edges, the score is `100`. Warnings and info
events do not affect the score.
