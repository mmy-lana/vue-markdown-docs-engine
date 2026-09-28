import { ref } from 'vue';
import MarkdownIt, {
  type MarkdownIt as MarkdownItInstance,
  type MarkdownItOptions,
  type RendererRule,
  type Token
} from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import type { HighlightEngine } from '@/composables/shiki';
import { buildClipboardAttributes } from '@/composables/codeClipboardRegistry';
import DOMPurify from 'dompurify';
import YAML from 'yaml';
import type { CompiledDoc, DocFrontmatter, DocHeading, DocItem } from '@/types';
import { SLUG_REGEX, WORDS_PER_MINUTE, createSlugifier } from '@/types';

/** Opening and closing fence markers for a document's frontmatter block. */
const FRONTMATTER_FENCE = '---';

/** Longest run of fence markers tolerated in place of a single line. */
const MAX_FENCE_RUN = 3;

/** Heading levels that are surfaced in the table of contents and search index. */
const TRACKED_HEADING_LEVELS = new Set<number>([2, 3, 4]);

/** Class applied to every rendered heading so it clears the sticky header. */
const HEADING_CLASS = 'doc-heading';


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
 * Splits a document into its YAML block and markdown body.
 *
 * Implemented with index arithmetic rather than a regular expression so the
 * cost is provably linear in the length of the input. A lazy capture group
 * followed by a line-anchored terminator makes the engine re-enter the
 * pattern at every offset; that is linear in practice but its behaviour is
 * left to the engine, whereas these steps are not. On a multi-megabyte or
 * deliberately malformed document the difference is the difference between a
 * predictable parse and an unpredictable one.
 *
 * Both LF and CRLF line endings are accepted.
 */
function splitFrontmatter(rawContent: string): { yamlBlock: string; body: string } {
  // The opening fence must be the very first thing in the document.
  if (!rawContent.startsWith(FRONTMATTER_FENCE)) {
    throw new Error('Document is missing a YAML frontmatter boundary.');
  }

  let cursor = FRONTMATTER_FENCE.length;

  // An all-fence first line is an empty block, not a document.
  if (cursor < rawContent.length && rawContent[cursor] === FRONTMATTER_FENCE[0]) {
    throw new Error('Document is missing a YAML frontmatter boundary.');
  }

  if (rawContent.startsWith('\r\n', cursor)) {
    cursor += 2;
  } else if (rawContent.startsWith('\n', cursor)) {
    cursor += 1;
  } else {
    throw new Error('Document is missing a YAML frontmatter boundary.');
  }

  const yamlStart = cursor;
  let yamlEnd = -1;
  let bodyStart = -1;

  while (cursor < rawContent.length) {
    let lineEnd = rawContent.indexOf('\n', cursor);
    const atEndOfInput = lineEnd === -1;
    if (atEndOfInput) {
      lineEnd = rawContent.length;
    }

    // Measure the line without its terminator, tolerating a trailing CR.
    let contentEnd = lineEnd;
    if (contentEnd > cursor && rawContent[contentEnd - 1] === '\r') {
      contentEnd -= 1;
    }

    const line = rawContent.slice(cursor, contentEnd);

    if (line === FRONTMATTER_FENCE || (line.length > 0 && line.length <= MAX_FENCE_RUN && /^-+$/.test(line))) {
      yamlEnd = cursor;
      bodyStart = atEndOfInput ? rawContent.length : lineEnd + 1;
      break;
    }

    cursor = atEndOfInput ? rawContent.length : lineEnd + 1;
  }

  if (yamlEnd === -1 || bodyStart === -1) {
    throw new Error('Document is missing a YAML frontmatter boundary.');
  }

  return { yamlBlock: rawContent.slice(yamlStart, yamlEnd), body: rawContent.slice(bodyStart) };
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
  const { yamlBlock, body } = splitFrontmatter(rawContent);

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

/**
 * In-flight or resolved highlighter, shared across the whole application.
 *
 * Caching the promise rather than the resolved value is what removes the
 * initialisation race: two documents compiled at the same moment await the
 * same engine instead of each constructing their own.
 *
 * The engine module is imported dynamically, so neither Shiki nor any grammar
 * sits in the initial bundle.
 */
let enginePromise: Promise<HighlightEngine | null> | null = null;

function getHighlightEngine(): Promise<HighlightEngine | null> {
  if (enginePromise === null) {
    enginePromise = import('@/composables/shiki')
      .then((module) => module.createHighlightEngine())
      .catch((cause: unknown) => {
        // Highlighting is an enhancement, not a requirement. A blocked or
        // failed load degrades every fence to plain text instead of failing
        // the whole document.
        console.error('[vue-docs-engine] Syntax highlighting is unavailable:', cause);
        return null;
      });
  }

  return enginePromise;
}

/**
 * Collects the fence languages a document body will actually render.
 *
 * Grammars are fetched before the synchronous MarkdownIt render runs, because
 * a renderer rule cannot await. Reading the body directly is exact enough:
 * an info string on a closing fence is empty, so it contributes nothing.
 */
function collectFenceLanguages(body: string): Set<string> {
  const languages = new Set<string>();
  const fenceStart = /^ {0,3}(?:`{3,}|~{3,})\s*([^\s`~]*)/;

  for (const line of body.split('\n')) {
    const match = fenceStart.exec(line);
    const language = match?.[1]?.toLowerCase() ?? '';
    if (language.length > 0) {
      languages.add(language);
    }
  }

  return languages;
}

