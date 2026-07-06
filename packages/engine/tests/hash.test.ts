import { describe, expect, it } from "vitest";
import { fnv1a } from "../src/util/hash.js";

describe("fnv1a", () => {
  it("produces an 8-char lowercase hex string", () => {
    expect(fnv1a("hello")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic across calls", () => {
    expect(fnv1a("export const a = 1;")).toBe(fnv1a("export const a = 1;"));
  });

  it("is sensitive to a single-character change", () => {
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
  });

  it("hashes the empty string to the FNV offset basis", () => {
    expect(fnv1a("")).toBe("811c9dc5");
  });

  it("matches known FNV-1a 32-bit vectors", () => {
    // Classic reference vectors for FNV-1a/32.
    expect(fnv1a("a")).toBe("e40c292c");
    expect(fnv1a("foobar")).toBe("bf9cf968");
  });
});
