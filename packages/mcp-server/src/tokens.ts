/**
 * Token budgeting for MCP tool responses (SPEC-020).
 *
 * The acceptance criterion is "<2k tokens". We over-provision with a hard per-tool
 * cap of `MAX_TOKENS` because estimating tokens ahead of time is fuzzy. `capTokens`
 * truncates at the cap and reports whether it did so; callers add a `cursor` so
 * clients can page through oversized responses.
 */

/** Hard per-tool response cap. ~4000 tokens ~= ~16KB text; far above the 2k bar. */
export const MAX_TOKENS = 4000;
/** Rough chars-per-token estimate used to convert a token budget to a char budget. */
const CHARS_PER_TOKEN = 4;

export interface CappedResult {
  /** The text that fits within the budget. */
  readonly text: string;
  /** True iff `text` is shorter than the original; callers should add a cursor. */
  readonly truncated: boolean;
  /** Cursor the client passes back to page forward (opaque to it; meaningful to us). */
  readonly cursor?: string;
}

/** Cap `text` to `maxTokens` (default {@link MAX_TOKENS}). */
export function capTokens(text: string, maxTokens: number = MAX_TOKENS): CappedResult {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return { text, truncated: false };

  const cut = text.lastIndexOf("\n", maxChars);
  const upTo = cut > 0 ? cut : maxChars;
  const head = text.slice(0, upTo);
  return {
    text: head + `\n\n[truncated at ${maxTokens} tokens; pass cursor="${upTo}" to page]`,
    truncated: true,
    cursor: String(upTo),
  };
}

/** Apply a page cursor client-side: drop the first `cursor` bytes of `text`. */
export function pageFrom(text: string, cursor: string | undefined): string {
  if (cursor === undefined) return text;
  const n = Number.parseInt(cursor, 10);
  if (!Number.isFinite(n) || n < 0 || n >= text.length) return text;
  return text.slice(n);
}