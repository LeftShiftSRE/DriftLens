// DriftLens MCP server - sample-repo driver (SPEC-020).
// Demonstrates the four context tools against examples/sample-repo without a
// live MCP client (Cursor / Claude Code). Acts as the deterministic surrogate
// for the 'from Cursor, a query returns...' acceptance criterion.
//
// Usage: pnpm --filter @driftlens/mcp-server build && node scripts/mcp-server-sample.mjs
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContext, runTool } from "../packages/mcp-server/dist/server.js";
import { MAX_TOKENS } from "../packages/mcp-server/dist/tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = join(here, "..", "examples", "sample-repo");

const ctx = buildContext(workspace);
const TOOLS = ["query_component", "find_owners", "get_decision_history", "get_health"];

console.log("DriftLens MCP server - sample driver");
console.log("=====================================");
console.log(`Workspace   : ${workspace}`);
console.log(`Unified graph: ${ctx.unified.nodes.length} nodes, ${ctx.unified.edges.length} edges`);
console.log(`Health      : ${ctx.drift.healthScore}%`);
console.log(`Token cap   : ${MAX_TOKENS}`);
console.log();
console.log("Tools");
console.log("------");
console.log(TOOLS.map((t, i) => `  ${i + 1}. ${t}`).join("\n"));
console.log();

function run(name, args) {
  const result = runTool(name, args, ctx);
  console.log("========================================================");
  console.log(`--> ${name}(${Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})`);
  if (result.isError) console.log("(! error response)");
  console.log("--------------------------------------------------------");
  console.log(result.content[0].text);
  console.log();
}

run("query_component", { name: "checkout" });
run("find_owners", { file_or_symbol: "src/checkout/checkout-service.ts" });
run("get_decision_history", { component: "checkout" });
run("get_health", {});
