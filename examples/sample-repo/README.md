# sample-repo

A tiny three-service repo used for DriftLens demos and manual testing.

- `src/user` — clean.
- `src/payments` — declares a dependency on `user` it never uses (→ warning).
- `src/checkout` — imports `payments` without declaring it (→ **drift error**).

Run the engine against it from the repo root:

```bash
pnpm --filter @driftlens/engine build
node scripts/analyze-sample.mjs
```

Expected: architecture health **50%**, one `undeclared-dependency` error
(`checkout → payments`) and one `unused-declared-dependency` warning
(`payments → user`). Add `payments` to `checkout.dependencies` in
`.driftlens.yml` and the score climbs to 100%.

## See the diagram (no VS Code needed)

```bash
pnpm preview          # writes examples/sample-repo/preview.html
```

Open `preview.html` in a browser: components are colored by service, and the
drifted `checkout` component is painted with a red overlay (with `payments`
amber as the affected component and the offending import drawn as a red edge) —
the same visualization the VS Code extension shows.
