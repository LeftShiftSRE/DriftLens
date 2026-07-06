import { describe, expect, it } from "vitest";
import { matchGlob } from "../src/drift/glob.js";

describe("matchGlob", () => {
  it("matches a trailing globstar against nested paths", () => {
    expect(matchGlob("src/checkout/**", "src/checkout/index.ts")).toBe(true);
    expect(matchGlob("src/checkout/**", "src/checkout/deep/nested/file.ts")).toBe(true);
    expect(matchGlob("src/checkout/**", "src/user/index.ts")).toBe(false);
  });

  it("does not let * cross directory boundaries", () => {
    expect(matchGlob("src/*.ts", "src/a.ts")).toBe(true);
    expect(matchGlob("src/*.ts", "src/dir/a.ts")).toBe(false);
  });

  it("supports a leading globstar of any depth including zero", () => {
    expect(matchGlob("**/*.ts", "a.ts")).toBe(true);
    expect(matchGlob("**/*.ts", "a/b/c.ts")).toBe(true);
  });

  it("supports ? for a single non-slash char", () => {
    expect(matchGlob("src/a?.ts", "src/ab.ts")).toBe(true);
    expect(matchGlob("src/a?.ts", "src/a/.ts")).toBe(false);
  });

  it("normalizes windows separators", () => {
    expect(matchGlob("src/checkout/**", "src\\checkout\\index.ts")).toBe(true);
  });
});
