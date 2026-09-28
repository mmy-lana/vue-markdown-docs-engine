import { ref } from 'vue';
import MarkdownIt, {
  type MarkdownIt as MarkdownItInstance,
  type MarkdownItOptions,
  type RendererRule,
  type Token
} from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import bashLang from 'shiki/langs/bash.mjs';
import cssLang from 'shiki/langs/css.mjs';
import diffLang from 'shiki/langs/diff.mjs';
import htmlLang from 'shiki/langs/html.mjs';
import javascriptLang from 'shiki/langs/javascript.mjs';
import jsonLang from 'shiki/langs/json.mjs';
import markdownLang from 'shiki/langs/markdown.mjs';
import sqlLang from 'shiki/langs/sql.mjs';
import typescriptLang from 'shiki/langs/typescript.mjs';
import vueLang from 'shiki/langs/vue.mjs';
import yamlLang from 'shiki/langs/yaml.mjs';
import githubDarkTheme from 'shiki/themes/github-dark.mjs';
import githubLightTheme from 'shiki/themes/github-light.mjs';
import DOMPurify from 'dompurify';
import YAML from 'yaml';
import type { CompiledDoc, DocFrontmatter, DocHeading, DocItem } from '@/types';
import { SLUG_REGEX, WORDS_PER_MINUTE, createSlugifier } from '@/types';

/**
 * Frontmatter fence: `---\n<yaml>\n---\n<body>`. Both LF and CRLF line endings
 * are accepted; the closing fence must be followed by the document body.
 */
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Heading levels that are surfaced in the table of contents and search index. */
const TRACKED_HEADING_LEVELS = new Set<number>([2, 3, 4]);

/** Class applied to every rendered heading so it clears the sticky header. */
const HEADING_CLASS = 'doc-heading';

/**
 * Languages bundled with the engine. A fence naming anything else falls back
 * to plain text.
 *
 * Imported one module at a time rather than from the `shiki` barrel, which
 * would pull every bundled grammar and theme into the build output.
 */
const HIGHLIGHT_LANGUAGES = [
  javascriptLang,
  typescriptLang,
  vueLang,
  jsonLang,
  bashLang,
  markdownLang,
  htmlLang,
  cssLang,
  yamlLang,
  diffLang,
  sqlLang
] as const;

const HIGHLIGHT_THEMES = [githubLightTheme, githubDarkTheme] as const;

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

/**
 * In-flight or resolved highlighter, shared across the whole application.
 *
 * Caching the promise rather than the resolved value is what removes the
 * initialisation race: two documents compiled at the same moment await the
 * same bundle instead of each constructing their own WebAssembly instance.
 */
let highlighterPromise: Promise<HighlighterCore | null> | null = null;

/** Languages available to the current highlighter, as a fast lookup set. */
let loadedLanguages = new Set<string>();

function getHighlighter(): Promise<HighlighterCore | null> {
  if (highlighterPromise === null) {
    highlighterPromise = createHighlighterCore({
      themes: [...HIGHLIGHT_THEMES],
      langs: [...HIGHLIGHT_LANGUAGES],
      // The pure-JavaScript regex engine avoids shipping the ~600 kB Oniguruma
      // WebAssembly binary. For the syntax this engine highlights the
      // difference is not perceptible, and the download is not.
      engine: createJavaScriptRegexEngine()
    })
      .then((highlighter) => {
        loadedLanguages = new Set(highlighter.getLoadedLanguages());
        return highlighter;
      })
      .catch((cause: unknown) => {
        // Highlighting is an enhancement, not a requirement. A blocked or
        // failed grammar load degrades every fence to plain text instead of
        // failing the whole document.
        console.error('[vue-docs-engine] Syntax highlighting is unavailable:', cause);
        return null;
      });
  }

  return highlighterPromise;
}

/** Escapes text for safe interpolation into an HTML text node. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Renders a fence when no highlighter is available. */
function renderPlainFence(language: string, code: string): string {
  return `<div class="not-prose doc-code-card my-6 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
    <div class="flex h-11 items-center justify-between border-b border-slate-200 bg-slate-100 px-4 font-mono text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <span>${escapeHtml(language)}</span>
      <button type="button" class="doc-code-copy-btn inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center font-sans text-xs font-medium text-slate-600 hover:text-brand-500 dark:text-slate-300" data-clipboard="${encodeURIComponent(code)}" aria-label="Copy code block">Copy</button>
    </div>
    <div class="overflow-x-auto text-sm"><pre class="m-0 p-4 font-mono"><code>${escapeHtml(code)}</code></pre></div>
  </div>`;
}

/** Renders a highlighted fence inside the engine's code card. */
function renderHighlightedFence(
  highlighter: HighlighterCore,
  language: string,
  code: string
): string {
  // `defaultColor: false` emits both palettes as CSS custom properties, which
  // `style.css` swaps on the `dark` class. No JavaScript re-render is needed
  // when the visitor toggles the theme.
  const highlighted = highlighter.codeToHtml(code, {
    lang: language,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false
  });

  return `<div class="not-prose doc-code-card my-6 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
    <div class="flex h-11 items-center justify-between border-b border-slate-200 bg-slate-100 px-4 font-mono text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <span>${escapeHtml(language)}</span>
      <button type="button" class="doc-code-copy-btn inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center font-sans text-xs font-medium text-slate-600 hover:text-brand-500 dark:text-slate-300" data-clipboard="${encodeURIComponent(code)}" aria-label="Copy code block">Copy</button>
    </div>
    <div class="overflow-x-auto text-sm">${highlighted}</div>
  </div>`;
}

/**
 * Builds a MarkdownIt instance configured for document rendering.
 *
 * A fresh instance per compile keeps the anchor plugin's per-document slug
 * counters and heading callback isolated from any concurrent compile.
 */
function createDocumentParser(
  highlighter: HighlighterCore | null,
  headings: DocHeading[]
): MarkdownItInstance {
  const md = new MarkdownIt(MARKDOWN_PARSER_OPTIONS);

  md.renderer.rules.fence = (
    tokens: Token[],
    index: number
  ): string => {
    const token = tokens[index];
    if (token === undefined) return '';

    const requested = token.info.trim().split(/\s+/)[0] ?? '';
    const language = requested.length > 0 ? requested : 'text';
    const code = token.content;
    const isKnown = loadedLanguages.has(language);

    if (highlighter === null || !isKnown) {
      return renderPlainFence(isKnown ? language : (requested.length > 0 ? requested : 'text'), code);
    }

    return renderHighlightedFence(highlighter, language, code);
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
      const highlighter = await getHighlighter();
      const md = createDocumentParser(highlighter, headings);

      const rawHtml = md.render(body);
      const htmlContent = DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: ['data-clipboard', 'target', 'rel'],
        ADD_TAGS: ['button'],
        // `style` is deliberately permitted: with `html: false` a document can
        // never author markup, so the only inline styles present are the dual
        // theme colour variables Shiki emits. Forbidding them would render
        // every code block colourless.
        FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
        FORBID_ATTR: ['srcset', 'formaction']
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
