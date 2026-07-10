import { describe, expect, it } from "vitest";
import { capTokens, pageFrom, MAX_TOKENS } from "../src/tokens.js";

describe("capTokens", () => {
  it("returns text unchanged when it fits within the cap", () => {
    const r = capTokens("short text", MAX_TOKENS);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe("short text");
    expect(r.cursor).toBeUndefined();
  });

  it("truncates with a cursor fallback when text exceeds the cap", () => {
    const big = "line\n".repeat(MAX_TOKENS * 4 / 5 + 10);
    const r = capTokens(big, MAX_TOKENS);
    expect(r.truncated).toBe(true);
    expect(r.cursor).toBeDefined();
    expect(Number.parseInt(r.cursor!, 10)).toBeGreaterThan(0);
    expect(r.text).toContain("[truncated");
    const cursor = Number.parseInt(r.cursor!, 10);
    expect(cursor).toBeLessThan(big.length);
  });

  it("cuts on the last newline within the budget when line separators exist", () => {
    // Each "line \n" line is 6 chars; the cap (16000 chars) sits mid-way through
    // a line, so the helper must walk back to the previous newline.
    const big = "line \n".repeat(4000);
    const r = capTokens(big, MAX_TOKENS);
    expect(r.truncated).toBe(true);
    const cursor = Number.parseInt(r.cursor!, 10);
    // `cursor` is the end of the head; `big[cursor]` is the newline the helper
    // cut on (head = big.slice(0, cursor), so big[cursor] === "\n").
    expect(big.slice(cursor, cursor + 1)).toBe("\n");
  });

  it("falls back to a hard char cut when there are no line separators in range", () => {
    const big = "x".repeat(MAX_TOKENS * 4 + 100);
    const r = capTokens(big, MAX_TOKENS);
    expect(r.truncated).toBe(true);
    expect(r.cursor).toBe(String(MAX_TOKENS * 4));
  });

  it("respects a custom cap", () => {
    const r = capTokens("a".repeat(1000), 50);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThan(1000);
  });
});

describe("pageFrom", () => {
  it("returns the text unchanged when cursor is undefined", () => {
    expect(pageFrom("hello", undefined)).toBe("hello");
  });

  it("drops the first cursor bytes", () => {
    expect(pageFrom("hello world", "6")).toBe("world");
  });

  it("clamps to text length (out-of-range cursor returns full text)", () => {
    expect(pageFrom("hi", "9999")).toBe("hi");
    expect(pageFrom("hi", "-1")).toBe("hi");
    expect(pageFrom("hi", "NaN")).toBe("hi");
  });
});
