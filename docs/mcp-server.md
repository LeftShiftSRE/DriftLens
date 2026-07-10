# DriftLens MCP server (SPEC-020)

> Exposes DriftLens as a **Model Context Protocol** server so AI coding agents
> (Cursor / Claude Code / Continue / Cody) can query the project's architecture
> graph as live context. This is the "AI-era wedge" from the master spec sheet.

Source lives in [`packages/mcp-server`](../packages/mcp-server). It depends on
[`@driftlens/engine`](../packages/engine) and the official
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (v1.29.x).

## Why

DriftLens is more than a visualizer: it is the **context layer for the AI-coding
ecosystem**. Instead of an agent re-reading the whole repo or guessing at
ownership, it calls a tool and gets a bounded, structured answer - with owners,
ADRs, and specs attached.

## Architecture

```
Cursor / Claude Code / Continue
        │  stdio (JSON-RPC, MCP)
        ▼
  packages/mcp-server  ──buildContext()──▶  @driftlens/engine.analyzeProject
        │                                       (reads workspace once)
        │  runTool(name, args, ctx)
        ▼
  4 pure tool handlers → render → text (token-capped)
```

- **Local-first (CD-001).** The server runs as a subprocess over stdio; no
  network, no auth, no secrets. It reads `--workspace <path>` (default cwd) at
  startup and builds the unified graph once.
- **Stateless readers.** Every tool is a pure function of `(args, ctx)`. The graph
  is computed at boot; tool calls do no I/O.
- **No zod dependency.** We use the SDK's low-level `Server` + explicit JSON
  schemas rather than the high-level `McpServer.registerTool` (which pulls in
  zod), keeping the deterministic engine free of extra runtime deps.

## Tools

| Tool | Args | Returns |
|---|---|---|
| `query_component` | `name`, optional `cursor` | Service context subgraph: member modules + symbols, internal imports, owner, declared deps, governing ADRs, targeting specs. |
| `find_owners` | `file_or_symbol` | Ownership chain: file → service → owner. |
| `get_decision_history` | `component` | ADRs + specs affecting a service. |
| `get_health` | _(none)_ | Architecture health score + full drift report. |

`find_drift(since)` from the original spec is **deferred** to SPEC-022 (temporal
view); it requires time-series data this server does not yet carry. The tool list
stays stable so clients that probe it don't break.

## Token budgeting

Every tool response is capped at **4000 tokens** (~16KB of text) - well above the
2k-token acceptance bar. When a response would overflow, the server truncates on a
line boundary and returns a `cursor` (a byte offset). The client passes the cursor
back to page forward. See `src/tokens.ts`.

## Running it

```bash
# Build engine + server
pnpm --filter @driftlens/engine build
pnpm --filter @driftlens/mcp-server build

# Run as a stdio subprocess pointed at a repo
node packages/mcp-server/dist/bin.js --workspace /path/to/your-repo
```

The repo must contain a `.driftlens.yml` at its root (the engine needs a declared
architecture to assign files to services).

### Deterministic smoke test (no MCP client needed)

```bash
pnpm --filter @driftlens/mcp-server build
node scripts/mcp-server-sample.mjs
```

`scripts/mcp-server-sample.mjs` drives `buildContext` + `runTool` directly against
`examples/sample-repo` and prints each tool's output. This is the deterministic
surrogate for the "from Cursor, a query returns…" acceptance criterion; live
Cursor/Claude Code verification is still tracked as an open item.

## Client configuration

Add the server to your agent's MCP config (path-style; swap the binary path for
your checkout):

```jsonc
{
  "mcpServers": {
    "driftlens": {
      "command": "node",
      "args": [
        "/abs/path/to/DriftLens/packages/mcp-server/dist/bin.js",
        "--workspace",
        "/abs/path/to/your-repo"
      ]
    }
  }
}
```

Then ask, e.g., *"What's the architecture of the checkout service?"* - the agent
will call `query_component("checkout")` and get the owner, member files, ADRs, and
targeting specs.

## Testing

```bash
pnpm --filter @driftlens/mcp-server test   # vitest: 20 tests, all green
pnpm --filter @driftlens/mcp-server typecheck
```

`tests/tools.test.ts` exercises every tool via the pure `runTool` entry point;
`tests/tokens.test.ts` pins the cap + pagination behavior.
