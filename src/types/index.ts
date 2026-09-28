/**
 * Shared domain model for the documentation engine.
 *
 * Everything in this module is intentionally free of Vue, DOM and storage
 * concerns so that it can be imported from composables, components and data
 * modules without creating import cycles.
 */

/** A single in-document heading that participates in the table of contents. */
export interface DocHeading {
  /** Stable anchor id, e.g. `h-getting-started`. Always prefixed with `h-`. */
  id: string;
  /** Human readable heading text, with inline markup already flattened. */
  text: string;
  level: 2 | 3 | 4;
}

/** The validated YAML frontmatter contract every document must satisfy. */
export interface DocFrontmatter {
  title: string;
  description: string;
  category: string;
  order: number;
  slug: string;
  tags: string[];
  lastModified: string;
}

/** A persisted document as stored in the engine's localStorage payload. */
export interface DocItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  order: number;
  /** The complete source document, frontmatter fence included. */
  rawContent: string;
  headings: DocHeading[];
  tags: string[];
  lastModified: string;
  /** Epoch milliseconds of the last successful persistence. */
  updatedAt: number;
  /** Seed revision this document was created from, if it came from a seed. */
  seedVersion?: number;
  /** Once true the document is never overwritten by seed reconciliation. */
  isUserModified?: boolean;
  isDraft: boolean;
}

/** A {@link DocItem} that has been rendered to sanitized HTML. */
export interface CompiledDoc extends DocItem {
  htmlContent: string;
  readingTimeMinutes: number;
}

/** A navigation entry pointing at a single document. */
export interface NavLink {
  id: string;
  title: string;
  slug: string;
  order: number;
}

/** A navigation group; one per document category. */
export interface NavGroup {
  id: string;
  name: string;
  order: number;
  items: NavLink[];
}

/** One searchable unit: a document root, a heading, or a body paragraph. */
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

/** A scored search hit, optionally anchored to a heading inside the document. */
export interface SearchResult {
  docId: string;
  slug: string;
  title: string;
  category: string;
  matchedText: string;
  score: number;
  anchor?: string;
}

/** An autosaved, unpublished work-in-progress. */
export interface DocDraft {
  id: string;
  slug: string;
  title: string;
  category: string;
  rawContent: string;
  lastSavedAt: number;
}

/** The exact shape written to (and expected from) localStorage. */
export interface DocStoragePayload {
  schemaVersion: number;
  docs: DocItem[];
  drafts: Record<string, DocDraft>;
  /** Maps a document id to the epoch ms at which it was deleted. */
  deletedAtMap: Record<string, number>;
  recentSearches: string[];
}

/** Bumped whenever the persisted payload shape changes. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Slugs must be lowercase kebab-case, e.g. `getting-started`. */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Number of recently issued searches kept for the search palette. */
export const MAX_RECENT_SEARCHES = 5;

/** Average adult reading speed used for the reading-time estimate. */
export const WORDS_PER_MINUTE = 200;

/**
 * Generates a collision-resistant identifier, preferring the platform UUID
 * implementation and degrading to a time+random composite when unavailable.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'doc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

/**
 * Normalises arbitrary heading text into a URL-safe anchor segment.
 *
 * Unicode aware on purpose: accented and non-Latin letters are preserved so
 * that a heading such as "Über `refs`" keeps its meaningful words. Every run
 * of non alphanumeric characters collapses into a single hyphen.
 *
 * This is the single source of truth for anchor text; both the synchronous
 * heading extractor and the async compile pipeline feed it through the same
 * function so generated anchors can never drift apart.
 */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Creates a stateful slugifier that guarantees unique anchors within a single
 * document. The first occurrence yields `h-<slug>`; later duplicates are
 * suffixed `-2`, `-3`, and so on.
 *
 * A fresh slugifier must be created per document: it carries the per-document
 * occurrence counters.
 */
export function createSlugifier(): (text: string) => string {
  const counter = new Map<string, number>();
  return (text: string): string => {
    const base = `h-${slugifyHeading(text) || 'section'}`;
    const count = counter.get(base) ?? 0;
    counter.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}
