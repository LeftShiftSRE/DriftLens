import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "../src/drift/config.js";

const VALID = `
version: 1
services:
  - name: checkout
    paths:
      - "src/checkout/**"
    owner: marcus
    dependencies:
      - user
  - name: user
    paths:
      - "src/user/**"
`;

describe("parseConfig", () => {
  it("parses a valid document with defaults", () => {
    const config = parseConfig(VALID);
    expect(config.version).toBe(1);
    expect(config.services).toHaveLength(2);
    const checkout = config.services[0]!;
    expect(checkout).toMatchObject({ name: "checkout", owner: "marcus", dependencies: ["user"] });
    // `user` has no dependencies key -> defaults to [].
    expect(config.services[1]!.dependencies).toEqual([]);
  });

  it("rejects a missing services list", () => {
    expect(() => parseConfig("version: 1")).toThrow(ConfigError);
  });

  it("rejects duplicate service names", () => {
    const src = `services:\n  - {name: a, paths: ["a/**"]}\n  - {name: a, paths: ["b/**"]}`;
    expect(() => parseConfig(src)).toThrow(/Duplicate service name/);
  });

  it("rejects empty paths", () => {
    const src = `services:\n  - {name: a, paths: []}`;
    expect(() => parseConfig(src)).toThrow(/non-empty list/);
  });

  it("rejects a dependency on an unknown service", () => {
    const src = `services:\n  - {name: a, paths: ["a/**"], dependencies: ["ghost"]}`;
    expect(() => parseConfig(src)).toThrow(/unknown dependency "ghost"/);
  });

  it("rejects invalid YAML", () => {
    expect(() => parseConfig("services: [oops")).toThrow(ConfigError);
  });
});
