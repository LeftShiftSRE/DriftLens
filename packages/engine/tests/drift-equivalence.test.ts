import { describe, expect, it } from "vitest";
import { CodeGraph } from "../src/graph/builder.js";
import { buildUnifiedGraph } from "../src/graph/unified-builder.js";
import { detectDrift, detectDriftUnified, type DriftReport } from "../src/drift/detector.js";
import { typeScriptParser } from "../src/parser/typescript.js";
import { sampleConfig, sampleFiles } from "./sample.js";

function parseSample() {
  return [...sampleFiles()].map(([path, src]) => typeScriptParser.parse(path, src));
}

/** The frozen, hand-verified drift report for the checked-in sample repo. */
const EXPECTED_SAMPLE: DriftReport = {
  events: [
    {
      kind: "undeclared-dependency",
      severity: "error",
      message: `"checkout" imports "payments" but does not declare it as a dependency.`,
      source: "checkout",
      target: "payments",
      files: ["src/checkout/checkout-service.ts"],
    },
    {
      kind: "unused-declared-dependency",
      severity: "warning",
      message: `"payments" declares a dependency on "user" that is never used.`,
      source: "payments",
      target: "user",
    },
  ],
  healthScore: 50,
  serviceOfFile: {
    "src/checkout/checkout-service.ts": "checkout",
    "src/payments/payment-service.ts": "payments",
    "src/user/user-service.ts": "user",
  },
  violatingEdges: ["checkout->payments"],
};

describe("drift equivalence (SPEC-016 acceptance)", () => {
  const config = sampleConfig();

  it("the unified detector reproduces the frozen sample-repo report", () => {
    const unified = buildUnifiedGraph(parseSample(), { config });
    expect(detectDriftUnified(unified, config)).toEqual(EXPECTED_SAMPLE);
  });

  it("the legacy detectDrift(GraphView) path yields the identical report", () => {
    const graph = new CodeGraph();
    for (const p of parseSample()) graph.setFile(p);
    expect(detectDrift(graph.snapshot(), config)).toEqual(EXPECTED_SAMPLE);
  });

  it("both paths agree with each other on the sample repo", () => {
    const parsed = parseSample();
    const graph = new CodeGraph();
    for (const p of parsed) graph.setFile(p);
    const viaLegacy = detectDrift(graph.snapshot(), config);
    const viaUnified = detectDriftUnified(buildUnifiedGraph(parsed, { config }), config);
    expect(viaUnified).toEqual(viaLegacy);
  });
});
