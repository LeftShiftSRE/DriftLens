/**
 * DriftLens MCP server (SPEC-020).
 *
 * Boots a stdio MCP server using the official `@modelcontextprotocol/sdk`
 * low-level `Server` (the high-level `McpServer.registerTool` API pulls in zod,
 * which we don't want bundled into the deterministic engine). We register four
 * pure tool handlers, all backed by the in-memory unified graph:
 *
 *   - query_component(name)         → service context subgraph
 *   - find_owners(file_or_symbol)   → ownership chain
 *   - get_decision_history(name)    → ADRs + specs affecting a service
 *   - get_health()                  → current architecture health report
 *
 * Tools are stateless readers over the graph loaded at startup; the server
 * has no auth (local-first, CD-001) and no I/O beyond reading the workspace.
 *
 * Pure parts — `buildContext`, the individual tool handlers, renderers, token
 * cap — are exported so tests can drive them without stdio.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  analyzeProject,
  createQuery,
  detectDriftUnified,
  firstMatchingService,
  parseConfig,
  type DriftConfig,
  type DriftReport,
  type GraphQuery,
  type UnifiedGraph,
} from "@driftlens/engine";
import { capTokens, pageFrom } from "./tokens.js";
import {
  renderComponent,
  renderDecisions,
  renderHealth,
  renderOwners,
} from "./render.js";

const SERVER_NAME = "driftlens";
const SERVER_VERSION = "0.0.0";

export interface WorkspaceContext {
  readonly config: DriftConfig;
  readonly unified: UnifiedGraph;
  readonly query: GraphQuery;
  readonly drift: DriftReport;
}

/**
 * Build the analysis pipeline output (config, unified graph, drift report, query
 * index) for a workspace root. Pure: no global state; reads the filesystem once.
 * Exported so tests + the driver script can reuse the same setup as the server.
 */
export function buildContext(workspaceRoot: string): WorkspaceContext {
  const files = collectWorkspaceFiles(workspaceRoot);
  const configPath = join(workspaceRoot, ".driftlens.yml");
  const config = parseConfig(readFileSync(configPath, "utf8"));
  const { unified, drift } = analyzeProject(files, { config });
  // `analyzeProject` runs `detectDriftUnified` for us; rebind for clarity.
  const report: DriftReport = drift ?? detectDriftUnified(unified, config);
  return { config, unified, query: createQuery(unified), drift: report };
}

/** Recursively collect .ts/.tsx/.js/.jsx/.md (and .spec.md) under root. */
function collectWorkspaceFiles(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === ".git") continue;
        walk(full);
      } else if (/\.(ts|tsx|js|jsx|md)$/.test(entry)) {
        const rel = relative(root, full).split(sep).join("/");
        out.set(rel, readFileSync(full, "utf8"));
      }
    }
  };
  walk(root);
  return out;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

interface ToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: object;
}

const TOOLS: readonly ToolDef[] = [
  {
    name: "query_component",
    description:
      "Return the architecture context subgraph for a service: member modules and their symbols, internal imports, the owner, declared dependencies, governing ADRs and targeting specs. Use this to answer 'what is the architecture of <service>?'. Responses are capped at ~4000 tokens; pass the returned cursor to page forward.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Service name (matches .driftlens.yml)." },
        cursor: { type: "string", description: "Opaque cursor returned by a previous call to page forward." },
      },
      required: ["name"],
    },
  },
  {
    name: "find_owners",
    description:
      "For a file path or symbol (path#name), return the ownership chain: file → service → owner. Useful for 'who owns this code?' queries. The input may be a 001-relative POSIX path, or `path#symbol-name`.",
    inputSchema: {
      type: "object",
      properties: {
        file_or_symbol: {
          type: "string",
          description: "Repo-relative POSIX path (e.g. `src/checkout/checkout-service.ts`) or `path#symbol`.",
        },
      },
      required: ["file_or_symbol"],
    },
  },
  {
    name: "get_decision_history",
    description:
      "For a service, return the ADRs that govern it (`decided_by`) plus the specs that target it (`specified_by`). Answers 'what decisions/specs affect this component?'.",
    inputSchema: {
      type: "object",
      properties: {
        component: { type: "string", description: "Service name." },
      },
      required: ["component"],
    },
  },
  {
    name: "get_health",
    description:
      "Return the current architecture health score (0–100) and the full drift report: undeclared dependencies (error), unused declarations (warning), unassigned files (info). No arguments.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

// ── Tool handlers ─────────────────────────────────────────────────────────────

/** Arguments parsed from a `tools/call` request; unknown args are ignored. */
interface ToolArgs {
  readonly name?: string;
  readonly file_or_symbol?: string;
  readonly component?: string;
  readonly cursor?: string;
}

/** A single tool result (matches MCP CallToolResult shape; minimal surface). */
export interface ToolResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly isError?: boolean;
}

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}
function err(message: string): ToolResult {
  return { content: [{ type: "text", text: `DriftLens error: ${message}` }], isError: true };
}

