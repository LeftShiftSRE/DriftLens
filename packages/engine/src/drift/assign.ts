import type { DriftConfig } from "./config.js";
import { matchGlob } from "./glob.js";

/**
 * Assign a file path to its owning service: the first service (in config
 * declaration order) whose `paths` globs match. Returns `null` when the file
 * belongs to no declared service.
 *
 * This is the single source of truth for file→service membership, shared by the
 * unified graph builder (which emits `member_of` edges) and the drift detector
 * (which classifies cross-service imports) so the two never disagree.
 */
export function firstMatchingService(path: string, config: DriftConfig): string | null {
  for (const svc of config.services) {
    if (svc.paths.some((glob) => matchGlob(glob, path))) return svc.name;
  }
  return null;
}
