import MarkdownIt, { type MarkdownItOptions, type Token } from 'markdown-it';
import YAML from 'yaml';
import type { DocFrontmatter, DocHeading } from '@/types';
import { SLUG_REGEX, createSlugifier } from '@/types';

/**
 * Frontmatter fence: `---\n<yaml>\n---\n<body>`. Both LF and CRLF line endings
 * are accepted; the closing fence must be followed by the document body.
 */
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Heading levels that are surfaced in the table of contents and search index. */
const TRACKED_HEADING_LEVELS = new Set<number>([2, 3, 4]);

/**
 * The single MarkdownIt configuration used by every parsing path.
 *
 * The synchronous heading extractor and the asynchronous compile pipeline must
 * observe byte-identical token streams, otherwise stored `DocHeading` entries
 * would drift away from the anchors rendered into the document. In particular
 * `typographer` rewrites quotes, dashes and ellipses inside the token stream,
 * so it can never be enabled for one path and disabled for the other.
 *
 * `html: false` is a security requirement: raw HTML in document sources is
 * never parsed, and therefore never reaches the sanitizer.
 */
export const MARKDOWN_PARSER_OPTIONS: Readonly<MarkdownItOptions> = Object.freeze({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false
});

/**
 * Shared, stateless MarkdownIt instance used for synchronous extraction.
 * MarkdownIt instances are safe to share: all per-document state lives in the
 * `env` record passed to `parse`.
 */
const extractionParser = new MarkdownIt(MARKDOWN_PARSER_OPTIONS);

/** The result of splitting a document into validated frontmatter and body. */
export interface ParsedMarkdown {
  frontmatter: DocFrontmatter;
  body: string;
}

/**
 * Flattens the inline children of a heading token into plain text.
 *
 * Mirrors the default `getTokensText` of markdown-it-anchor: only literal
 * `text` and `code_inline` children contribute, so emphasis markers, links and
 * images never leak into the table of contents. The compile pipeline reuses
 * this function via markdown-it-anchor's `getTokensText` option, which is what
 * guarantees that `DocHeading.text` and the rendered anchor text stay equal.
 */
export function extractInlineText(children: Token[] | null | undefined): string {
  if (!children) return '';
  return children
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join('')
    .trim();
}

/**
 * Splits a document into its YAML frontmatter and markdown body, validating
 * every field the engine depends on.
 *
 * @throws {Error} When the fence is missing, the YAML is malformed, or a
 * required field is absent or of the wrong type. The message is authored for
 * direct display in the editor's error state.
 */
export function extractFrontmatterSync(rawContent: string): ParsedMarkdown {
  const match = FRONTMATTER_PATTERN.exec(rawContent);
  const yamlBlock = match?.[1];
  const body = match?.[2];

  if (match === null || yamlBlock === undefined || body === undefined) {
    throw new Error('Document is missing a YAML frontmatter boundary.');
  }

  let parsedYaml: unknown;
  try {
    parsedYaml = YAML.parse(yamlBlock);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Frontmatter is not valid YAML: ${detail}`);
  }

  if (typeof parsedYaml !== 'object' || parsedYaml === null || Array.isArray(parsedYaml)) {
    throw new Error('Frontmatter is not a valid YAML mapping.');
  }

  const raw = parsedYaml as Record<string, unknown>;

  if (typeof raw.title !== 'string' || raw.title.trim().length === 0) {
    throw new Error('Frontmatter: "title" is required.');
  }
  if (typeof raw.category !== 'string' || raw.category.trim().length === 0) {
    throw new Error('Frontmatter: "category" is required.');
  }
  if (raw.description !== undefined && typeof raw.description !== 'string') {
    throw new Error('Frontmatter: "description" must be a string.');
  }
  if (raw.order !== undefined && typeof raw.order !== 'number') {
    throw new Error('Frontmatter: "order" must be a number.');
  }
  if (raw.tags !== undefined && !Array.isArray(raw.tags)) {
    throw new Error('Frontmatter: "tags" must be a list of strings.');
  }
  if (raw.lastModified !== undefined && typeof raw.lastModified !== 'string') {
    throw new Error('Frontmatter: "lastModified" must be an ISO date string.');
  }

  const slug = String(raw.slug ?? '').trim();
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      `Frontmatter: "slug" must be lowercase kebab-case (got ${slug.length > 0 ? `"${slug}"` : 'an empty value'}).`
    );
  }

  return {
    frontmatter: {
      title: raw.title.trim(),
      description: typeof raw.description === 'string' ? raw.description.trim() : '',
      category: raw.category.trim(),
      order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : 100,
      slug,
      tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
      lastModified:
        typeof raw.lastModified === 'string' && raw.lastModified.trim().length > 0
          ? raw.lastModified.trim()
          : new Date().toISOString()
    },
    body
  };
}

/**
 * Extracts the level 2-4 headings of a markdown body, in document order, with
 * unique `h-` prefixed anchors.
 *
 * Running this over the very same body the compile pipeline will render keeps
 * the stored table of contents byte-identical to the rendered anchors.
 */
export function extractHeadingsSync(body: string): DocHeading[] {
  const tokens = extractionParser.parse(body, {});
  const slugify = createSlugifier();
  const headings: DocHeading[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.type !== 'heading_open') continue;

    const level = Number(token.tag.replace('h', ''));
    if (!TRACKED_HEADING_LEVELS.has(level)) continue;

    const text = extractInlineText(tokens[index + 1]?.children);
    if (text.length === 0) continue;

    headings.push({
      id: slugify(text),
      text,
      level: level as DocHeading['level']
    });
  }

  return headings;
}
