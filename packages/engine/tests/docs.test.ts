import { describe, expect, it } from "vitest";
import {
  adrId,
  buildDocGraph,
  documentId,
  isAdrPath,
  resolveDocLink,
} from "../src/ingest/docs.js";
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

describe("ADR detection and ids", () => {
  it("detects the adr/NNNN-*.md path pattern", () => {
    expect(isAdrPath("docs/adr/0007-checkout-split.md")).toBe(true);
    expect(isAdrPath("adr/0001-thing.md")).toBe(true);
    expect(isAdrPath("docs/architecture.md")).toBe(false);
    expect(isAdrPath("docs/adr/README.md")).toBe(false);
  });

  it("derives stable slug/path ids", () => {
    expect(adrId("docs/adr/0007-checkout-split.md")).toBe("adr:0007-checkout-split");
    expect(documentId("README.md")).toBe("document:README.md");
  });
});

describe("resolveDocLink", () => {
  it("resolves relative targets against the doc's directory", () => {
    expect(resolveDocLink("docs/adr/0007.md", "../../src/user/user-service.ts", knownFiles)).toBe(
      "src/user/user-service.ts",
    );
  });

  it("strips anchors and query strings", () => {
    expect(
      resolveDocLink("README.md", "./src/checkout/checkout-service.ts#usage", knownFiles),
    ).toBe("src/checkout/checkout-service.ts");
  });

  it("resolves repo-root-relative targets", () => {
    expect(resolveDocLink("README.md", "src/user/user-service.ts", knownFiles)).toBe(
      "src/user/user-service.ts",
    );
  });

  it("ignores off-repo and unresolvable links", () => {
    expect(resolveDocLink("README.md", "https://example.com", knownFiles)).toBeUndefined();
    expect(resolveDocLink("README.md", "mailto:a@b.c", knownFiles)).toBeUndefined();
    expect(resolveDocLink("README.md", "#section", knownFiles)).toBeUndefined();
    expect(resolveDocLink("README.md", "./missing.ts", knownFiles)).toBeUndefined();
  });
});

describe("buildDocGraph", () => {
  it("emits a document node with references to linked files", () => {
    const g = buildDocGraph(
      [
        {
          path: "README.md",
          source: "# Sample\n\nSee [checkout](./src/checkout/checkout-service.ts).\n",
        },
      ],
      { knownFiles, config },
    );

    const doc = g.nodes.find((n) => n.id === "document:README.md");
    expect(doc).toMatchObject({ kind: "document", label: "Sample" });
    expect(doc!.source.kind).toBe("doc");
    expect(g.edges).toContainEqual(
      expect.objectContaining({
        type: "references",
        from: "document:README.md",
        to: "module:src/checkout/checkout-service.ts",
      }),
    );
    // A plain document produces no decided_by edges.
    expect(g.edges.some((e) => e.type === "decided_by")).toBe(false);
  });

  it("detects an ADR by path and links it to the service its files belong to", () => {
    const g = buildDocGraph(
      [
        {
          path: "docs/adr/0007-checkout-split.md",
          source: [
            "# ADR 0007: Split checkout",
            "- **Status:** Accepted",
            "",
            "Governs [checkout](../../src/checkout/checkout-service.ts).",
          ].join("\n"),
        },
      ],
      { knownFiles, config },
    );

    const adr = g.nodes.find((n) => n.id === "adr:0007-checkout-split");
    expect(adr).toMatchObject({ kind: "adr", label: "ADR 0007: Split checkout" });
    expect(g.edges).toContainEqual(
      expect.objectContaining({
        type: "decided_by",
        from: "service:checkout",
        to: "adr:0007-checkout-split",
      }),
    );
  });

  it("detects an ADR by frontmatter status and reads status/date", () => {
    const g = buildDocGraph(
      [
        {
          path: "docs/decisions/no-pattern.md",
          source: ["---", "status: Proposed", "date: 2026-07-07", "---", "# A decision"].join("\n"),
        },
      ],
      { knownFiles, config },
    );
    const adr = g.nodes[0]!;
    expect(adr.kind).toBe("adr");
    expect(adr.data).toMatchObject({ status: "Proposed", date: "2026-07-07" });
  });

  it("links an ADR to services named only in frontmatter", () => {
    const g = buildDocGraph(
      [
        {
          path: "adr/0009-cross.md",
          source: ["---", "status: Accepted", "components: [checkout, user]", "---", "# Cross"].join(
            "\n",
          ),
        },
      ],
      { knownFiles, config },
    );
    const targets = g.edges
      .filter((e) => e.type === "decided_by")
      .map((e) => e.from)
      .sort();
    expect(targets).toEqual(["service:checkout", "service:user"]);
  });

  it("omits decided_by when no config is supplied but still emits references", () => {
    const g = buildDocGraph(
      [
        {
          path: "adr/0001-x.md",
          source: "# X\n\n[a](../src/user/user-service.ts)\n",
        },
      ],
      { knownFiles },
    );
    expect(g.edges.some((e) => e.type === "decided_by")).toBe(false);
    expect(g.edges.some((e) => e.type === "references")).toBe(true);
  });

  it("is deterministic and canonically sorted regardless of input order", () => {
    const inputs = [
      { path: "b.md", source: "# B\n" },
      { path: "a.md", source: "# A\n" },
    ];
    const a = buildDocGraph(inputs, { knownFiles, config });
    const b = buildDocGraph([...inputs].reverse(), { knownFiles, config });
    expect(a).toEqual(b);
    expect(a.nodes.map((n) => n.id)).toEqual([...a.nodes.map((n) => n.id)].sort());
  });
});
