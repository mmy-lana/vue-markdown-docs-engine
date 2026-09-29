# System Specification: vue-markdown-docs-engine (v4.0)

## 1. Toolchain & Configuration Manifests

### 1.1 Dependency Manifest (`package.json`)
```json
{
  "name": "vue-markdown-docs-engine",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "vue": "latest",
    "vue-router": "latest",
    "markdown-it": "latest",
    "markdown-it-anchor": "latest",
    "shiki": "latest",
    "dompurify": "latest",
    "yaml": "latest"
  },
  "devDependencies": {
    "@tailwindcss/typography": "latest",
    "@tailwindcss/vite": "latest",
    "@vitejs/plugin-vue": "latest",
    "tailwindcss": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vue-tsc": "latest"
  }
}
```

### 1.2 Vite Configuration (`vite.config.ts`)
```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});
```

### 1.3 TypeScript Configuration (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue"]
}
```

### 1.4 HTML Shell with Pre-Paint Theme Script (`index.html`)
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Documentation Wiki Engine</title>
    <script>
      (function () {
        try {
          const stored = localStorage.getItem('vue_docs_theme');
          const isDark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
          if (isDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        } catch {}
      })();
    </script>
  </head>
  <body class="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 antialiased min-h-dvh">
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### 1.5 Tailwind v4 Stylesheet Setup (`src/style.css`)
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  --color-brand-50: #f0f7ff;
  --color-brand-100: #e0effe;
  --color-brand-500: #0284c7;
  --color-brand-600: #0369a1;
  --color-brand-700: #075985;
}

:root {
  color-scheme: light;
}

:root.dark {
  color-scheme: dark;
}

.doc-heading {
  scroll-margin-top: 5rem;
}

/* Shiki Dual-Theme Token Rules */
html.dark .shiki,
html.dark .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
  font-style: var(--shiki-dark-font-style) !important;
  font-weight: var(--shiki-dark-font-weight) !important;
  text-decoration: var(--shiki-dark-text-decoration) !important;
}

html:not(.dark) .shiki,
html:not(.dark) .shiki span {
  color: var(--shiki-light) !important;
  background-color: var(--shiki-light-bg) !important;
  font-style: var(--shiki-light-font-style) !important;
  font-weight: var(--shiki-light-font-weight) !important;
  text-decoration: var(--shiki-light-text-decoration) !important;
}
```

---

## 2. Data Schema & Core Utilities (`src/types/index.ts`)

```typescript
export interface DocHeading {
  id: string;
  text: string;
  level: 2 | 3 | 4;
}

export interface DocFrontmatter {
  title: string;
  description: string;
  category: string;
  order: number;
  slug: string;
  tags: string[];
  lastModified: string;
}

export interface DocItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  order: number;
  rawContent: string;
  headings: DocHeading[];
  tags: string[];
  lastModified: string;
  updatedAt: number;
  seedVersion?: number;
  isUserModified?: boolean;
  isDraft: boolean;
}

export interface CompiledDoc extends DocItem {
  htmlContent: string;
  readingTimeMinutes: number;
}

export interface NavLink {
  id: string;
  title: string;
  slug: string;
  order: number;
}

export interface NavGroup {
  id: string;
  name: string;
  order: number;
  items: NavLink[];
}

export interface SearchIndexRecord {
  id: string;
  docId: string;
  slug: string;
  title: string;
  category: string;
  headingAnchor?: string;
  headingText?: string;
  contentSnippet: string;
  tokens: string[];
}

export interface SearchResult {
  docId: string;
  slug: string;
  title: string;
  category: string;
  matchedText: string;
  score: number;
  anchor?: string;
}

export interface DocDraft {
  id: string;
  slug: string;
  title: string;
  category: string;
  rawContent: string;
  lastSavedAt: number;
}

export interface DocStoragePayload {
  schemaVersion: number;
  docs: DocItem[];
  drafts: Record<string, DocDraft>;
  deletedAtMap: Record<string, number>;
  recentSearches: string[];
}

export const CURRENT_SCHEMA_VERSION = 1;
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'doc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

export function createSlugifier(): (text: string) => string {
  const counter = new Map<string, number>();
  return (text: string): string => {
    const clean = text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '');
    const base = `h-${clean || 'section'}`;
    const count = counter.get(base) || 0;
    counter.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}
```

---

## 3. Storage Composable (`src/composables/useDocStorage.ts`)

