import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import githubDarkTheme from 'shiki/themes/github-dark.mjs';
import githubLightTheme from 'shiki/themes/github-light.mjs';

/**
 * Syntax highlighting, isolated behind an explicit interface.
 *
 * The engine is created with themes only. Grammars are fetched on demand, so
 * a reader pays for the languages their page actually contains rather than
 * for the union of every language the engine could support. This module is
 * loaded through a dynamic import by the parser, which keeps it out of the
 * initial bundle entirely.
 */

/** A grammar this engine can highlight, with its loader. */
type LanguageLoader = () => Promise<{ default: unknown }>;

const LANGUAGE_LOADERS: Record<string, LanguageLoader> = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  sql: () => import('shiki/langs/sql.mjs')
};

/**
 * Fence identifiers that name a grammar under a different name.
 *
 * Shiki's own loader expanded these automatically. Loading grammars
 * explicitly means owning the mapping, and a fence written as ```ts must
 * keep working exactly as it did before.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  yml: 'yaml',
  md: 'markdown',
  mdx: 'markdown',
  htm: 'html',
  xml: 'html',
  scss: 'css',
  less: 'css',
  patch: 'diff',
  psql: 'sql',
  postgres: 'sql',
  mysql: 'sql'
};

/** Resolves any fence identifier to a grammar key this module can load. */
function resolveLanguage(rawLanguage: string): string | null {
  const normalized = rawLanguage.trim().toLowerCase();
  const canonical = LANGUAGE_ALIASES[normalized] ?? normalized;
  return canonical in LANGUAGE_LOADERS ? canonical : null;
}

/** Highlighted output for a fenced block. */
export interface HighlightEngine {
  /** Whether a fence identifier names a grammar this engine can load. */
  canHighlight(rawLanguage: string): boolean;
  /** Loads every supplied grammar, tolerating individual failures. */
  prepare(languages: Iterable<string>): Promise<void>;
  /**
   * Highlights a block.
   *
   * @returns the dual-theme HTML, or `null` when the language is unsupported
   * or its grammar failed to load. The caller is expected to fall back to
   * plain text rather than failing the document.
   */
  highlight(rawLanguage: string, code: string): string | null;
}

export async function createHighlightEngine(): Promise<HighlightEngine> {
  const highlighter: HighlighterCore = await createHighlighterCore({
    themes: [githubLightTheme, githubDarkTheme],
    langs: [],
    // The pure-JavaScript regex engine avoids shipping the Oniguruma
    // WebAssembly binary. For the syntax this engine highlights the
    // difference is not perceptible, and the download is not.
    engine: createJavaScriptRegexEngine()
  });

  const loaded = new Set<string>();
  const inFlight = new Map<string, Promise<void>>();

  async function loadOne(canonical: string): Promise<void> {
    if (loaded.has(canonical)) return;

    const language = canonical;

    const running = inFlight.get(language);
    if (running !== undefined) {
      await running;
      return;
    }

    const attempt = (async () => {
      try {
        const loader = LANGUAGE_LOADERS[language];
        if (loader === undefined) return;
        const module = await loader();
        await highlighter.loadLanguage(module.default as never);
        loaded.add(language);
      } catch (cause) {
        // A grammar that will not load degrades its own fences to plain text.
        // It must never take the document down with it.
        console.error(`[vue-docs-engine] Grammar "${language}" failed to load:`, cause);
      } finally {
        inFlight.delete(language);
      }
    })();

    inFlight.set(language, attempt);
    await attempt;
  }

  return {
    canHighlight(rawLanguage) {
      return resolveLanguage(rawLanguage) !== null;
    },

    async prepare(languages) {
      const wanted = new Set<string>();
      for (const rawLanguage of languages) {
        const canonical = resolveLanguage(rawLanguage);
        if (canonical !== null) {
          wanted.add(canonical);
        }
      }
      await Promise.all([...wanted].map(loadOne));
    },

    highlight(rawLanguage, code) {
      const canonical = resolveLanguage(rawLanguage);
      if (canonical === null || !loaded.has(canonical)) return null;

      try {
        // `defaultColor: false` emits both palettes as CSS custom properties,
        // which the stylesheet swaps on the `dark` class. Toggling the theme
        // therefore never re-renders a document.
        return highlighter.codeToHtml(code, {
          lang: canonical,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false
        });
      } catch (cause) {
        console.error(`[vue-docs-engine] Highlighting "${canonical}" failed:`, cause);
        return null;
      }
    }
  };
}