/** Escapes text for safe interpolation into an HTML text node. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The shared chrome around a fenced block. */
function renderCodeCard(language: string, code: string, body: string): string {
  return `<div class="not-prose doc-code-card my-6 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
    <div class="flex h-11 items-center justify-between border-b border-slate-200 bg-slate-100 px-4 font-mono text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <span>${escapeHtml(language)}</span>
      <button type="button" class="doc-code-copy-btn inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center font-sans text-xs font-medium text-slate-600 hover:text-brand-500 dark:text-slate-300" ${buildClipboardAttributes(code)} aria-label="Copy code block">Copy</button>
    </div>
    <div class="overflow-x-auto text-sm">${body}</div>
  </div>`;
}

/** Renders a fence as escaped plain text, with no highlighting applied. */
function renderPlainFence(language: string, code: string): string {
  const body = `<pre class="m-0 p-4 font-mono"><code>${escapeHtml(code)}</code></pre>`;
  return renderCodeCard(language, code, body);
}

/** Renders a highlighted fence inside the engine's code card. */
function renderHighlightedFence(
  engine: HighlightEngine,
  language: string,
  code: string
): string {
  const highlighted = engine.highlight(language, code);
  if (highlighted === null) {
    // The grammar is supported but unavailable; plain text is the contract.
    return renderPlainFence(language, code);
  }
  return renderCodeCard(language, code, highlighted);
}

/**
 * Builds a MarkdownIt instance configured for document rendering.
 *
 * A fresh instance per compile keeps the anchor plugin's per-document slug
 * counters and heading callback isolated from any concurrent compile.
 */
