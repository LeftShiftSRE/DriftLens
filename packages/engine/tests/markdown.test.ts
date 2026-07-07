import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../src/ingest/markdown.js";

describe("parseMarkdown — structure", () => {
  it("extracts sections with depth, slug, and 1-based line", () => {
    const md = parseMarkdown("# Title\n\nsome text\n\n## Setup\n\n### Deep\n");
    expect(md.title).toBe("Title");
    expect(md.sections).toEqual([
      { depth: 1, title: "Title", slug: "title", line: 1 },
      { depth: 2, title: "Setup", slug: "setup", line: 5 },
      { depth: 3, title: "Deep", slug: "deep", line: 7 },
    ]);
  });

  it("strips trailing hashes and only takes the first h1 as title", () => {
    const md = parseMarkdown("# First #\n\n# Second\n");
    expect(md.title).toBe("First");
    expect(md.sections.map((s) => s.title)).toEqual(["First", "Second"]);
  });

  it("attributes links to the heading they appear under", () => {
    const md = parseMarkdown(
      ["# Doc", "[intro](./a.ts)", "## Details", "see [svc](./b.ts) here"].join("\n"),
    );
    expect(md.links).toEqual([
      { text: "intro", target: "./a.ts", line: 2, sectionIndex: 0 },
      { text: "svc", target: "./b.ts", line: 4, sectionIndex: 1 },
    ]);
  });

  it("gives links before any heading a sectionIndex of -1", () => {
    const md = parseMarkdown("preamble [x](./x.ts)\n# Later\n");
    expect(md.links[0]).toMatchObject({ target: "./x.ts", sectionIndex: -1 });
  });

  it("captures link titles' target without the quoted title", () => {
    const md = parseMarkdown('[a](./a.ts "the title")\n');
    expect(md.links[0]!.target).toBe("./a.ts");
  });
});

describe("parseMarkdown — code fences", () => {
  it("ignores headings and links inside fenced blocks", () => {
    const md = parseMarkdown(
      ["# Real", "```bash", "# not a heading", "[not](./nope.ts)", "```", "[yes](./yes.ts)"].join(
        "\n",
      ),
    );
    expect(md.sections.map((s) => s.title)).toEqual(["Real"]);
    expect(md.links.map((l) => l.target)).toEqual(["./yes.ts"]);
  });

  it("only closes a fence with a matching marker", () => {
    const md = parseMarkdown(["~~~", "```", "# still code", "~~~", "# heading"].join("\n"));
    expect(md.sections.map((s) => s.title)).toEqual(["heading"]);
  });

  it("ignores links inside inline code spans", () => {
    const md = parseMarkdown("use `[x](./x.ts)` but link [y](./y.ts)\n");
    expect(md.links.map((l) => l.target)).toEqual(["./y.ts"]);
  });
});

describe("parseMarkdown — frontmatter", () => {
  it("parses scalar keys and leaves line numbers counting from the top", () => {
    const md = parseMarkdown(["---", "status: Accepted", "date: 2026-07-07", "---", "# H"].join("\n"));
    expect(md.frontmatter).toEqual({ status: "Accepted", date: "2026-07-07" });
    expect(md.sections[0]).toMatchObject({ title: "H", line: 5 });
  });

  it("parses inline and block lists", () => {
    const inline = parseMarkdown(["---", "components: [checkout, user]", "---"].join("\n"));
    expect(inline.frontmatter.components).toEqual(["checkout", "user"]);

    const block = parseMarkdown(["---", "services:", "  - checkout", "  - payments", "---"].join("\n"));
    expect(block.frontmatter.services).toEqual(["checkout", "payments"]);
  });

  it("unquotes quoted scalars and ignores non-leading --- rules", () => {
    const md = parseMarkdown(['---', 'title: "Quoted"', '---', "body", "---", "after"].join("\n"));
    expect(md.frontmatter.title).toBe("Quoted");
    // The second `---` is a horizontal rule, not frontmatter — no sections/links lost.
    expect(md.sections).toEqual([]);
  });

  it("returns empty frontmatter when there is no block", () => {
    expect(parseMarkdown("# No frontmatter\n").frontmatter).toEqual({});
  });
});
