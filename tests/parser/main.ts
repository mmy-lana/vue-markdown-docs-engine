import { createApp, defineComponent, h } from 'vue';
import { useMarkdownParser, extractFrontmatterSync, extractHeadingsSync, assertSafeFrontmatterObject } from '@/composables/useMarkdownParser';
import { SEED_DOCS } from '@/data/seedDocs';
import type { DocItem } from '@/types';
import '@/style.css';

const { compileDoc } = useMarkdownParser();

const results: Record<string, unknown> = { seeds: [] as unknown[] };
(globalThis as unknown as { __probe: Record<string, unknown> }).__probe = results;

/**
 * Result shape returned by the frontmatter probes below.
 */
interface FrontmatterProbeResult {
  ok: boolean;
  message: string;
  title: string;
}

/**
 * Runs the real frontmatter parser and reports the outcome as data.
 *
 * `verify-parser.mjs` executes in Node, where the `@` alias does not resolve,
 * so it cannot import this module directly. These probes run inside the
 * bundled page instead, which is what makes the pollution assertions test the
 * shipped code rather than a copy of it.
 */
function probeFrontmatter(raw: string): FrontmatterProbeResult {
  try {
    const parsed = extractFrontmatterSync(raw);
    return { ok: true, message: '', title: parsed.frontmatter.title };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
      title: ''
    };
  }
}

/**
 * Drives the prototype guard with a crafted object.
 *
 * The object is built here rather than in the test because a replacement
 * prototype cannot survive the structured clone across the Playwright
 * boundary: it would arrive as a plain object and the guard would never be
 * asked the question it exists to answer.
 */
function probeReplacedPrototype(): FrontmatterProbeResult {
  const crafted = Object.create({ injected: true }) as Record<string, unknown>;
  crafted.title = 'A';
  crafted.category = 'B';
  crafted.slug = 'a-b';

  try {
    assertSafeFrontmatterObject(crafted);
    return { ok: true, message: '', title: '' };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
      title: ''
    };
  }
}

results.probeFrontmatter = probeFrontmatter;
results.probeReplacedPrototype = probeReplacedPrototype;
results.isPrototypePolluted = (): boolean => ({} as Record<string, unknown>).malicious !== undefined;

const SAMPLE = `## Alpha

Intro paragraph with a [link](https://example.com) and \`inline code\`.

\`\`\`ts
const a: number = 1;
console.log("hi");
\`\`\`

## Alpha

### Beta

| a | b |
| --- | --- |
| 1 | 2 |

\`\`\`not-a-real-language
hello <b>world</b>
\`\`\`

Text with <script>alert(1)</script> and <img src=x onerror=alert(2)>.

[bad](javascript:alert(3))
`;

const doc: DocItem = {
  id: 'x', slug: 'x', title: 'X', description: '', category: 'C', order: 1,
  rawContent: `---\ntitle: T\ncategory: C\nslug: x\n---\n${SAMPLE}`,
  headings: extractHeadingsSync(SAMPLE), tags: [], lastModified: '2026-01-01', updatedAt: 0, isDraft: false
};

const compiled = await compileDoc(doc);
results.sample = {
  headings: compiled.headings,
  html: compiled.htmlContent,
  readingTime: compiled.readingTimeMinutes
};

for (const seed of SEED_DOCS) {
  const c = await compileDoc(seed);
  (results.seeds as unknown[]).push({
    slug: seed.slug,
    stored: seed.headings,
    compiled: c.headings,
    htmlLength: c.htmlContent.length,
    hasScript: c.htmlContent.includes('<script')
  });
}

createApp(defineComponent({
  setup: () => () => h('div', { id: 'content' }, [
    h('div', { class: 'prose max-w-none', 'data-testid': 'content', innerHTML: compiled.htmlContent })
  ])
})).mount('#app');
