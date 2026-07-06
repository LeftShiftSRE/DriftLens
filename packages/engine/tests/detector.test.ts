import { describe, expect, it } from "vitest";
import { analyzeProject } from "../src/analyze.js";
import { parseConfig } from "../src/drift/config.js";

const CONFIG = parseConfig(`
version: 1
services:
  - name: checkout
    paths: ["src/checkout/**"]
    dependencies: ["user"]
  - name: user
    paths: ["src/user/**"]
  - name: payments
    paths: ["src/payments/**"]
`);

describe("detectDrift (via analyzeProject)", () => {
  it("reports a perfect score when actual matches declared", () => {
    const files = new Map([
      ["src/checkout/index.ts", `import { getUser } from "../user/service";\nexport const checkout = 1;`],
      ["src/user/service.ts", `export const getUser = () => 1;`],
    ]);
    const { drift } = analyzeProject(files, { config: CONFIG });
    expect(drift!.healthScore).toBe(100);
    expect(drift!.events.filter((e) => e.severity === "error")).toHaveLength(0);
    expect(drift!.serviceOfFile["src/checkout/index.ts"]).toBe("checkout");
  });

  it("flags an undeclared cross-service dependency and lowers the score", () => {
    const files = new Map([
      ["src/checkout/index.ts", `import { charge } from "../payments/api";\nexport const checkout = 1;`],
      ["src/payments/api.ts", `export const charge = () => 1;`],
    ]);
    const { drift } = analyzeProject(files, { config: CONFIG });

    const err = drift!.events.find((e) => e.kind === "undeclared-dependency");
    expect(err).toMatchObject({ source: "checkout", target: "payments", severity: "error" });
    expect(err!.files).toContain("src/checkout/index.ts");
    expect(drift!.violatingEdges).toContain("checkout->payments");
    // 0 compliant, 1 violating -> 0%.
    expect(drift!.healthScore).toBe(0);
  });

  it("warns about a declared-but-unused dependency", () => {
    const files = new Map([
      ["src/checkout/index.ts", `export const checkout = 1;`],
      ["src/user/service.ts", `export const getUser = () => 1;`],
    ]);
    const { drift } = analyzeProject(files, { config: CONFIG });
    const warn = drift!.events.find((e) => e.kind === "unused-declared-dependency");
    expect(warn).toMatchObject({ source: "checkout", target: "user", severity: "warning" });
    // No cross-service edges checked -> score stays at 100.
    expect(drift!.healthScore).toBe(100);
  });

  it("reports files not assigned to any service", () => {
    const files = new Map([["src/orphan/thing.ts", `export const x = 1;`]]);
    const { drift } = analyzeProject(files, { config: CONFIG });
    const info = drift!.events.find((e) => e.kind === "unassigned-file");
    expect(info).toMatchObject({ severity: "info" });
    expect(info!.files).toContain("src/orphan/thing.ts");
  });

  it("mixes compliant and violating edges into a partial score", () => {
    const files = new Map([
      ["src/checkout/a.ts", `import { getUser } from "../user/s";\nexport const a = 1;`],
      ["src/checkout/b.ts", `import { charge } from "../payments/s";\nexport const b = 1;`],
      ["src/user/s.ts", `export const getUser = () => 1;`],
      ["src/payments/s.ts", `export const charge = () => 1;`],
    ]);
    const { drift } = analyzeProject(files, { config: CONFIG });
    // 1 compliant (checkout->user), 1 violating (checkout->payments) -> 50%.
    expect(drift!.healthScore).toBe(50);
  });

  it("analyzes without a config, returning just the graph", () => {
    const files = new Map([["src/a.ts", `export const a = 1;`]]);
    const result = analyzeProject(files);
    expect(result.drift).toBeUndefined();
    expect(result.graph.nodes.some((n) => n.id === "src/a.ts")).toBe(true);
  });
});
