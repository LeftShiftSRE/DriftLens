import { describe, expect, it } from "vitest";
import { buildSpecGraph, isSpecPath, specId } from "../src/ingest/specs.js";
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

const knownFiles = new Set([
  "src/checkout/checkout-service.ts",
  "src/user/user-service.ts",
]);

describe("spec detection and ids", () => {
  it("detects the *.spec.md filename", () => {
    expect(isSpecPath(".spec/047-guest-checkout.spec.md")).toBe(true);
    expect(isSpecPath("spec/checkout.spec.mdx")).toBe(true);
    expect(isSpecPath("docs/architecture.md")).toBe(false);
    expect(isSpecPath("src/checkout/checkout-service.ts")).toBe(false);
  });

  it("derives a stable slug id from the filename stem (sans .spec)", () => {
    expect(specId(".spec/047-guest-checkout.spec.md")).toBe("spec:047-guest-checkout");
    expect(specId("spec/Checkout Flow.spec.md")).toBe("spec:checkout-flow");
  });
});

describe("buildSpecGraph", () => {
  it("emits a spec node carrying status/owner and links it to the service its files belong to", () => {
    const g = buildSpecGraph(
      [
        {
          path: ".spec/047-guest-checkout.spec.md",
          source: [
            "---",
            "status: in-progress",
            "owner: marcus",
            "---",
            "# Spec 047: Guest checkout",
            "",
            "Touches [checkout](../src/checkout/checkout-service.ts).",
          ].join("\n"),
        },
      ],
      { knownFiles, config },
    );

    const spec = g.nodes.find((n) => n.id === "spec:047-guest-checkout");
    expect(spec).toMatchObject({ kind: "spec", label: "Spec 047: Guest checkout" });
    expect(spec!.source.kind).toBe("spec");
    expect(spec!.data).toMatchObject({ status: "in-progress", owner: "marcus" });
    expect(g.edges).toContainEqual(
      expect.objectContaining({
        type: "specified_by",
        from: "service:checkout",
        to: "spec:047-guest-checkout",
      }),
    );
  });

  it("links a spec to services named only in frontmatter", () => {
    const g = buildSpecGraph(
      [
        {
          path: ".spec/cross.spec.md",
          source: ["---", "components: [checkout, user]", "---", "# Cross-cutting"].join("\n"),
        },
      ],
      { knownFiles, config },
    );
    const targets = g.edges
      .filter((e) => e.type === "specified_by")
      .map((e) => e.from)
      .sort();
    expect(targets).toEqual(["service:checkout", "service:user"]);
  });

  it("takes the union of frontmatter and resolvable links, de-duplicated", () => {
    const g = buildSpecGraph(
      [
        {
          path: ".spec/union.spec.md",
          source: [
            "---",
            "components: [checkout]",
            "---",
            "# Union",
            "",
            "Also touches [user](../src/user/user-service.ts) and",
            "[checkout again](../src/checkout/checkout-service.ts).",
          ].join("\n"),
        },
      ],
      { knownFiles, config },
    );
    const targets = g.edges.filter((e) => e.type === "specified_by").map((e) => e.from).sort();
    expect(targets).toEqual(["service:checkout", "service:user"]);
  });

  it("ignores frontmatter names that are not declared services", () => {
    const g = buildSpecGraph(
      [
        {
          path: ".spec/ghost.spec.md",
          source: ["---", "components: [checkout, nonexistent]", "---", "# Ghost"].join("\n"),
        },
      ],
      { knownFiles, config },
    );
    const targets = g.edges.filter((e) => e.type === "specified_by").map((e) => e.from);
    expect(targets).toEqual(["service:checkout"]);
  });

  it("emits the spec node but no edges when no config is supplied", () => {
    const g = buildSpecGraph(
      [
        {
          path: ".spec/no-config.spec.md",
          source: "# No config\n\n[a](../src/checkout/checkout-service.ts)\n",
        },
      ],
      { knownFiles },
    );
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]!.kind).toBe("spec");
    expect(g.edges).toHaveLength(0);
  });

  it("is deterministic and canonically sorted regardless of input order", () => {
    const inputs = [
      { path: ".spec/b.spec.md", source: "# B\n" },
      { path: ".spec/a.spec.md", source: "# A\n" },
    ];
    const a = buildSpecGraph(inputs, { knownFiles, config });
    const b = buildSpecGraph([...inputs].reverse(), { knownFiles, config });
    expect(a).toEqual(b);
    expect(a.nodes.map((n) => n.id)).toEqual([...a.nodes.map((n) => n.id)].sort());
  });
});