/**
 * Run a tool by name against `ctx`. Pure: no I/O. Exported so tests can drive
 * handlers directly without booting the stdio server.
 */
export function runTool(tool: string, args: ToolArgs, ctx: WorkspaceContext): ToolResult {
  switch (tool) {
    case "query_component":
      return runQueryComponent(args, ctx);
    case "find_owners":
      return runFindOwners(args, ctx);
    case "get_decision_history":
      return runGetDecisionHistory(args, ctx);
    case "get_health":
      return runGetHealth(ctx);
    default:
      return err(`unknown tool: ${tool}`);
  }
}

function runQueryComponent(args: ToolArgs, ctx: WorkspaceContext): ToolResult {
  const name = args.name;
  if (!name) return err("query_component: `name` is required.");
  const sub = ctx.query.component(name);
  if (!sub.root) return ok(`No service named "${name}". Known services: ${knownServices(ctx)}.`);
  const full = renderComponent(sub, ctx.query);
  const paged = pageFrom(full, args.cursor);
  const capped = capTokens(paged);
  const tail = capped.truncated ? `\n\n_(cursor: ${capped.cursor})_` : "";
  return ok(capped.text + tail);
}

function runFindOwners(args: ToolArgs, ctx: WorkspaceContext): ToolResult {
  const input = args.file_or_symbol;
  if (!input) return err("find_owners: `file_or_symbol` is required.");
  const path = input.includes("#") ? input.slice(0, input.indexOf("#")) : input;
  const service = firstMatchingService(path, ctx.config);
  const owner =
    service === null ? null : (ctx.config.services.find((s) => s.name === service)?.owner ?? null);
  return ok(renderOwners(path, service, owner));
}

function runGetDecisionHistory(args: ToolArgs, ctx: WorkspaceContext): ToolResult {
  const name = args.component;
  if (!name) return err("get_decision_history: `component` is required.");
  const adrs = ctx.query.decisionsFor(name);
  const specs = ctx.query.specsFor(name);
  if (adrs.length === 0 && specs.length === 0) {
    return ok(`No decisions or specs found for "${name}". Known services: ${knownServices(ctx)}.`);
  }
  return ok(capTokens(renderDecisions(name, adrs, specs)).text);
}

function runGetHealth(ctx: WorkspaceContext): ToolResult {
  return ok(capTokens(renderHealth(ctx.drift)).text);
}

function knownServices(ctx: WorkspaceContext): string {
  return ctx.config.services.map((s) => `"${s.name}"`).join(", ");
}

// ── Server bootstrap ──────────────────────────────────────────────────────────

/**
 * Build an MCP `Server` wired with the four tools, backed by `ctx`. Each tool
 * call returns one or more `text` content blocks, optionally `isError: true`.
 * Pure factory (no stdio side effect).
 */
export function buildServer(ctx: WorkspaceContext): Server {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as ToolArgs;
    // `runTool` returns our minimal ToolResult; cast satisfies the SDK's
    // ServerResult union (which our shape is structurally part of).
    return runTool(name, args, ctx) as never;
  });

  return server;
}

/**
 * Stand up the stdio MCP server for a workspace root. Reads files once at
 * startup; tools are read-only thereafter. Resolves when the transport closes.
 */
export async function serveStdio(workspaceRoot: string): Promise<void> {
  const ctx = buildContext(workspaceRoot);
  const server = buildServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The server runs until the client closes stdin; nothing else to do here.
}

// ── CLI entry ─────────────────────────────────────────────────────────────────

/** Resolves `--workspace <path>` (default cwd) into an absolute path. */
export function resolveWorkspace(argv: readonly string[]): string {
  const idx = argv.indexOf("--workspace");
  const raw = idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : process.cwd();
  return resolve(raw as string);
}