function createDocumentParser(
  engine: HighlightEngine | null,
  headings: DocHeading[]
): MarkdownItInstance {
  const md = new MarkdownIt(MARKDOWN_PARSER_OPTIONS);

  md.renderer.rules.fence = (
    tokens: Token[],
    index: number
  ): string => {
    const token = tokens[index];
    if (token === undefined) return '';

    const requested = (token.info.trim().split(/\s+/)[0] ?? '').toLowerCase();
    const language = requested.length > 0 ? requested : 'text';
    const code = token.content;

    if (engine === null || !engine.canHighlight(language)) {
      return renderPlainFence(language, code);
    }

    return renderHighlightedFence(engine, language, code);
  };

  // Scroll-linked headings must clear the 64px sticky header, which the
  // `.doc-heading` utility provides via scroll-margin-top.
  const headingOpenRule: RendererRule = (tokens, index, options, _env, self) => {
    const token = tokens[index];
    if (token !== undefined) {
      const existing = token.attrGet('class');
      token.attrSet('class', existing !== null ? `${existing} ${HEADING_CLASS}` : HEADING_CLASS);
    }
    return self.renderToken(tokens, index, options);
  };
  md.renderer.rules.heading_open = headingOpenRule;

  md.use(markdownItAnchor, {
    slugify: createSlugifier(),
    getTokensText: extractInlineText,
    permalink: markdownItAnchor.permalink.linkInsideHeader({
      symbol: '#',
      class: 'heading-anchor ml-2 hidden text-slate-400 no-underline hover:text-brand-500 md:inline-flex dark:text-slate-500',
      placement: 'after',
      ariaHidden: false
    }),
    callback: (token: Token, info: { slug: string; title: string }): void => {
      const level = Number(token.tag.replace('h', ''));
      if (!TRACKED_HEADING_LEVELS.has(level)) return;
      headings.push({ id: info.slug, text: info.title, level: level as DocHeading['level'] });
    }
  });

  // Wide tables get their own scroll container so a grid never widens the
  // page on a narrow viewport.
  md.renderer.rules.table_open = (tokens, index, options, _env, self) =>
    `<div class="my-6 overflow-x-auto">\n${self.renderToken(tokens, index, options)}`;
  md.renderer.rules.table_close = (tokens, index, options, _env, self) =>
    `${self.renderToken(tokens, index, options)}\n</div>`;

  return md;
}

/**
 * Compiles a stored document into sanitized, dual-theme HTML.
 *
 * The heading table is produced by the same slugifier and the same inline text
 * extraction that `extractHeadingsSync` uses, so the table of contents stored
 * with the document always matches the anchors in the rendered output.
 *
 * @throws {Error} When the document's frontmatter is missing or invalid.
 */
export function useMarkdownParser() {
  const isCompiling = ref(false);

  async function compileDoc(doc: DocItem): Promise<CompiledDoc> {
    isCompiling.value = true;
    try {
      const { body } = extractFrontmatterSync(doc.rawContent);
      const headings: DocHeading[] = [];
      const engine = await getHighlightEngine();
      if (engine !== null) {
        // Grammars are fetched up front because a renderer rule cannot await.
        await engine.prepare(collectFenceLanguages(body));
      }
      const md = createDocumentParser(engine, headings);

      const rawHtml = md.render(body);
      const htmlContent = DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: ['data-clipboard', 'data-clipboard-ref', 'target', 'rel'],
        ADD_TAGS: ['button'],
        // `style` is deliberately permitted: with `html: false` a document can
        // never author markup, so the only inline styles present are the dual
        // theme colour variables Shiki emits. Forbidding them would render
        // every code block colourless.
        //
        // The rest are removed outright. `svg` and `math` are on the list
        // because each hosts a scripting namespace of its own, and `base` can
        // repoint every relative URL the page resolves. `button` stays allowed
        // because the code card's copy control is emitted by the compiler; the
        // other form controls are not, and cannot appear regardless.
        FORBID_TAGS: [
          'style',
          'script',
          'noscript',
          'template',
          'iframe',
          'frame',
          'frameset',
          'object',
          'embed',
          'applet',
          'form',
          'input',
          'textarea',
          'select',
          'option',
          'base',
          'link',
          'meta',
          'svg',
          'math'
        ],
        FORBID_ATTR: ['srcset', 'formaction', 'ping', 'http-equiv', 'content']
      });

      const words = body.trim().split(/\s+/).filter((word) => word.length > 0).length;

      return {
        ...doc,
        htmlContent,
        headings,
        readingTimeMinutes: Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
      };
    } finally {
      isCompiling.value = false;
    }
  }

  return {
    compileDoc,
    isCompiling
  };
}