```typescript
import { ref } from 'vue';
import type { DocItem, DocDraft, DocStoragePayload } from '@/types';
import { CURRENT_SCHEMA_VERSION, SLUG_REGEX, generateId } from '@/types';
import { SEED_DOCS } from '@/data/seedDocs';
import { extractFrontmatterSync } from '@/composables/useMarkdownParser';

const STORAGE_KEY = 'vue_docs_engine_v1';

const docs = ref<DocItem[]>([]);
const drafts = ref<Record<string, DocDraft>>({});
const deletedAtMap = ref<Record<string, number>>({});
const recentSearches = ref<string[]>([]);
const isInitialized = ref(false);

function validateDocShape(item: unknown): item is DocItem {
  if (typeof item !== 'object' || item === null) return false;
  const c = item as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.slug === 'string' &&
    SLUG_REGEX.test(c.slug) &&
    typeof c.title === 'string' &&
    typeof c.description === 'string' &&
    typeof c.category === 'string' &&
    typeof c.order === 'number' &&
    typeof c.rawContent === 'string' &&
    Array.isArray(c.tags) &&
    typeof c.lastModified === 'string' &&
    typeof c.updatedAt === 'number' &&
    typeof c.isDraft === 'boolean'
  );
}

function loadAndReconcile(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      docs.value = structuredClone(SEED_DOCS);
      drafts.value = {};
      deletedAtMap.value = {};
      recentSearches.value = [];
      writeToLocalStorage(docs.value, drafts.value, deletedAtMap.value, recentSearches.value);
      return;
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Corrupt state payload.');
    }

    const payload = parsed as Partial<DocStoragePayload>;
    if (payload.schemaVersion !== CURRENT_SCHEMA_VERSION || !Array.isArray(payload.docs)) {
      throw new Error('Version mismatch or schema invalid.');
    }

    const delMap: Record<string, number> = payload.deletedAtMap && typeof payload.deletedAtMap === 'object'
      ? payload.deletedAtMap
      : {};
    deletedAtMap.value = delMap;

    const validDocs = payload.docs.filter(validateDocShape);
    const existingDocMap = new Map<string, DocItem>(validDocs.map((d) => [d.id, d]));

    SEED_DOCS.forEach((seed) => {
      if (delMap[seed.id]) return;
      const existing = existingDocMap.get(seed.id);
      if (!existing) {
        validDocs.push(structuredClone(seed));
      } else if (
        !existing.isUserModified &&
        seed.seedVersion &&
        (!existing.seedVersion || seed.seedVersion > existing.seedVersion)
      ) {
        const idx = validDocs.findIndex((d) => d.id === seed.id);
        if (idx !== -1) {
          validDocs[idx] = structuredClone(seed);
        }
      }
    });

    docs.value = validDocs;
    drafts.value = payload.drafts && typeof payload.drafts === 'object' ? payload.drafts : {};
    recentSearches.value = Array.isArray(payload.recentSearches)
      ? payload.recentSearches.filter((s): s is string => typeof s === 'string')
      : [];
  } catch (err) {
    console.warn('LocalStorage error. Preserving backup before fallback:', err);
    const corruptData = localStorage.getItem(STORAGE_KEY);
    if (corruptData) {
      try {
        localStorage.setItem(`${STORAGE_KEY}_backup`, corruptData);
      } catch {}
    }
    docs.value = structuredClone(SEED_DOCS);
    drafts.value = {};
    deletedAtMap.value = {};
    recentSearches.value = [];
    writeToLocalStorage(docs.value, drafts.value, deletedAtMap.value, recentSearches.value);
  }
}

function writeToLocalStorage(
  nextDocs: DocItem[],
  nextDrafts: Record<string, DocDraft>,
  nextDelMap: Record<string, number>,
  nextSearches: string[]
): boolean {
  try {
    const payload: DocStoragePayload = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      docs: nextDocs,
      drafts: nextDrafts,
      deletedAtMap: nextDelMap,
      recentSearches: nextSearches
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.error('LocalStorage write failed:', err);
    return false;
  }
}

// Multi-tab synchronization follows Last-Write-Wins (LWW) snapshot replacement.
// Concurrent edits in separate tabs overwrite each other without merging individual fields.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      loadAndReconcile();
    }
  });
}



export function useDocStorage() {
  if (!isInitialized.value) {
    loadAndReconcile();
    isInitialized.value = true;
  }

  function saveDoc(rawMarkdown: string, existingId?: string): { success: boolean; doc?: DocItem; error?: string } {
    let parsedFrontmatter;
    try {
      parsedFrontmatter = extractFrontmatterSync(rawMarkdown).frontmatter;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Invalid frontmatter syntax.' };
    }

    if (!SLUG_REGEX.test(parsedFrontmatter.slug)) {
      return { success: false, error: `Slug "${parsedFrontmatter.slug}" must be kebab-case lowercase.` };
    }

    const collision = docs.value.find((d) => d.slug === parsedFrontmatter.slug && d.id !== existingId);
    if (collision) {
      return { success: false, error: `Slug "${parsedFrontmatter.slug}" is already in use by "${collision.title}".` };
    }

    const targetId = existingId || generateId();
    const now = Date.now();
    const body = extractFrontmatterSync(rawMarkdown).body;
    const headings = extractHeadingsSync(body);

    const updatedDoc: DocItem = {
      id: targetId,
      slug: parsedFrontmatter.slug,
      title: parsedFrontmatter.title,
      description: parsedFrontmatter.description,
      category: parsedFrontmatter.category,
      order: parsedFrontmatter.order,
      rawContent: rawMarkdown,
      headings,
      tags: parsedFrontmatter.tags,
      lastModified: parsedFrontmatter.lastModified,
      updatedAt: now,
      isUserModified: true,
      isDraft: false
    };

    const nextDocs = [...docs.value];
    const idx = nextDocs.findIndex((d) => d.id === targetId);
    if (idx !== -1) {
      nextDocs[idx] = updatedDoc;
    } else {
      nextDocs.push(updatedDoc);
    }

    const nextDrafts = { ...drafts.value };
    delete nextDrafts[targetId];

    const nextDelMap = { ...deletedAtMap.value };
    delete nextDelMap[targetId];

    const persisted = writeToLocalStorage(nextDocs, nextDrafts, nextDelMap, recentSearches.value);
    if (!persisted) {
      return { success: false, error: 'Storage quota exceeded. Failed to write to localStorage.' };
    }

    docs.value = nextDocs;
    drafts.value = nextDrafts;
    deletedAtMap.value = nextDelMap;
    return { success: true, doc: updatedDoc };
  }

  function deleteDoc(id: string): boolean {
    const exists = docs.value.some((d) => d.id === id);
    if (!exists) return false;

    const nextDocs = docs.value.filter((d) => d.id !== id);
    const nextDrafts = { ...drafts.value };
    delete nextDrafts[id];

    const nextDelMap = {
      ...deletedAtMap.value,
      [id]: Date.now()
    };

    const persisted = writeToLocalStorage(nextDocs, nextDrafts, nextDelMap, recentSearches.value);
    if (!persisted) return false;

    docs.value = nextDocs;
    drafts.value = nextDrafts;
    deletedAtMap.value = nextDelMap;
    return true;
  }

  function saveDraft(draft: DocDraft): boolean {
    const nextDrafts = {
      ...drafts.value,
      [draft.id]: {
        ...draft,
        lastSavedAt: Date.now()
      }
    };
    const persisted = writeToLocalStorage(docs.value, nextDrafts, deletedAtMap.value, recentSearches.value);
    if (persisted) {
      drafts.value = nextDrafts;
      return true;
    }
    return false;
  }

  function deleteDraft(id: string): void {
    if (!drafts.value[id]) return;
    const nextDrafts = { ...drafts.value };
    delete nextDrafts[id];
    const persisted = writeToLocalStorage(docs.value, nextDrafts, deletedAtMap.value, recentSearches.value);
    if (persisted) {
      drafts.value = nextDrafts;
    }
  }

  function addRecentSearch(term: string): void {
    const clean = term.trim();
    if (!clean) return;
    const filtered = recentSearches.value.filter((item) => item.toLowerCase() !== clean.toLowerCase());
    const nextSearches = [clean, ...filtered].slice(0, 5);
    const persisted = writeToLocalStorage(docs.value, drafts.value, deletedAtMap.value, nextSearches);
    if (persisted) {
      recentSearches.value = nextSearches;
    }
  }

  return {
    docs,
    drafts,
    recentSearches,
    saveDoc,
    deleteDoc,
    saveDraft,
    deleteDraft,
    addRecentSearch
  };
}
```

