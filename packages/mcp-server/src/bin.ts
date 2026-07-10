#!/usr/bin/env node
// DriftLens MCP server bin (SPEC-020).
// Usage: driftlens-mcp --workspace /path/to/repo
//
// Boots a stdio MCP server backed by @driftlens/engine. Reads the workspace
// (code + .driftlens.yml + docs + .spec.md) once at startup; tools are
// read-only thereafter. No auth, no network (CD-001).
import { serveStdio, resolveWorkspace } from "./server.js";

const workspace = resolveWorkspace(process.argv);
serveStdio(workspace).catch((err) => {
  process.stderr.write(`driftlens-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});