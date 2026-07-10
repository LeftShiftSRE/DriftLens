/**
 * `@driftlens/mcp-server` — exposes DriftLens's unified architecture graph as
 * Model Context Protocol tools for AI coding agents (Cursor / Claude Code /
 * Continue / Cody). See `docs/mcp-server.md` for setup.
 *
 * The default import is the stdio entrypoint; the named exports below let a
 * programmatic caller (tests, scripts) drive the tool handlers directly.
 */
export { buildContext, buildServer, serveStdio, resolveWorkspace, runTool } from "./server.js";
export type { WorkspaceContext, ToolResult } from "./server.js";
export { capTokens, pageFrom, MAX_TOKENS } from "./tokens.js";
export type { CappedResult } from "./tokens.js";
export {
  renderComponent,
  renderDecisions,
  renderHealth,
  renderOwners,
} from "./render.js";