---

## 4. Parser & Highlight Engine (`src/composables/useMarkdownParser.ts`)

```typescript
import { ref } from 'vue';
import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import { createHighlighter, type Highlighter } from 'shiki';
import DOMPurify from 'dompurify';
import YAML from 'yaml';
import type { DocFrontmatter, DocHeading, CompiledDoc, DocItem } from '@/types';
import { SLUG_REGEX, slugifyHeading } from '@/types';

export function extractFrontmatterSync(rawContent: string): { frontmatter: DocFrontmatter; body: string } {
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match || !match[1] || match[2] === undefined) {
    throw new Error('Document is missing a YAML frontmatter boundary.');
  }

  const parsedYaml: unknown = YAML.parse(match[1]);
  if (typeof parsedYaml !== 'object' || parsedYaml === null) {
    throw new Error('Frontmatter is not a valid YAML object.');
  }

  const raw = parsedYaml as Record<string, unknown>;
  if (typeof raw.title !== 'string' || raw.title.trim().length === 0) {
    throw new Error('Frontmatter: "title" is required.');
  }
  if (typeof raw.category !== 'string' || raw.category.trim().length === 0) {
    throw new Error('Frontmatter: "category" is required.');
  }

  const slug = String(raw.slug || '').trim();
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(`Frontmatter: "slug" must be valid kebab-case lowercase.`);
  }

  return {
    frontmatter: {
      title: raw.title.trim(),
      description: typeof raw.description === 'string' ? raw.description.trim() : '',
      category: raw.category.trim(),
      order: typeof raw.order === 'number' ? raw.order : 100,
      slug,
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      lastModified: typeof raw.lastModified === 'string' ? raw.lastModified : new Date().toISOString()
    },
    body: match[2]
  };
}

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: ['javascript', 'typescript', 'vue', 'json', 'bash', 'markdown', 'html', 'css', 'yaml']
    });
  }
  return highlighterPromise;
}

export function extractHeadingsSync(body: string): DocHeading[] {
  const md = new MarkdownIt({ html: false, linkify: false });
  const tokens = md.parse(body, {});
  const headings: DocHeading[] = [];
  const slugify = createSlugifier();

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token && token.type === 'heading_open') {
      const level = Number(token.tag.replace('h', '')) as 2 | 3 | 4;
      if (level >= 2 && level <= 4) {
        const nextToken = tokens[i + 1];
        const text = nextToken && nextToken.type === 'inline' ? nextToken.content.trim() : '';
        if (text) {
          headings.push({
            id: slugify(text),
            text,
            level
          });
        }
      }
    }
  }
  return headings;
}

export function useMarkdownParser() {
  const isCompiling = ref(false);

  async function compileDoc(doc: DocItem): Promise<CompiledDoc> {
    isCompiling.value = true;
    try {
      const { body } = extractFrontmatterSync(doc.rawContent);
      const headings: DocHeading[] = [];
      const highlighter = await getHighlighter();
      const slugify = createSlugifier();

      const md = new MarkdownIt({
        html: false,
        linkify: true,
        typographer: true
      });

      md.renderer.rules.fence = (tokens, idx) => {
        const token = tokens[idx];
        if (!token) return '';
        const lang = token.info ? token.info.trim() : 'text';
        const code = token.content;
        const validLang = highlighter.getLoadedLanguages().includes(lang) ? lang : 'text';

        const highlightedHtml = highlighter.codeToHtml(code, {
          lang: validLang,
          themes: {
            light: 'github-light',
            dark: 'github-dark'
          },
          defaultColor: false
        });

        const encodedCode = encodeURIComponent(code);

        return `<div class="not-prose doc-code-card my-6 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-900">
          <div class="h-11 flex items-center justify-between px-4 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-600 dark:text-slate-400">
            <span>${validLang}</span>
            <button type="button" class="doc-code-copy-btn min-h-11 min-w-11 inline-flex items-center justify-center text-xs font-sans font-medium text-slate-600 dark:text-slate-300 hover:text-brand-500" data-clipboard="${encodedCode}" aria-label="Copy code block">
              Copy
            </button>
          </div>
          <div class="overflow-x-auto text-sm">
            ${highlightedHtml}
          </div>
        </div>`;
      };

      md.use(markdownItAnchor, {
        slugify,
        permalink: markdownItAnchor.permalink.linkInsideHeader({
          symbol: '#',
          class: 'heading-anchor hidden md:inline-flex ml-2 text-slate-400 dark:text-slate-500 hover:text-brand-500 no-underline',
          placement: 'after',
          ariaHidden: false
        }),
        callback: (token, { slug, title }) => {
          const level = Number(token.tag.replace('h', '')) as 2 | 3 | 4;
          if (level >= 2 && level <= 4) {
            headings.push({ id: slug, text: title, level });
          }
        }
      });

      const defaultTableOpen = md.renderer.rules.table_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
      const defaultTableClose = md.renderer.rules.table_close || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

      md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
        return `<div class="overflow-x-auto my-6">\n` + defaultTableOpen(tokens, idx, options, env, self);
      };
      md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
        return defaultTableClose(tokens, idx, options, env, self) + `\n</div>`;
      };

      const rawHtml = md.render(body);
      const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: ['data-clipboard', 'target', 'aria-label', 'rel'],
        ADD_TAGS: ['button']
      });

      const words = body.trim().split(/\s+/).length;
      const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));

      return {
        ...doc,
        htmlContent: sanitizedHtml,
        headings,
        readingTimeMinutes
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
```

