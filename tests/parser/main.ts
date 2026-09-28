import { createApp, defineComponent, h } from 'vue';
import { useMarkdownParser, extractFrontmatterSync, extractHeadingsSync } from '@/composables/useMarkdownParser';
import { SEED_DOCS } from '@/data/seedDocs';
import type { DocItem } from '@/types';
import '@/style.css';

const { compileDoc } = useMarkdownParser();

const results: Record<string, unknown> = { seeds: [] as unknown[] };
(globalThis as unknown as { __probe: Record<string, unknown> }).__probe = results;

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
