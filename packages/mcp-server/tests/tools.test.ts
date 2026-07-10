import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContext, runTool, type WorkspaceContext } from "../src/server.js";
import { MAX_TOKENS } from "../src/tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(here, "..", "..", "..", "examples", "sample-repo");

function ctx(): WorkspaceContext {
  return buildContext(SAMPLE);
}

function text(result: ReturnType<typeof runTool>): string {
  return result.content[0]!.text;
}

describe("tool: query_component", () => {
  it("returns the service subgraph with members, owner, ADRs, and specs", () => {
    const r = runTool("query_component", { name: "checkout" }, ctx());
    expect(r.isError).toBeFalsy();
    const t = text(r);
    expect(t).toContain("# Component: checkout");
    expect(t).toContain("**Owner:** marcus");
    expect(t).toContain("`src/checkout/checkout-service.ts`");
    expect(t).toContain("CheckoutService");
    expect(t).toContain("ADR 0002");
    expect(t).toContain("Spec 047");
  });

  it("is capped below the per-tool token budget", () => {
    const r = runTool("query_component", { name: "checkout" }, ctx());
    expect(text(r).length).toBeLessThan(MAX_TOKENS * 5);
  });

  it("lists known services when asked for a missing one", () => {
    const r = runTool("query_component", { name: "nope" }, ctx());
    expect(text(r)).toContain("No service named \"nope\"");
    expect(text(r)).toContain("\"checkout\"");
  });

  it("requires `name`", () => {
    const r = runTool("query_component", {}, ctx());
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("name` is required");
  });
});

describe("tool: find_owners", () => {
  it("resolves a file path to its service and owner", () => {
    const r = runTool("find_owners", { file_or_symbol: "src/checkout/checkout-service.ts" }, ctx());
    expect(text(r)).toContain("file: src/checkout/checkout-service.ts");
    expect(text(r)).toContain("service: checkout");
    expect(text(r)).toContain("owner: marcus");
  });

  it("strips a `#symbol` suffix from the input", () => {
    const r = runTool("find_owners", { file_or_symbol: "src/payments/payment-service.ts#PaymentService" }, ctx());
    expect(text(r)).toContain("service: payments");
  });

  it("reports unassigned when the file matches no service glob", () => {
    const r = runTool("find_owners", { file_or_symbol: "scripts/foo.ts" }, ctx());
    expect(text(r)).toContain("service: (unassigned)");
  });

  it("requires `file_or_symbol`", () => {
    const r = runTool("find_owners", {}, ctx());
    expect(r.isError).toBe(true);
  });
});

describe("tool: get_decision_history", () => {
  it("returns ADRs and specs for a known service", () => {
    const r = runTool("get_decision_history", { component: "checkout" }, ctx());
    const t = text(r);
    expect(t).toContain("# Decision history: checkout");
    expect(t).toContain("## ADRs (1)");
    expect(t).toContain("ADR 0002");
    expect(t).toContain("## Targeting specs (1)");
    expect(t).toContain("Spec 047");
  });

  it("tells the agent which services exist when none match", () => {
    const r = runTool("get_decision_history", { component: "ghost" }, ctx());
    expect(text(r)).toContain("No decisions or specs found for \"ghost\"");
  });
});

describe("tool: get_health", () => {
  it("returns the same health score and drift events as the engine", () => {
    const r = runTool("get_health", {}, ctx());
    const t = text(r);
    expect(t).toContain("# Architecture Health: 50%");
    expect(t).toContain("checkout->payments");
    expect(t).toContain("[error] \"checkout\" imports \"payments\"");
    expect(t).toContain("[warning] \"payments\" declares a dependency on \"user\"");
  });
});

describe("tool dispatch", () => {
  it("returns an error for an unknown tool name", () => {
    const r = runTool("frobnicate", {}, ctx());
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("unknown tool: frobnicate");
  });
});
