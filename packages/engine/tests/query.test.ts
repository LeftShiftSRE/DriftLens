import { describe, expect, it } from "vitest";
import { buildUnifiedGraph } from "../src/graph/unified-builder.js";
import { createQuery } from "../src/graph/query.js";
import { typeScriptParser } from "../src/parser/typescript.js";
import { parseConfig } from "../src/drift/config.js";

const config = parseConfig(`
version: 1
services:
  - name: checkout
    paths: ["src/checkout/**"]
    owner: marcus
    dependencies: ["user"]
  - name: user
    paths: ["src/user/**"]
    owner: alice
`);

function build() {
  const parsed = [
    ["src/checkout/index.ts", `import { getUser } from "../user/svc";\nexport class Cart {}\nexport function total() {}`],
    ["src/user/svc.ts", `export const getUser = () => 1;`],
  ].map(([p, s]) => typeScriptParser.parse(p!, s!));
  return createQuery(buildUnifiedGraph(parsed, { config }));
}

describe("createQuery", () => {
  const q = build();

  it("indexes nodes by kind", () => {
    expect(q.nodesByKind("module").map((n) => n.id).sort()).toEqual([
      "module:src/checkout/index.ts",
      "module:src/user/svc.ts",
    ]);
    expect(q.nodesByKind("service")).toHaveLength(2);
    expect(q.nodesByKind("class").map((n) => n.label)).toContain("Cart");
  });

  it("finds module + symbols owned by a file path", () => {
    const kinds = q.findByPath("src/checkout/index.ts").map((n) => n.kind).sort();
    expect(kinds).toEqual(["class", "function", "module"]);
  });

  it("returns directional, edge-typed neighbors", () => {
    const out = q.neighbors("module:src/checkout/index.ts", { edgeType: "imports", direction: "out" });
    expect(out.map((n) => n.id)).toEqual(["module:src/user/svc.ts"]);

    const members = q.neighbors("service:checkout", { edgeType: "member_of", direction: "in" });
    expect(members.map((n) => n.id)).toEqual(["module:src/checkout/index.ts"]);
  });

  it("assembles a component context subgraph", () => {
    const sub = q.component("checkout");
    expect(sub.root?.id).toBe("service:checkout");
    const ids = new Set(sub.nodes.map((n) => n.id));
    expect(ids).toContain("module:src/checkout/index.ts"); // member module
    expect(ids).toContain("class:src/checkout/index.ts#Cart"); // its symbol
    expect(ids).toContain("owner:marcus"); // owner
    expect(ids).toContain("service:user"); // declared dependency target
    expect(sub.edges.some((e) => e.type === "depends_on" && e.to === "service:user")).toBe(true);
    expect(sub.edges.some((e) => e.type === "owns")).toBe(true);
  });

  it("returns an empty subgraph for an unknown component", () => {
    expect(q.component("nope")).toEqual({ nodes: [], edges: [] });
  });
});
