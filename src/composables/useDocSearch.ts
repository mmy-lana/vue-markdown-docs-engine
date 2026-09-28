import { computed, onScopeDispose, ref, watch } from 'vue';
import type { DocItem, SearchIndexRecord, SearchResult } from '@/types';
import { useDocStorage } from '@/composables/useDocStorage';
import { extractFrontmatterSync } from '@/composables/useMarkdownParser';

/**
 * Short tokens are dropped by the default length rule, but they carry real
 * meaning in a technical corpus: `c`, `r` and `go` are language names, and the
 * rest are common shell and framework abbreviations.
 */
const ALLOWED_SHORT_TOKENS = new Set(['c', 'r', 'go', 'js', 'ts', 'py', 'sh', 'ui', 'id', 'rb']);

/** Longest paragraph kept as a search snippet. */
const SNIPPET_LENGTH = 160;

/** Upper bound on rendered results. */
const MAX_RESULTS = 8;

/** Minimum paragraph length worth indexing. */
const MIN_PARAGRAPH_LENGTH = 20;

/** Idle time before a keystroke is turned into a query. */
const DEBOUNCE_MS = 150;

/**
 * Splits text into normalised search tokens.
 *
 * Unicode aware on purpose: `\p{L}` keeps accented and non-Latin words whole,
 * so a query in any script matches the same way Latin text does.
 */
export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (matches === null) return [];
  return matches.filter((token) => token.length > 1 || ALLOWED_SHORT_TOKENS.has(token));
}

/**
 * Strips the most common inline markers so a paragraph reads as prose in a
 * result snippet.
 */
function toPlainText(paragraph: string): string {
  return paragraph.replace(/[#*`_>[\]]/g, '').trim();
}

function bodyOf(doc: DocItem): string {
  try {
    return extractFrontmatterSync(doc.rawContent).body;
  } catch {
    // A document whose frontmatter failed validation is still worth indexing
    // by its raw text rather than being dropped from search entirely.
    return doc.rawContent;
  }
}

/**
 * Builds one record per document root, per heading, and per body paragraph.
 *
 * Headings are read from the document's stored `DocHeading` list rather than
 * re-parsed, so a search hit always carries an anchor that actually exists in
 * the rendered document.
 */
function buildSearchIndex(items: readonly DocItem[]): SearchIndexRecord[] {
  const records: SearchIndexRecord[] = [];

  for (const doc of items) {
    if (doc.isDraft) continue;

    records.push({
      id: `${doc.id}-root`,
      docId: doc.id,
      slug: doc.slug,
      title: doc.title,
      category: doc.category,
      contentSnippet: doc.description || doc.title,
      tokens: tokenize(`${doc.title} ${doc.description} ${doc.category} ${doc.tags.join(' ')}`)
    });

    for (const heading of doc.headings) {
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
    }

    const paragraphs = bodyOf(doc).split(/\n\n+/);
    paragraphs.forEach((paragraph, index) => {
      const clean = toPlainText(paragraph);
      if (clean.length < MIN_PARAGRAPH_LENGTH) return;

      records.push({
        id: `${doc.id}-p-${index}`,
        docId: doc.id,
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        contentSnippet: clean.slice(0, SNIPPET_LENGTH),
        tokens: tokenize(clean)
      });
    });
  }

  return records;
}

/**
 * Module-scope index.
 *
 * The index is a pure derivation of the corpus, and the corpus is already a
 * module-scope ref inside `useDocStorage`. Hoisting it here means the whole
 * document set is tokenised once and the result is cached until a document
 * actually changes, instead of once per caller.
 */
const searchIndex = computed<SearchIndexRecord[]>(() => {
  const { docs } = useDocStorage();
  return buildSearchIndex(docs.value);
});

/**
 * Scores every index record against a tokenised query.
 *
 * Weighting, strongest first: an exact title hit (12), an exact heading hit
 * (10), a category hit (6), an exact token (4), and a token prefix (2). Prefix
 * matches are what let "front" find "frontmatter".
 */
function scoreRecords(queryTokens: readonly string[]): SearchResult[] {
  const scored = new Map<string, SearchResult>();

  for (const record of searchIndex.value) {
    let score = 0;
    const title = record.title.toLowerCase();
    const headingText = record.headingText?.toLowerCase() ?? '';
    const category = record.category.toLowerCase();

    for (const token of queryTokens) {
      if (title.includes(token)) score += 12;
      if (headingText.includes(token)) score += 10;
      if (category.includes(token)) score += 6;
      if (record.tokens.includes(token)) score += 4;
      score += record.tokens.filter((candidate) => candidate.startsWith(token)).length * 2;
    }

    if (score <= 0) continue;

    const key = record.headingAnchor
      ? `${record.docId}-${record.headingAnchor}`
      : `${record.docId}-root`;

    scored.set(key, {
      docId: record.docId,
      slug: record.slug,
      title: record.headingText ? `${record.title} › ${record.headingText}` : record.title,
      category: record.category,
      matchedText: record.contentSnippet,
      score,
      anchor: record.headingAnchor
    });
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, MAX_RESULTS);
}

/**
 * Tokenised, debounced full-text search over the published corpus.
 *
 * `query` is the raw input value; results settle one debounce interval after
 * the last keystroke so that typing a word does not re-score the entire index
 * on every character.
 */
export function useDocSearch() {
  const query = ref<string>('');
  const debouncedQuery = ref<string>('');
  let debounceTimeout: ReturnType<typeof setTimeout> | undefined;

  watch(query, (value) => {
    if (debounceTimeout !== undefined) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      debouncedQuery.value = value.trim();
    }, DEBOUNCE_MS);
  });

  onScopeDispose(() => {
    if (debounceTimeout !== undefined) {
      clearTimeout(debounceTimeout);
    }
  });

  const searchResults = computed<SearchResult[]>(() => {
    const queryTokens = tokenize(debouncedQuery.value);
    if (queryTokens.length === 0) return [];
    return scoreRecords(queryTokens);
  });

  /** `true` once a query has settled and produced nothing. */
  const hasNoResults = computed<boolean>(
    () => debouncedQuery.value.length > 0 && searchResults.value.length === 0
  );

  return {
    query,
    searchResults,
    hasNoResults
  };
}
