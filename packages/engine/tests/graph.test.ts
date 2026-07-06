import { describe, expect, it } from "vitest";
import { CodeGraph } from "../src/graph/builder.js";
import { resolveImport } from "../src/graph/resolve.js";
import { typeScriptParser } from "../src/parser/typescript.js";

function graphFrom(files: Record<string, string>): CodeGraph {
  const graph = new CodeGraph();
  for (const [path, src] of Object.entries(files)) {
    graph.setFile(typeScriptParser.parse(path, src));
  }
  return graph;
}

describe("resolveImport", () => {
  const known = new Set(["src/a.ts", "src/dir/index.ts", "src/b.tsx"]);

  it("resolves extensionless relative imports", () => {
    expect(resolveImport("src/main.ts", "./a", known)).toBe("src/a.ts");
  });
  it("resolves directory index imports", () => {
    expect(resolveImport("src/main.ts", "./dir", known)).toBe("src/dir/index.ts");
  });
  it("resolves .js specifiers to .ts files (ESM rewriting)", () => {
    expect(resolveImport("src/main.ts", "./a.js", known)).toBe("src/a.ts");
  });
  it("resolves parent-relative imports", () => {
    expect(resolveImport("src/dir/x.ts", "../a", known)).toBe("src/a.ts");
  });
  it("returns undefined for bare specifiers", () => {
    expect(resolveImport("src/main.ts", "react", known)).toBeUndefined();
  });
  it("returns undefined for unknown targets", () => {
    expect(resolveImport("src/main.ts", "./nope", known)).toBeUndefined();
  });
});

describe("CodeGraph", () => {
  it("builds file nodes, contains edges, and resolved import edges", () => {
    const view = graphFrom({
      "src/a.ts": `import { b } from "./b";\nexport const a = 1;`,
      "src/b.ts": `export const b = 2;`,
    }).snapshot();

    const fileNodes = view.nodes.filter((n) => n.type === "file").map((n) => n.id);
    expect(fileNodes).toEqual(expect.arrayContaining(["src/a.ts", "src/b.ts"]));

    const importEdge = view.edges.find((e) => e.type === "import");
    expect(importEdge).toMatchObject({ source: "src/a.ts", target: "src/b.ts" });

    const containsB = view.edges.find((e) => e.type === "contains" && e.target === "src/b.ts#b");
    expect(containsB).toBeTruthy();
  });

  it("represents bare imports as external nodes", () => {
    const view = graphFrom({ "src/a.ts": `import React from "react";` }).snapshot();
    const ext = view.nodes.find((n) => n.type === "external");
    expect(ext).toMatchObject({ id: "ext:react", label: "react" });
    expect(view.edges.some((e) => e.target === "ext:react")).toBe(true);
  });

  it("supports incremental add and remove", () => {
    const graph = graphFrom({
      "src/a.ts": `import { b } from "./b";`,
      "src/b.ts": `export const b = 2;`,
    });
    expect(graph.snapshot().edges.some((e) => e.type === "import")).toBe(true);

    graph.removeFile("src/b.ts");
    // The import target is gone, so the (now-unresolved relative) edge drops.
    const after = graph.snapshot();
    expect(after.edges.some((e) => e.type === "import" && e.target === "src/b.ts")).toBe(false);
    expect(graph.size).toBe(1);
  });
});