---

## 5. Token Search & Navigation Composables

```typescript
// src/composables/useDocSearch.ts
import { ref, computed, watch } from 'vue';
import type { DocItem, SearchIndexRecord, SearchResult } from '@/types';
import { slugifyHeading } from '@/types';
import { useDocStorage } from '@/composables/useDocStorage';
import { extractFrontmatterSync } from '@/composables/useMarkdownParser';

const ALLOWED_SHORT_TOKENS = new Set(['c', 'r', 'go', 'js', 'ts', 'py', 'sh', 'ui', 'id']);

export function useDocSearch() {
  const { docs } = useDocStorage();
  const index = ref<SearchIndexRecord[]>([]);
  const rawQuery = ref('');
  const debouncedQuery = ref('');
  let debounceTimeout: number | undefined;

  const query = computed<string>({
    get: () => rawQuery.value,
    set: (val: string) => {
      rawQuery.value = val;
      if (typeof window !== 'undefined') {
        window.clearTimeout(debounceTimeout);
        debounceTimeout = window.setTimeout(() => {
          debouncedQuery.value = val.trim();
        }, 150);
      } else {
        debouncedQuery.value = val.trim();
      }
    }
  });

  function tokenize(str: string): string[] {
    const matches = str.toLowerCase().match(/[\p{L}\p{N}]+/gu);
    if (!matches) return [];
    return matches.filter((token) => token.length > 1 || ALLOWED_SHORT_TOKENS.has(token));
  }

  function buildSearchIndex(items: DocItem[]): void {
    const records: SearchIndexRecord[] = [];

    items.filter((d) => !d.isDraft).forEach((doc) => {
      records.push({
        id: `${doc.id}-root`,
        docId: doc.id,
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        contentSnippet: doc.description || doc.title,
        tokens: tokenize(`${doc.title} ${doc.description} ${doc.category} ${doc.tags.join(' ')}`)
      });

      let body = '';
      try {
        body = extractFrontmatterSync(doc.rawContent).body;
      } catch {
        body = doc.rawContent;
      }

      // Authoritative headings directly from parsed AST to guarantee anchor alignment
      doc.headings.forEach((heading) => {
        records.push({
          id: `${doc.id}-${heading.id}`,
          docId: doc.id,
          slug: doc.slug,
          title: doc.title,
          category: doc.category,
          headingAnchor: heading.id,
          headingText: heading.text,
          contentSnippet: `Section in ${doc.title}: ${heading.text}`,
          tokens: tokenize(`${heading.text} ${doc.title}`)
        });
      });

      const paragraphs = body.split(/\n\n+/);
      paragraphs.forEach((p, idx) => {
        const clean = p.replace(/[#*`_>\[\]]/g, '').trim();
        if (clean.length > 20) {
          records.push({
            id: `${doc.id}-p-${idx}`,
            docId: doc.id,
            slug: doc.slug,
            title: doc.title,
            category: doc.category,
            contentSnippet: clean.slice(0, 160),
            tokens: tokenize(clean)
          });
        }
      });
    });

    index.value = records;
  }

  watch(docs, (newDocs) => buildSearchIndex(newDocs), { immediate: true });

  const searchResults = computed<SearchResult[]>(() => {
    const q = debouncedQuery.value.toLowerCase();
    if (!q) return [];

    const queryTokens = tokenize(q);
    if (queryTokens.length === 0) return [];

    const scoredMap = new Map<string, SearchResult>();

    index.value.forEach((record) => {
      let score = 0;

      queryTokens.forEach((token) => {
        if (record.title.toLowerCase().includes(token)) score += 12;
        if (record.headingText && record.headingText.toLowerCase().includes(token)) score += 10;
        if (record.category.toLowerCase().includes(token)) score += 6;
        if (record.tokens.includes(token)) score += 4;
        const matches = record.tokens.filter((t) => t.startsWith(token)).length;
        score += matches * 2;
      });

      if (score > 0) {
        const key = record.headingAnchor ? `${record.docId}-${record.headingAnchor}` : `${record.docId}-root`;
        const displayTitle = record.headingText ? `${record.title} > ${record.headingText}` : record.title;

        scoredMap.set(key, {
          docId: record.docId,
          slug: record.slug,
          title: displayTitle,
          category: record.category,
          matchedText: record.contentSnippet,
          score,
          anchor: record.headingAnchor
        });
      }
    });

    return Array.from(scoredMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  });

  return {
    query,
    searchResults
  };
}
```

```typescript
// src/composables/useDocNavigation.ts
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { NavGroup, NavLink, DocItem } from '@/types';
import { useDocStorage } from '@/composables/useDocStorage';

