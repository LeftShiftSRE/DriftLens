import { parse as parseYaml } from "yaml";

/**
 * A component/service declared in `.driftlens.yml`. Files are assigned to a
 * service by matching any of its `paths` globs. `dependencies` lists the other
 * services this one is *allowed* to depend on.
 */
export interface ServiceSpec {
  readonly name: string;
  readonly paths: readonly string[];
  readonly owner?: string;
  readonly dependencies: readonly string[];
}

/** The parsed, validated `.driftlens.yml` document. */
export interface DriftConfig {
  readonly version: number;
  readonly services: readonly ServiceSpec[];
}

/** Thrown when `.driftlens.yml` is structurally invalid. */
export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

/**
 * Parse and validate a `.driftlens.yml` source string.
 * @throws {ConfigError} on any structural problem, with a human-readable message.
 */
export function parseConfig(source: string): DriftConfig {
  let doc: unknown;
  try {
    doc = parseYaml(source);
  } catch (err) {
    throw new ConfigError(`Invalid YAML: ${(err as Error).message}`);
  }

  if (!isRecord(doc)) throw new ConfigError("Top-level document must be a mapping.");

  const version = doc.version ?? 1;
  if (typeof version !== "number") throw new ConfigError("`version` must be a number.");

  const rawServices = doc.services;
  if (!Array.isArray(rawServices)) throw new ConfigError("`services` must be a list.");

  const seen = new Set<string>();
  const services: ServiceSpec[] = rawServices.map((raw, idx) => {
    if (!isRecord(raw)) throw new ConfigError(`services[${idx}] must be a mapping.`);

    const name = raw.name;
    if (typeof name !== "string" || name.length === 0) {
      throw new ConfigError(`services[${idx}].name must be a non-empty string.`);
    }
    if (seen.has(name)) throw new ConfigError(`Duplicate service name: "${name}".`);
    seen.add(name);

    const paths = raw.paths;
    if (!Array.isArray(paths) || paths.length === 0 || !paths.every((p) => typeof p === "string")) {
      throw new ConfigError(`services[${idx}] ("${name}").paths must be a non-empty list of strings.`);
    }

    const owner = raw.owner;
    if (owner !== undefined && typeof owner !== "string") {
      throw new ConfigError(`services[${idx}] ("${name}").owner must be a string.`);
    }

    const dependencies = raw.dependencies ?? [];
    if (!Array.isArray(dependencies) || !dependencies.every((d) => typeof d === "string")) {
      throw new ConfigError(`services[${idx}] ("${name}").dependencies must be a list of strings.`);
    }

    return {
      name,
      paths: paths as string[],
      ...(owner !== undefined ? { owner } : {}),
      dependencies: dependencies as string[],
    };
  });

  // Referential integrity: every declared dependency must name a real service.
  for (const svc of services) {
    for (const dep of svc.dependencies) {
      if (!seen.has(dep)) {
        throw new ConfigError(`Service "${svc.name}" declares unknown dependency "${dep}".`);
      }
    }
  }

  return { version, services };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
