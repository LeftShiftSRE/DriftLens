/**
 * A tiny, dependency-free Markdown reader.
 *
 * DriftLens ingests prose (READMEs, docs pages, ADRs) to link *architecture
 * intent* to code. For that we need only three things out of a Markdown file:
 * its **frontmatter**, its **section headings**, and its **inline links**. We do
 * NOT need a full CommonMark AST — so, exactly as with the FNV-1a hash and the
 * lightweight import resolver, we avoid the `unified`/`remark` dependency tree
 * and hand-roll a small line scanner. The engine is bundled into the VS Code
 * webview by esbuild (see `docs/adr/0002-engine-bundling.md`); every dependency
 * we don't add is bundle weight we don't ship.
 *
 * The scanner is deliberately conservative:
 * - Fenced code blocks (``` and ~~~) are skipped, so a `# comment` or a
 *   `[x](y)` inside a code sample never becomes a phantom section or link.
 * - Inline code spans (`` `...` ``) are stripped from a line before links are
 *   read, for the same reason.
 * - Only ATX headings (`#`..`######`) are recognized. Setext (underline)
 *   headings are rare in the docs we target and are intentionally out of scope.
 */

import { slug } from "../util/slug.js";

/** A value parsed out of YAML-ish frontmatter. Scalars or simple lists only. */
export type FrontmatterValue = string | readonly string[];

/** One ATX heading, in document order. */
export interface MarkdownSection {
  /** Heading level, 1 (`#`) .. 6 (`######`). */
  readonly depth: number;
  /** Heading text with the leading `#`s and any trailing `#`s removed. */
  readonly title: string;
  /** A GitHub-ish anchor slug for the heading (see {@link slug}). */
  readonly slug: string;
  /** 1-based line number of the heading. */
  readonly line: number;
}

/** One inline `[text](target)` link. */
export interface MarkdownLink {
  /** The link's visible text. */
  readonly text: string;
  /** The raw target as written, e.g. `./svc.ts#usage` or `https://x`. */
  readonly target: string;
  /** 1-based line number the link appears on. */
  readonly line: number;
  /**
   * Index into {@link ParsedMarkdown.sections} of the heading this link falls
   * under, or `-1` for links that appear before the first heading.
   */
  readonly sectionIndex: number;
}

/** The structured result of reading one Markdown file. */
export interface ParsedMarkdown {
  /** Parsed frontmatter (empty when there is no `---` block). */
  readonly frontmatter: Readonly<Record<string, FrontmatterValue>>;
  /** The first level-1 heading's text, when present — a document's title. */
  readonly title?: string;
  readonly sections: readonly MarkdownSection[];
  readonly links: readonly MarkdownLink[];
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s{0,3}(```+|~~~+)/;
const INLINE_CODE = /`[^`]*`/g;
// `[text](target)` with an optional `"title"`; target has no spaces or parens.
const LINK = /\[([^\]]*)\]\(\s*([^()\s]+)(?:\s+"[^"]*")?\s*\)/g;

/**
 * Parse a Markdown source string into {@link ParsedMarkdown}. Pure and
 * deterministic — no I/O. Line numbers are 1-based and count the original
 * source (including any frontmatter block), so they map back to the file.
 */
export function parseMarkdown(source: string): ParsedMarkdown {
  const lines = source.split(/\r?\n/);
  let cursor = 0;

  // ── Frontmatter: a `---` fenced block, only when it is the very first line ──
  let frontmatter: Record<string, FrontmatterValue> = {};
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > 0 && (l.trim() === "---" || l.trim() === "..."));
    if (end !== -1) {
      frontmatter = parseFrontmatter(lines.slice(1, end));
      cursor = end + 1; // skip the closing fence too
    }
  }

  const sections: MarkdownSection[] = [];
  const links: MarkdownLink[] = [];
  let title: string | undefined;
  let inFence = false;
  let fenceMarker = "";
  let currentSection = -1;

  for (let i = cursor; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNo = i + 1;

    // Fenced code blocks toggle scanning off. The closing fence must use the
    // same marker character as the opener (``` closes ```, ~~~ closes ~~~).
    const fence = raw.match(FENCE);
    if (fence) {
      const marker = fence[1]![0]!; // "`" or "~"
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    const heading = raw.match(HEADING);
    if (heading) {
      const depth = heading[1]!.length;
      const text = heading[2]!.trim();
      sections.push({ depth, title: text, slug: slug(text), line: lineNo });
      currentSection = sections.length - 1;
      if (depth === 1 && title === undefined) title = text;
      continue;
    }

    // Strip inline code spans so `[x](y)` inside backticks is not a link.
    const scannable = raw.replace(INLINE_CODE, "");
    LINK.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK.exec(scannable)) !== null) {
      links.push({
        text: m[1]!.trim(),
        target: m[2]!,
        line: lineNo,
        sectionIndex: currentSection,
      });
    }
  }

  return { frontmatter, ...(title !== undefined ? { title } : {}), sections, links };
}

/**
 * Parse the interior lines of a frontmatter block as a tiny YAML subset:
 * `key: scalar`, `key: [a, b]` inline lists, and block lists of `- item`
 * under a bare `key:`. Enough for ADR frontmatter (`status`, `date`,
 * `components`); anything richer is intentionally ignored, not errored.
 */
function parseFrontmatter(body: readonly string[]): Record<string, FrontmatterValue> {
  const out: Record<string, FrontmatterValue> = {};
  let listKey: string | null = null;
  let list: string[] = [];

  const flush = (): void => {
    if (listKey !== null) {
      out[listKey] = list;
      listKey = null;
      list = [];
    }
  };

  for (const line of body) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;

    // A block-list item belonging to the pending `key:`.
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey !== null) {
      list.push(unquote(item[1]!.trim()));
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    flush();

    const key = kv[1]!;
    const value = kv[2]!.trim();

    if (value === "") {
      // Bare `key:` — start collecting a block list on the following lines.
      listKey = key;
      list = [];
    } else if (value.startsWith("[") && value.endsWith("]")) {
      out[key] = splitInlineList(value.slice(1, -1));
    } else {
      out[key] = unquote(value);
    }
  }
  flush();
  return out;
}

function splitInlineList(inner: string): string[] {
  return inner
    .split(",")
    .map((s) => unquote(s.trim()))
    .filter((s) => s.length > 0);
}

function unquote(value: string): string {
  if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'"))) {
    const q = value[0]!;
    if (value.endsWith(q)) return value.slice(1, -1);
  }
  return value;
}
