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

function buildWithDocs() {
  const parsed = [
    ["src/checkout/index.ts", `export class Cart {}`],
    ["src/user/svc.ts", `export const getUser = () => 1;`],
  ].map(([p, s]) => typeScriptParser.parse(p!, s!));
  const docs = [
    { path: "README.md", source: "# Sample\n\n[cart](./src/checkout/index.ts)\n" },
    {
      path: "docs/adr/0007-checkout.md",
      source: "# ADR 0007\n- **Status:** Accepted\n\n[svc](../../src/checkout/index.ts)\n",
    },
  ];
  return createQuery(buildUnifiedGraph(parsed, { config, docs }));
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

function buildWithSpecs() {
  const parsed = [
    ["src/checkout/index.ts", `export class Cart {}`],
    ["src/user/svc.ts", `export const getUser = () => 1;`],
  ].map(([p, s]) => typeScriptParser.parse(p!, s!));
  const specs = [
    {
      path: ".spec/047-guest-checkout.spec.md",
      source: ["---", "status: in-progress", "owner: marcus", "components: [checkout]", "---", "# Spec 047"].join("\n"),
    },
  ];
  return createQuery(buildUnifiedGraph(parsed, { config, specs }));
}

describe("createQuery — specs (SPEC-019)", () => {
  const q = buildWithSpecs();

  it("indexes spec nodes by kind with their status/owner", () => {
    const specs = q.nodesByKind("spec");
    expect(specs.map((n) => n.id)).toEqual(["spec:047-guest-checkout"]);
    expect(specs[0]!.data).toMatchObject({ status: "in-progress", owner: "marcus" });
  });

  it("returns the specs targeting a service", () => {
    expect(q.specsFor("checkout").map((n) => n.id)).toEqual(["spec:047-guest-checkout"]);
    expect(q.specsFor("user")).toEqual([]);
  });

  it("pulls the targeting spec into the component subgraph", () => {
    const ids = new Set(q.component("checkout").nodes.map((n) => n.id));
    expect(ids).toContain("spec:047-guest-checkout");
    expect(
      q.component("checkout").edges.some(
        (e) => e.type === "specified_by" && e.to === "spec:047-guest-checkout",
      ),
    ).toBe(true);
  });
});

describe("createQuery — decisions and documents (SPEC-018)", () => {
  const q = buildWithDocs();

  it("returns the ADRs that decide a service", () => {
    expect(q.decisionsFor("checkout").map((n) => n.id)).toEqual(["adr:0007-checkout"]);
    expect(q.decisionsFor("user")).toEqual([]);
  });

  it("returns the docs/adrs that reference a file, by path or node id", () => {
    const byPath = q.documentsFor("src/checkout/index.ts").map((n) => n.id).sort();
    expect(byPath).toEqual(["adr:0007-checkout", "document:README.md"]);
    const byId = q.documentsFor("module:src/checkout/index.ts").map((n) => n.id).sort();
    expect(byId).toEqual(["adr:0007-checkout", "document:README.md"]);
    expect(q.documentsFor("src/user/svc.ts")).toEqual([]);
  });

  it("pulls the deciding ADR into the component subgraph", () => {
    const ids = new Set(q.component("checkout").nodes.map((n) => n.id));
    expect(ids).toContain("adr:0007-checkout");
  });
});
