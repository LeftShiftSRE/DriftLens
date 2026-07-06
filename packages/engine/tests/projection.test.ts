import { describe, expect, it } from "vitest";
import { CodeGraph } from "../src/graph/builder.js";
import type { GraphView } from "../src/graph/model.js";
import { buildUnifiedGraph } from "../src/graph/unified-builder.js";
import { projectCodeGraph } from "../src/graph/project.js";
import { typeScriptParser } from "../src/parser/typescript.js";
import { sampleConfig, sampleFiles } from "./sample.js";

function parse(files: Record<string, string>) {
  return Object.entries(files).map(([path, src]) => typeScriptParser.parse(path, src));
}

/** Order-insensitive normal form: sort nodes and edges by id. */
function normalize(view: GraphView): GraphView {
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { nodes: [...view.nodes].sort(byId), edges: [...view.edges].sort(byId) };
}

function legacySnapshot(parsed: ReturnType<typeof parse>): GraphView {
  const g = new CodeGraph();
  for (const p of parsed) g.setFile(p);
  return g.snapshot();
}

const BATTERY: Record<string, Record<string, string>> = {
  "resolved imports + symbols": {
    "src/a.ts": `import { b } from "./b";\nexport const a = 1;`,
    "src/b.ts": `export const b = 2;`,
  },
  "external + type-only imports": {
    "src/a.ts": `import type { T } from "./b";\nimport React from "react";\nexport class C {}`,
    "src/b.ts": `export type T = number;`,
  },
  "index resolution + re-export": {
    "src/dir/index.ts": `export { thing } from "./thing";`,
    "src/dir/thing.ts": `export const thing = 1;`,
    "src/main.ts": `import { thing } from "./dir";`,
  },
  "unresolved relative import (dropped edge)": {
    "src/a.ts": `import { gone } from "./missing";\nexport const a = 1;`,
  },
};

describe("projectCodeGraph ≡ CodeGraph.snapshot()", () => {
  for (const [name, files] of Object.entries(BATTERY)) {
    it(`matches the legacy graph for: ${name}`, () => {
      const parsed = parse(files);
      const projected = projectCodeGraph(buildUnifiedGraph(parsed));
      expect(normalize(projected)).toEqual(normalize(legacySnapshot(parsed)));
    });
  }

  it("matches the legacy graph for the sample repo", () => {
    const parsed = [...sampleFiles()].map(([path, src]) => typeScriptParser.parse(path, src));
    const projected = projectCodeGraph(buildUnifiedGraph(parsed));
    expect(normalize(projected)).toEqual(normalize(legacySnapshot(parsed)));
  });

  it("is unaffected by whether a config is supplied", () => {
    const parsed = [...sampleFiles()].map(([path, src]) => typeScriptParser.parse(path, src));
    const withConfig = projectCodeGraph(buildUnifiedGraph(parsed, { config: sampleConfig() }));
    const without = projectCodeGraph(buildUnifiedGraph(parsed));
    expect(normalize(withConfig)).toEqual(normalize(without));
  });
});