export interface PagerLinks {
  prev: NavLink | null;
  next: NavLink | null;
}

export function useDocNavigation() {
  const route = useRoute();
  const { docs } = useDocStorage();

  const currentSlug = computed<string>(() => {
    const param = route.params['slug'];
    return typeof param === 'string' ? param : '';
  });

  const activeDoc = computed<DocItem | null>(() => {
    return docs.value.find((d) => d.slug === currentSlug.value && !d.isDraft) || null;
  });

  const groups = computed<NavGroup[]>(() => {
    const published = docs.value.filter((d) => !d.isDraft);
    const categoryMap = new Map<string, NavLink[]>();

    published.forEach((doc) => {
      const items = categoryMap.get(doc.category) || [];
      items.push({
        id: doc.id,
        title: doc.title,
        slug: doc.slug,
        order: doc.order
      });
      categoryMap.set(doc.category, items);
    });

    const result: NavGroup[] = [];
    let groupIdx = 0;

    categoryMap.forEach((items, categoryName) => {
      items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
      const firstItem = items[0];
      result.push({
        id: `group-${groupIdx++}`,
        name: categoryName,
        order: firstItem ? firstItem.order : 100,
        items
      });
    });

    return result.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  });

  const flatLinks = computed<NavLink[]>(() => {
    return groups.value.flatMap((group) => group.items);
  });

  function getPager(targetSlug: string): PagerLinks {
    const links = flatLinks.value;
    const currentIndex = links.findIndex((item) => item.slug === targetSlug);

    if (currentIndex === -1) {
      return { prev: null, next: null };
    }

    const prev = currentIndex > 0 ? (links[currentIndex - 1] ?? null) : null;
    const next = currentIndex < links.length - 1 ? (links[currentIndex + 1] ?? null) : null;

    return { prev, next };
  }

  const pager = computed<PagerLinks>(() => getPager(currentSlug.value));

  return {
    groups,
    activeDoc,
    currentSlug,
    pager,
    getPager
  };
}
```

```typescript
// src/composables/useTableOfContents.ts
import { ref, onUnmounted } from 'vue';
import type { DocHeading } from '@/types';

