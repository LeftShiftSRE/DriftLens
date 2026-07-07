import { describe, expect, it } from "vitest";
import { buildUnifiedGraph } from "../src/graph/unified-builder.js";
import { typeScriptParser } from "../src/parser/typescript.js";
import { parseConfig } from "../src/drift/config.js";

function parse(files: Record<string, string>) {
  return Object.entries(files).map(([path, src]) => typeScriptParser.parse(path, src));
}

describe("buildUnifiedGraph — code nodes/edges", () => {
  const parsed = parse({
    "src/a.ts": `import { b } from "./b";\nimport React from "react";\nexport class Widget {}\nexport function make() {}\nexport const x = 1;`,
    "src/b.ts": `export const b = 2;`,
  });

  it("emits module, class, function, and symbol nodes with code provenance", () => {
    const g = buildUnifiedGraph(parsed);
    const mod = g.nodes.find((n) => n.id === "module:src/a.ts");
    expect(mod).toMatchObject({ kind: "module", label: "a.ts", filePath: "src/a.ts" });
    expect(mod!.source).toMatchObject({ kind: "code", path: "src/a.ts" });
    expect(mod!.source.hash).toMatch(/^[0-9a-f]{8}$/);

    expect(g.nodes.find((n) => n.id === "class:src/a.ts#Widget")).toMatchObject({
      kind: "class",
      definitionKind: "class",
    });
    expect(g.nodes.find((n) => n.id === "function:src/a.ts#make")?.kind).toBe("function");
    expect(g.nodes.find((n) => n.id === "symbol:src/a.ts#x")?.kind).toBe("symbol");
  });

  it("emits contains and imports edges with provenance, plus an external node", () => {
    const g = buildUnifiedGraph(parsed);
    expect(
      g.edges.find((e) => e.type === "contains" && e.to === "class:src/a.ts#Widget"),
    ).toMatchObject({ from: "module:src/a.ts" });

    const imp = g.edges.find((e) => e.type === "imports" && e.to === "module:src/b.ts");
    expect(imp).toMatchObject({ from: "module:src/a.ts", typeOnly: false });
    expect(imp!.source).toMatchObject({ kind: "code", path: "src/a.ts", line: 1 });

    expect(g.nodes.find((n) => n.id === "external:react")?.kind).toBe("external");
    expect(g.edges.some((e) => e.type === "imports" && e.to === "external:react")).toBe(true);
  });

  it("is deterministic and canonically sorted by id", () => {
    const a = buildUnifiedGraph(parsed);
    const b = buildUnifiedGraph([...parsed].reverse());
    expect(a).toEqual(b);
    expect(a.nodes.map((n) => n.id)).toEqual([...a.nodes.map((n) => n.id)].sort());
    expect(a.edges.map((e) => e.id)).toEqual([...a.edges.map((e) => e.id)].sort());
  });
});

describe("buildUnifiedGraph — declared architecture", () => {
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
  const parsed = parse({
    "src/checkout/index.ts": `import { u } from "../user/s";\nexport const c = 1;`,
    "src/user/s.ts": `export const u = 1;`,
  });

  it("emits service, owner, member_of, owns and depends_on from config", () => {
    const g = buildUnifiedGraph(parsed, { config });

    const svc = g.nodes.find((n) => n.id === "service:checkout");
    expect(svc).toMatchObject({ kind: "service", label: "checkout" });
    expect(svc!.data).toMatchObject({ dependencies: ["user"], owner: "marcus" });
    expect(svc!.source.kind).toBe("yaml");

    expect(g.nodes.find((n) => n.id === "owner:marcus")?.kind).toBe("owner");
    expect(g.edges.some((e) => e.type === "owns" && e.from === "owner:marcus" && e.to === "service:checkout")).toBe(true);
    expect(g.edges.some((e) => e.type === "member_of" && e.from === "module:src/checkout/index.ts" && e.to === "service:checkout")).toBe(true);
    expect(g.edges.some((e) => e.type === "depends_on" && e.from === "service:checkout" && e.to === "service:user")).toBe(true);
  });

  it("omits declared-architecture nodes when no config is given", () => {
    const g = buildUnifiedGraph(parsed);
    expect(g.nodes.some((n) => n.kind === "service")).toBe(false);
    expect(g.edges.some((e) => e.type === "member_of")).toBe(false);
  });
});

describe("buildUnifiedGraph — doc ingestion (SPEC-018)", () => {
  const config = parseConfig(`
version: 1
services:
  - name: checkout
    paths: ["src/checkout/**"]
    owner: marcus
`);
  const parsed = parse({
    "src/checkout/index.ts": `export const c = 1;`,
  });

  const docs = [
    { path: "README.md", source: "# Sample\n\n[checkout](./src/checkout/index.ts)\n" },
    {
      path: "docs/adr/0007-split.md",
      source: "# ADR 0007\n- **Status:** Accepted\n\n[svc](../../src/checkout/index.ts)\n",
    },
  ];

  it("merges document/adr nodes and references/decided_by edges into the graph", () => {
    const g = buildUnifiedGraph(parsed, { config, docs });

    expect(g.nodes.find((n) => n.id === "document:README.md")?.kind).toBe("document");
    expect(g.nodes.find((n) => n.id === "adr:0007-split")?.kind).toBe("adr");
    expect(
      g.edges.some((e) => e.type === "references" && e.from === "document:README.md"),
    ).toBe(true);
    expect(
      g.edges.some(
        (e) => e.type === "decided_by" && e.from === "service:checkout" && e.to === "adr:0007-split",
      ),
    ).toBe(true);
    // Still canonically sorted after the merge.
    expect(g.nodes.map((n) => n.id)).toEqual([...g.nodes.map((n) => n.id)].sort());
  });

  it("leaves the graph code-only when no docs are given", () => {
    const g = buildUnifiedGraph(parsed, { config });
    expect(g.nodes.some((n) => n.kind === "document" || n.kind === "adr")).toBe(false);
  });
});
