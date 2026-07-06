import { describe, expect, it } from "vitest";
import { typeScriptParser } from "../src/parser/typescript.js";
import { defaultRegistry } from "../src/parser/registry.js";

describe("TypeScriptParser", () => {
  it("extracts named, default, namespace, and type-only imports", () => {
    const src = `
import { UserService } from "./user-service";
import defaultThing from "../lib/thing";
import * as util from "./util";
import type { Config } from "./config";
`;
    const result = typeScriptParser.parse("src/checkout/index.ts", src);

    expect(result.imports).toHaveLength(4);
    expect(result.imports[0]).toMatchObject({
      moduleSpecifier: "./user-service",
      imported: ["UserService"],
      isTypeOnly: false,
    });
    expect(result.imports[1]).toMatchObject({ imported: ["default"] });
    expect(result.imports[2]).toMatchObject({ imported: ["*"] });
    expect(result.imports[3]).toMatchObject({ moduleSpecifier: "./config", isTypeOnly: true });
  });

  it("extracts classes, methods, functions, interfaces, enums, types, and variables", () => {
    const src = `
export class UserService {
  getById(id: string) { return id; }
  private helper() {}
}
export function makeUser() {}
export interface User { id: string; }
export enum Role { Admin, User }
export type Id = string;
export const VERSION = "1.0.0";
function internalOnly() {}
`;
    const result = typeScriptParser.parse("src/user/service.ts", src);
    const byName = new Map(result.definitions.map((d) => [d.name, d]));

    expect(byName.get("UserService")).toMatchObject({ kind: "class", exported: true });
    expect(byName.get("getById")).toMatchObject({ kind: "method", container: "UserService" });
    expect(byName.get("makeUser")).toMatchObject({ kind: "function", exported: true });
    expect(byName.get("User")).toMatchObject({ kind: "interface", exported: true });
    expect(byName.get("Role")).toMatchObject({ kind: "enum", exported: true });
    expect(byName.get("Id")).toMatchObject({ kind: "type", exported: true });
    expect(byName.get("VERSION")).toMatchObject({ kind: "variable", exported: true });
    expect(byName.get("internalOnly")).toMatchObject({ exported: false });
  });

  it("records exports, including re-exports as import edges", () => {
    const src = `
export { UserService } from "./user-service";
export * from "./types";
const x = 1;
export default x;
`;
    const result = typeScriptParser.parse("src/index.ts", src);

    const exportNames = result.exports.map((e) => e.name);
    expect(exportNames).toContain("UserService");
    expect(exportNames).toContain("default");

    // `export { X } from` and `export * from` become import edges too.
    const specifiers = result.imports.map((i) => i.moduleSpecifier);
    expect(specifiers).toContain("./user-service");
    expect(specifiers).toContain("./types");
  });

  it("captures 1-based line numbers", () => {
    const src = `import { A } from "./a";\nexport class B {}\n`;
    const result = typeScriptParser.parse("f.ts", src);
    expect(result.imports[0]?.line).toBe(1);
    expect(result.definitions[0]?.line).toBe(2);
  });

  it("normalizes windows paths to posix", () => {
    const result = typeScriptParser.parse("src\\a\\b.ts", "export const x = 1;");
    expect(result.path).toBe("src/a/b.ts");
  });

  it("parses tsx without choking on JSX", () => {
    const src = `import React from "react";\nexport const App = () => <div>hi</div>;\n`;
    const result = typeScriptParser.parse("src/App.tsx", src);
    expect(result.imports[0]?.moduleSpecifier).toBe("react");
    expect(result.definitions.some((d) => d.name === "App")).toBe(true);
  });
});

describe("ParserRegistry", () => {
  it("routes by extension and reports support", () => {
    const registry = defaultRegistry();
    expect(registry.supports("a.ts")).toBe(true);
    expect(registry.supports("a.tsx")).toBe(true);
    expect(registry.supports("a.py")).toBe(false);
    expect(registry.parse("a.py", "x = 1")).toBeUndefined();
  });
});