export function useTableOfContents() {
  const activeHeadingId = ref<string>('');
  let observer: IntersectionObserver | null = null;

  function initObserver(headings: DocHeading[]): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    activeHeadingId.value = '';
    if (typeof window === 'undefined' || headings.length === 0) return;

    const callback: IntersectionObserverCallback = (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeHeadingId.value = entry.target.id;
          return;
        }
      }
    };

    observer = new IntersectionObserver(callback, {
      rootMargin: '-80px 0px -65% 0px',
      threshold: 0.1
    });

    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) {
        observer?.observe(el);
      }
    });
  }

  function cleanupObserver(): void {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  onUnmounted(() => {
    cleanupObserver();
  });

  return {
    activeHeadingId,
    initObserver,
    cleanupObserver
  };
}
```

---

## 6. UI Components & Layout

### 6.1 Modal Primitive (`src/components/ui/BaseModal.vue`)

```vue
<script setup lang="ts">
import { watch, onUnmounted, ref, nextTick } from 'vue';

const props = defineProps<{
  isOpen: boolean;
  ariaLabel: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const modalContainer = ref<HTMLElement | null>(null);
let previouslyFocusedElement: HTMLElement | null = null;

function trapFocus(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !modalContainer.value) return;

  const focusable = modalContainer.value.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first && last) {
      last.focus();
      e.preventDefault();
    }
  } else {
    if (document.activeElement === last && first) {
      first.focus();
      e.preventDefault();
    }
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.isOpen) {
    emit('close');
  } else if (event.key === 'Tab' && props.isOpen) {
    trapFocus(event);
  }
}

watch(
  () => props.isOpen,
  async (open) => {
    if (typeof document === 'undefined') return;
    if (open) {
      previouslyFocusedElement = document.activeElement as HTMLElement | null;
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeydown);
      await nextTick();
      if (modalContainer.value) {
        const firstFocusable = modalContainer.value.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      }
    } else {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeydown);
      previouslyFocusedElement?.focus();
      previouslyFocusedElement = null;
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
    window.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      :aria-label="ariaLabel"
      aria-modal="true"
    >
      <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" aria-hidden="true" @click="emit('close')" />
      <div
        ref="modalContainer"
        class="relative z-10 w-full max-h-[85dvh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>
```

### 6.2 Header (`src/components/domain/DocHeader.vue`)

```vue
<script setup lang="ts">
import { useTheme } from '@/composables/useTheme';
import BaseKbd from '@/components/ui/BaseKbd.vue';

defineEmits<{
  (e: 'toggle-nav'): void;
  (e: 'open-search'): void;
  (e: 'open-editor'): void;
}>();

const { isDark, toggleTheme } = useTheme();
</script>

<template>
  <header class="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between">
    <div class="flex items-center gap-2 sm:gap-3 min-w-0">
      <button
        type="button"
        class="min-h-11 min-w-11 inline-flex items-center justify-center lg:hidden text-slate-600 dark:text-slate-300"
        aria-label="Open sidebar navigation"
        @click="$emit('toggle-nav')"
      >
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <router-link to="/" class="font-bold text-base sm:text-lg tracking-tight text-slate-900 dark:text-white truncate">
        VueDocs<span class="text-brand-500">.Engine</span>
      </router-link>
    </div>

    <div class="flex items-center gap-1 sm:gap-2 shrink-0">
      <button
        type="button"
        class="min-h-11 px-2.5 sm:px-3 py-1.5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-slate-300 dark:hover:border-slate-700"
        aria-label="Search documentation"
        @click="$emit('open-search')"
      >
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span class="hidden md:inline">Search docs...</span>
        <BaseKbd class="hidden md:inline-block">⌘K</BaseKbd>
      </button>

      <button
        type="button"
        class="min-h-11 px-2.5 sm:px-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-brand-500 inline-flex items-center"
        aria-label="Edit or create document"
        @click="$emit('open-editor')"
      >
        <span class="hidden sm:inline">Edit / New</span>
        <span class="sm:hidden">Edit</span>
      </button>

      <button
        type="button"
        class="min-h-11 min-w-11 inline-flex items-center justify-center text-slate-600 dark:text-slate-300"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleTheme"
      >
        <span v-if="isDark">☀️</span>
        <span v-else>🌙</span>
      </button>
    </div>
  </header>
</template>
```

### 6.3 Document View (`src/views/DocView.vue`)

```vue
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import DocsLayout from '@/layouts/DocsLayout.vue';
import Breadcrumb from '@/components/molecules/Breadcrumb.vue';
import DocPager from '@/components/molecules/DocPager.vue';
import TableOfContents from '@/components/molecules/TableOfContents.vue';
import MobileTocAccordion from '@/components/molecules/MobileTocAccordion.vue';
import { useDocNavigation } from '@/composables/useDocNavigation';
import { useMarkdownParser } from '@/composables/useMarkdownParser';
import { useTableOfContents } from '@/composables/useTableOfContents';
import type { CompiledDoc } from '@/types';

const router = useRouter();
const route = useRoute();
const { activeDoc, currentSlug } = useDocNavigation();
const { compileDoc, isCompiling } = useMarkdownParser();
const { activeHeadingId, initObserver, cleanupObserver } = useTableOfContents();

const compiled = ref<CompiledDoc | null>(null);
let compileRequestId = 0;

async function refreshDocument() {
  const currentReq = ++compileRequestId;
  if (!activeDoc.value) {
    compiled.value = null;
    cleanupObserver();
    return;
  }

  const result = await compileDoc(activeDoc.value);
  if (currentReq === compileRequestId) {
    compiled.value = result;
    await nextTick();
    initObserver(result.headings);

    if (route.hash) {
      const el = document.getElementById(route.hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }
}

watch(() => activeDoc.value, refreshDocument, { immediate: true });

function handleContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement;

  const copyBtn = target.closest('.doc-code-copy-btn') as HTMLButtonElement | null;
  if (copyBtn && copyBtn.dataset['clipboard']) {
    let rawCode = '';
    try {
      rawCode = decodeURIComponent(copyBtn.dataset['clipboard']);
    } catch {
      copyBtn.innerText = 'Error';
      return;
    }

    const executeCopy = (): Promise<void> => {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(rawCode);
      }
      const textArea = document.createElement('textarea');
      textArea.value = rawCode;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success ? Promise.resolve() : Promise.reject(new Error('execCommand failed'));
    };

    executeCopy()
      .then(() => {
        const originalText = copyBtn.innerText;
        copyBtn.innerText = 'Copied';
        setTimeout(() => {
          copyBtn.innerText = originalText;
        }, 2000);
      })
      .catch(() => {
        copyBtn.innerText = 'Failed';
        setTimeout(() => {
          copyBtn.innerText = 'Copy';
        }, 2000);
      });
    return;
  }

  const anchor = target.closest('a') as HTMLAnchorElement | null;
  if (anchor) {
    const href = anchor.getAttribute('href');
    if (href && href.startsWith('/docs/')) {
      event.preventDefault();
      router.push(href);
    } else if (href && /^https?:\/\//.test(href)) {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    }
  }
}
</script>

<template>
  <DocsLayout>
    <div v-if="isCompiling && !compiled" class="py-12 text-center text-slate-500">
      Loading document...
    </div>

    <div v-else-if="!compiled" class="py-12 text-center">
      <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">Document Not Found</h1>
      <p class="mt-2 text-slate-600 dark:text-slate-400">The requested documentation page does not exist or was removed.</p>
    </div>

    <article v-else class="min-w-0 wrap-break-word">
      <Breadcrumb :category="compiled.category" :title="compiled.title" />

      <header class="mt-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          {{ compiled.title }}
        </h1>
        <p v-if="compiled.description" class="mt-3 text-lg text-slate-600 dark:text-slate-400">
          {{ compiled.description }}
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Reading time: {{ compiled.readingTimeMinutes }} min</span>
          <span>•</span>
          <span>Last modified: {{ new Date(compiled.lastModified).toLocaleDateString() }}</span>
        </div>
      </header>

      <div class="xl:hidden my-6">
        <MobileTocAccordion :headings="compiled.headings" :active-id="activeHeadingId" />
      </div>

      <div
        class="prose prose-slate dark:prose-invert max-w-none mt-8"
        v-html="compiled.htmlContent"
        @click="handleContentClick"
      />

      <footer class="mt-12 pt-6 border-t border-slate-200 dark:border-slate-800">
        <DocPager :slug="currentSlug" />
      </footer>
    </article>

    <template #toc>
      <div v-if="compiled">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100 mb-4">
          On this page
        </h2>
        <TableOfContents :headings="compiled.headings" :active-id="activeHeadingId" />
      </div>
    </template>
  </DocsLayout>
</template>
```

---

## 7. Router (`src/router/index.ts`)

```typescript
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import DocView from '@/views/DocView.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/docs/getting-started'
  },
  {
    path: '/docs/:slug',
    name: 'DocView',
    component: DocView
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: DocView
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth' };
    }
    return { top: 0 };
  }
});
```

---

## 8. 5-Phase Sequential Execution Queue

### Phase 1: Toolchain, Configuration & Atomic Local Storage
- [ ] Initialize `package.json` with dependencies and generate `pnpm-lock.yaml`; commit lockfile to repository.
- [ ] Configure `vite.config.ts` registering `@tailwindcss/vite` and `@` alias resolving to `./src`.
- [ ] Set up `tsconfig.json` with `@/*` paths and strict checking flags.
- [ ] Implement `index.html` with anti-flash theme script and `src/style.css` with dual-theme rules.
- [ ] Implement `src/types/index.ts` with `deletedAtMap`, `isUserModified`, and `slugifyHeading`.
- [ ] Implement `src/composables/useDocStorage.ts` ensuring storage persistence write succeeds before reactive states commit.
- [ ] **Verification**: Run `pnpm typecheck` (`vue-tsc --noEmit`). Must yield 0 errors.

### Phase 2: Design Foundation & Accessible UI Primitives
- [ ] Implement `BaseButton.vue`: Minimum `min-h-11 min-w-11` touch target with focus rings.
- [ ] Implement `BaseBadge.vue`: Category and method badges.
- [ ] Implement `BaseInput.vue` and `BaseTextarea.vue`: Form controls with `text-base` avoiding iOS zoom.
- [ ] Implement `BaseKbd.vue`: Keyboard shortcut badge.
- [ ] Implement `BaseModal.vue`: Dialog with focus trap loop, initial focus, focus restore, and Escape dismiss.
- [ ] **Verification**: Run `pnpm typecheck`. Verify Tab navigation loops focus inside the modal dialog.

### Phase 3: Molecules & Navigation Components
- [ ] Implement `Breadcrumb.vue` and `DocPager.vue`.
- [ ] Implement `TableOfContents.vue` with `min-h-11` targets and dynamic active anchor highlighting.
- [ ] Implement `MobileTocAccordion.vue` for viewports under 1280px (`xl:`).
- [ ] Implement `SearchModal.vue` wired to `useDocSearch` with keyboard arrow support.
- [ ] **Verification**: Run `pnpm typecheck`.

### Phase 4: AST Pipeline, Highlighting & Domain Logic
- [ ] Implement `src/composables/useMarkdownParser.ts`:
  - Cache `highlighterPromise` to eliminate concurrent initialization races.
  - Override `md.renderer.rules.fence` with dual-theme rendering and `.not-prose` card wrapper.
  - Use `slugifyHeading` for consistent heading anchors across parser and search.
  - Sanitize markup via `DOMPurify`.
- [ ] Implement `src/composables/useDocSearch.ts` using Unicode matching and allowing short technical tokens (`c`, `r`, `go`).
- [ ] Implement `src/composables/useDocNavigation.ts` and `src/composables/useTableOfContents.ts`.
- [ ] Implement `DocSidebar.vue` and `DocEditorModal.vue` with tabbed editing on mobile and split view on `md:`.
- [ ] **Verification**: Run `pnpm typecheck`. Verify duplicate headings receive unique `h-` slugs without collision.

### Phase 5: Assembly & Multi-Device Responsive Testing
- [ ] Assemble `DocHeader.vue` with responsive collapsing of search button at 360px.
- [ ] Assemble `DocsLayout.vue` with `lg:ml-64 xl:ml-72 xl:mr-72` main column offsets.
- [ ] Assemble `DocView.vue` with guarded `decodeURIComponent`, `execCommand` error handling, and `/docs/` link router pushes.
- [ ] Wire `router/index.ts`, `App.vue`, and `main.ts`.
- [ ] Multi-viewport test matrix:
  - 360px: Verify header items fit without horizontal page scrolling; search button collapses to icon.
  - 390px: Verify touch targets adhere to min 44px (`min-h-11 min-w-11`).
  - 430px: Verify code block horizontal scrolling operates without expanding layout width.
  - 768px: Verify drawer toggle and search palette operation.
  - 1024px: Verify left navigation column renders and right TOC is hidden.
  - 1280px+: Verify 3-column layout with sticky right TOC.
- [ ] **Verification**: Run `pnpm typecheck` and `pnpm build`. Production build must execute cleanly with zero errors.