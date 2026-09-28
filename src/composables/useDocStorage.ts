import { ref } from 'vue';
import type { DocDraft, DocHeading, DocItem, DocStoragePayload } from '@/types';
import { CURRENT_SCHEMA_VERSION, MAX_RECENT_SEARCHES, SLUG_REGEX, generateId } from '@/types';
import { SEED_DOCS } from '@/data/seedDocs';
import { extractFrontmatterSync, extractHeadingsSync } from '@/composables/useMarkdownParser';

/** Primary key holding the serialised {@link DocStoragePayload}. */
const STORAGE_KEY = 'vue_docs_engine_v1';

/** Key that receives a copy of a payload that failed to load. */
const STORAGE_BACKUP_KEY = `${STORAGE_KEY}_backup`;

/**
 * Largest single document the engine will accept, in UTF-16 code units.
 *
 * Without a ceiling, one save can push the serialised payload past the
 * browser's origin quota, after which every subsequent write fails and the
 * corpus becomes read-only. Rejecting early keeps a single oversized paste
 * from bricking storage for the visitor.
 */
export const MAX_DOCUMENT_LENGTH = 512_000;

/**
 * Combined ceiling for every document and draft, in UTF-16 code units.
 *
 * Enforced before serialisation so the cost of building a multi-megabyte
 * JSON string is never paid for a write that cannot succeed.
 */
export const MAX_CORPUS_LENGTH = 4_096_000;

/** How long a deletion tombstone is honoured before it is compacted away. */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Ids carrying this prefix belong to the bundled corpus.
 *
 * Their tombstones are kept permanently: compaction exists to reclaim space
 * in the visitor's own deletion history, and expiring a seed tombstone would
 * let reconciliation resurrect a document the visitor deliberately removed.
 */
const SEED_ID_PREFIX = 'seed-';

/** Outcome of a single save attempt. */
export type SaveDocResult =
  | { success: true; doc: DocItem }
  | { success: false; error: string };

/** Why a payload could not be written. */
export type StorageWriteFailure =
  | 'unavailable'
  | 'quota-exceeded'
  | 'serialization-failed';

/** Result of an attempt to persist a payload snapshot. */
export type StorageWriteResult =
  | { ok: true }
  | { ok: false; reason: StorageWriteFailure };

/** A fully materialised, validated snapshot of persisted state. */
interface EngineState {
  docs: DocItem[];
  drafts: Record<string, DocDraft>;
  deletedAtMap: Record<string, number>;
  recentSearches: string[];
}

/**
 * Module-scope state.
 *
 * The engine is a single-writer application: a module-scope store guarantees
 * one reactive source of truth regardless of how many components call
 * {@link useDocStorage}.
 */
const docs = ref<DocItem[]>([]);
const drafts = ref<Record<string, DocDraft>>({});
const deletedAtMap = ref<Record<string, number>>({});
const recentSearches = ref<string[]>([]);
const isInitialized = ref(false);

/** `true` once a load has been attempted, successful or not. */
let storageAvailable = true;

/**
 * Detects a usable Web Storage area. Private browsing modes and hardened
 * browser profiles expose the API but throw on access.
 */
function isStorageUsable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const probe = '__vue_docs_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Structural validation for documents read back from storage.
 *
 * Persisted state is untrusted input: it may have been written by an older
 * build, hand-edited in devtools, or truncated by a quota failure.
 */
function isValidDocShape(value: unknown): value is DocItem {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate['id'] !== 'string' || candidate['id'].length === 0) return false;
  if (typeof candidate['slug'] !== 'string' || !SLUG_REGEX.test(candidate['slug'])) return false;
  if (typeof candidate['title'] !== 'string') return false;
  if (typeof candidate['description'] !== 'string') return false;
  if (typeof candidate['category'] !== 'string') return false;
  if (typeof candidate['order'] !== 'number' || !Number.isFinite(candidate['order'])) return false;
  if (typeof candidate['rawContent'] !== 'string') return false;
  if (!Array.isArray(candidate['headings'])) return false;
  if (!Array.isArray(candidate['tags']) || candidate['tags'].some((tag) => typeof tag !== 'string')) {
    return false;
  }
  if (typeof candidate['lastModified'] !== 'string') return false;
  if (typeof candidate['updatedAt'] !== 'number' || !Number.isFinite(candidate['updatedAt'])) {
    return false;
  }
  if (typeof candidate['isDraft'] !== 'boolean') return false;
  if (candidate['seedVersion'] !== undefined && typeof candidate['seedVersion'] !== 'number') {
    return false;
  }
  if (
    candidate['isUserModified'] !== undefined &&
    typeof candidate['isUserModified'] !== 'boolean'
  ) {
    return false;
  }

  return true;
}

/** Validates a persisted draft, returning `null` when the shape is unusable. */
function toValidDraft(value: unknown): DocDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate['id'] !== 'string' || candidate['id'].length === 0) return null;
  if (typeof candidate['slug'] !== 'string') return null;
  if (typeof candidate['title'] !== 'string') return null;
  if (typeof candidate['category'] !== 'string') return null;
  if (typeof candidate['rawContent'] !== 'string') return null;
  if (typeof candidate['lastSavedAt'] !== 'number' || !Number.isFinite(candidate['lastSavedAt'])) {
    return null;
  }

  return {
    id: candidate['id'],
    slug: candidate['slug'],
    title: candidate['title'],
    category: candidate['category'],
    rawContent: candidate['rawContent'],
    lastSavedAt: candidate['lastSavedAt']
  };
}

/** Coerces an untrusted value into a `{ id: epochMs }` tombstone map. */
function toValidDeletionMap(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, timestamp] of Object.entries(value as Record<string, unknown>)) {
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
      result[key] = timestamp;
    }
  }
  return result;
}

/** Coerces an untrusted value into a de-duplicated, bounded search history. */
function toValidRecentSearches(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, MAX_RECENT_SEARCHES);
}

/**
 * Measures the corpus a write would produce.
 *
 * Only the document bodies are counted. They dominate the payload by orders
 * of magnitude, and measuring them keeps the check O(n) in document count
 * rather than in serialised bytes.
 */
function measureCorpusLength(
  docs: readonly DocItem[],
  draftMap: Record<string, DocDraft>
): number {
  let total = 0;
  for (const doc of docs) {
    total += doc.rawContent.length;
  }
  for (const draft of Object.values(draftMap)) {
    total += draft.rawContent.length;
  }
  return total;
}

/**
 * Drops tombstones that have outlived their retention window.
 *
 * A tombstone is only needed to stop reconciliation resurrecting a seed, so
 * once the window has passed the entry is pure growth in the payload. Seed
 * tombstones are exempt and retained forever, because expiring one would
 * undo a deliberate deletion.
 */
function evictExpiredTombstones(
  tombstones: Record<string, number>,
  now: number
): Record<string, number> {
  const retained: Record<string, number> = {};
  for (const [id, deletedAt] of Object.entries(tombstones)) {
    const isSeed = id.startsWith(SEED_ID_PREFIX);
    if (isSeed || now - deletedAt <= TOMBSTONE_TTL_MS) {
      retained[id] = deletedAt;
    }
  }
  return retained;
}

/** Produces the state used when storage holds nothing usable. */
function createSeedState(): EngineState {
  return {
    docs: structuredClone(SEED_DOCS) as DocItem[],
    drafts: {},
    deletedAtMap: {},
    recentSearches: []
  };
}

/**
 * Reconciles persisted documents against the bundled seed corpus.
 *
 * Four rules, applied in order:
 * 1. A seed the visitor deleted is skipped.
 * 2. A seed missing from storage is appended.
 * 3. A seed the visitor edited is never overwritten.
 * 4. A pristine seed from an older revision is upgraded in place.
 */
function reconcileSeeds(storedDocs: DocItem[], deletions: Record<string, number>): DocItem[] {
  const reconciled = [...storedDocs];

  for (const seed of SEED_DOCS) {
    if (deletions[seed.id] !== undefined) continue;

    const existing = reconciled.find((doc) => doc.id === seed.id);
    if (existing === undefined) {
      reconciled.push(structuredClone(seed) as DocItem);
      continue;
    }

    const isPristine = existing.isUserModified !== true;
    const isOutdated =
      seed.seedVersion !== undefined &&
      (existing.seedVersion === undefined || seed.seedVersion > existing.seedVersion);

    if (isPristine && isOutdated) {
      const index = reconciled.findIndex((doc) => doc.id === seed.id);
      if (index !== -1) {
        reconciled[index] = structuredClone(seed) as DocItem;
      }
    }
  }

  return reconciled;
}

/** Compares two snapshots without depending on key order. */
function signaturesMatch(a: EngineState, b: EngineState): boolean {
  return (
    JSON.stringify(a.docs) === JSON.stringify(b.docs) &&
    JSON.stringify(a.drafts) === JSON.stringify(b.drafts) &&
    JSON.stringify(a.deletedAtMap) === JSON.stringify(b.deletedAtMap) &&
    JSON.stringify(a.recentSearches) === JSON.stringify(b.recentSearches)
  );
}

/**
 * Serialises and writes a complete snapshot.
 *
 * Callers must treat a non-`ok` result as a hard failure: the engine never
 * commits reactive state that failed to reach disk.
 */
function writeToLocalStorage(state: EngineState): StorageWriteResult {
  if (!storageAvailable) {
    return { ok: false, reason: 'unavailable' };
  }

  const payload: DocStoragePayload = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    docs: state.docs,
    drafts: state.drafts,
    deletedAtMap: state.deletedAtMap,
    recentSearches: state.recentSearches
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch (cause) {
    console.error('[vue-docs-engine] Unable to serialise the storage payload:', cause);
    return { ok: false, reason: 'serialization-failed' };
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
    return { ok: true };
  } catch (cause) {
    console.error('[vue-docs-engine] Unable to write the storage payload:', cause);
    const isQuota = cause instanceof DOMException && cause.name === 'QuotaExceededError';
    return { ok: false, reason: isQuota ? 'quota-exceeded' : 'unavailable' };
  }
}

/** Preserves an unparseable payload before the engine discards it. */
function backupCorruptPayload(): void {
  if (!storageAvailable) return;
  try {
    const corrupt = window.localStorage.getItem(STORAGE_KEY);
    if (corrupt !== null) {
      window.localStorage.setItem(STORAGE_BACKUP_KEY, corrupt);
      console.warn(
        `[vue-docs-engine] Preserved the unreadable payload under "${STORAGE_BACKUP_KEY}".`
      );
    }
  } catch (cause) {
    console.error('[vue-docs-engine] Unable to back up the corrupt payload:', cause);
  }
}

/**
 * Loads, validates and reconciles persisted state, then commits it to the
 * reactive refs. Persists only when reconciliation actually changed the
 * snapshot, which keeps the multi-tab \`storage\` handler from ping-ponging.
 */
function loadAndReconcile(): void {
  if (!isStorageUsable()) {
    storageAvailable = false;
    console.warn(
      '[vue-docs-engine] Web Storage is unavailable. The engine is running in memory only; changes will be lost on reload.'
    );
    const seedState = createSeedState();
    docs.value = seedState.docs;
    drafts.value = seedState.drafts;
    deletedAtMap.value = seedState.deletedAtMap;
    recentSearches.value = seedState.recentSearches;
    return;
  }

  let nextState: EngineState;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      nextState = createSeedState();
    } else {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('The stored payload is not an object.');
      }

      const payload = parsed as Partial<DocStoragePayload>;
      if (payload.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new Error(
          `Schema version mismatch: expected ${CURRENT_SCHEMA_VERSION}, found ${String(payload.schemaVersion)}.`
        );
      }
      if (!Array.isArray(payload.docs)) {
        throw new Error('The stored payload has no document list.');
      }

      const deletions = evictExpiredTombstones(
        toValidDeletionMap(payload.deletedAtMap),
        Date.now()
      );
      const storedDocs = payload.docs.filter(isValidDocShape);

      const loadedDrafts: Record<string, DocDraft> = {};
      if (typeof payload.drafts === 'object' && payload.drafts !== null) {
        for (const [key, value] of Object.entries(payload.drafts)) {
          const draft = toValidDraft(value);
          if (draft !== null) {
            loadedDrafts[key] = draft;
          }
        }
      }

      nextState = {
        docs: reconcileSeeds(storedDocs, deletions),
        drafts: loadedDrafts,
        deletedAtMap: deletions,
        recentSearches: toValidRecentSearches(payload.recentSearches)
      };
    }
  } catch (cause) {
    console.warn('[vue-docs-engine] Falling back to the seed corpus:', cause);
    backupCorruptPayload();
    nextState = createSeedState();
  }

  const previousState: EngineState = {
    docs: docs.value,
    drafts: drafts.value,
    deletedAtMap: deletedAtMap.value,
    recentSearches: recentSearches.value
  };

  docs.value = nextState.docs;
  drafts.value = nextState.drafts;
  deletedAtMap.value = nextState.deletedAtMap;
  recentSearches.value = nextState.recentSearches;

  if (!signaturesMatch(previousState, nextState)) {
    const result = writeToLocalStorage(nextState);
    if (!result.ok) {
      console.warn(
        '[vue-docs-engine] Reconciled state could not be persisted:',
        result.reason
      );
    }
  }
}

/**
 * Multi-tab synchronisation.
 *
 * Last-Write-Wins snapshot replacement: a tab that receives a \`storage\` event
 * reloads the entire payload and re-runs reconciliation. Concurrent edits made
 * in separate tabs overwrite each other; individual fields are never merged.
 * Registered at module scope so exactly one listener exists per document.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    loadAndReconcile();
  });
}

/** Human readable copy for a failed persistence attempt. */
function describeWriteFailure(reason: StorageWriteFailure): string {
  switch (reason) {
    case 'quota-exceeded':
      return 'Storage quota exceeded. Delete drafts or documents and try again.';
    case 'serialization-failed':
      return 'The document could not be serialised for storage.';
    case 'unavailable':
      return 'Browser storage is unavailable. Your changes will be lost on reload.';
  }
}

/**
 * Persists the engine's documents and drafts.
 *
 * Every mutating operation follows the same order: build the next snapshot,
 * write it, and only then publish it to the reactive refs. A failed write
 * leaves both the interface and the disk untouched and returns an error the
 * editor can display verbatim.
 */
export function useDocStorage() {
  if (!isInitialized.value) {
    loadAndReconcile();
    isInitialized.value = true;
  }

  /**
   * Validates markdown and publishes it as a document.
   *
   * @param rawMarkdown The complete source, frontmatter fence included.
   * @param existingId  The document to replace, or `undefined` to create one.
   */
  function saveDoc(rawMarkdown: string, existingId?: string): SaveDocResult {
    // Size is checked first, before the frontmatter is parsed, so a 40 MB
    // paste is rejected on a string length rather than after a full parse.
    if (rawMarkdown.length > MAX_DOCUMENT_LENGTH) {
      return {
        success: false,
        error: 'Document exceeds the maximum permitted size of 500 KB.'
      };
    }

    const targetId = existingId ?? generateId();

    let frontmatter: ReturnType<typeof extractFrontmatterSync>['frontmatter'];
    let body: string;
    try {
      const parsed = extractFrontmatterSync(rawMarkdown);
      frontmatter = parsed.frontmatter;
      body = parsed.body;
    } catch (cause) {
      return {
        success: false,
        error: cause instanceof Error ? cause.message : 'The frontmatter could not be parsed.'
      };
    }

    const collision = docs.value.find(
      (doc) => doc.slug === frontmatter.slug && doc.id !== targetId
    );
    if (collision !== undefined) {
      return {
        success: false,
        error: `Slug "${frontmatter.slug}" is already in use by "${collision.title}".`
      };
    }

    let headings: DocHeading[];
    try {
      headings = extractHeadingsSync(body);
    } catch (cause) {
      return {
        success: false,
        error: cause instanceof Error ? cause.message : 'The document body could not be parsed.'
      };
    }

    const previous = docs.value.find((doc) => doc.id === targetId);
    const updatedDoc: DocItem = {
      id: targetId,
      slug: frontmatter.slug,
      title: frontmatter.title,
      description: frontmatter.description,
      category: frontmatter.category,
      order: frontmatter.order,
      rawContent: rawMarkdown,
      headings,
      tags: frontmatter.tags,
      lastModified: frontmatter.lastModified,
      updatedAt: Date.now(),
      ...(previous?.seedVersion !== undefined ? { seedVersion: previous.seedVersion } : {}),
      isUserModified: true,
      isDraft: false
    };

    const nextDocs = [...docs.value];
    const existingIndex = nextDocs.findIndex((doc) => doc.id === targetId);
    if (existingIndex === -1) {
      nextDocs.push(updatedDoc);
    } else {
      nextDocs[existingIndex] = updatedDoc;
    }

    const nextDrafts = { ...drafts.value };
    delete nextDrafts[targetId];

    const nextDeletions = { ...deletedAtMap.value };
    delete nextDeletions[targetId];

    if (measureCorpusLength(nextDocs, nextDrafts) > MAX_CORPUS_LENGTH) {
      return {
        success: false,
        error: 'Total documentation storage exceeds the 4 MB budget. Please delete unused documents.'
      };
    }

    const write = writeToLocalStorage({
      docs: nextDocs,
      drafts: nextDrafts,
      deletedAtMap: nextDeletions,
      recentSearches: recentSearches.value
    });

    if (!write.ok) {
      return { success: false, error: describeWriteFailure(write.reason) };
    }

    docs.value = nextDocs;
    drafts.value = nextDrafts;
    deletedAtMap.value = nextDeletions;

    return { success: true, doc: updatedDoc };
  }

  /**
   * Removes a document and records a tombstone so seed reconciliation cannot
   * resurrect it on the next load.
   */
  function deleteDoc(id: string): boolean {
    if (!docs.value.some((doc) => doc.id === id)) return false;

    const nextDocs = docs.value.filter((doc) => doc.id !== id);
    const nextDrafts = { ...drafts.value };
    delete nextDrafts[id];
    const nextDeletions = { ...deletedAtMap.value, [id]: Date.now() };

    const write = writeToLocalStorage({
      docs: nextDocs,
      drafts: nextDrafts,
      deletedAtMap: nextDeletions,
      recentSearches: recentSearches.value
    });

    if (!write.ok) {
      console.error(`[vue-docs-engine] Delete failed: ${write.reason}`);
      return false;
    }

    docs.value = nextDocs;
    drafts.value = nextDrafts;
    deletedAtMap.value = nextDeletions;
    return true;
  }

  /** Autosaves an unpublished work-in-progress. */
  function saveDraft(draft: DocDraft): boolean {
    if (draft.rawContent.length > MAX_DOCUMENT_LENGTH) {
      console.error(
        `[vue-docs-engine] Draft rejected: exceeds ${MAX_DOCUMENT_LENGTH} UTF-16 code units.`
      );
      return false;
    }

    const nextDrafts: Record<string, DocDraft> = {
      ...drafts.value,
      [draft.id]: { ...draft, lastSavedAt: Date.now() }
    };

    if (measureCorpusLength(docs.value, nextDrafts) > MAX_CORPUS_LENGTH) {
      console.error(
        `[vue-docs-engine] Draft rejected: corpus would exceed ${MAX_CORPUS_LENGTH} UTF-16 code units.`
      );
      return false;
    }

    const write = writeToLocalStorage({
      docs: docs.value,
      drafts: nextDrafts,
      deletedAtMap: deletedAtMap.value,
      recentSearches: recentSearches.value
    });

    if (!write.ok) {
      console.error(`[vue-docs-engine] Draft save failed: ${write.reason}`);
      return false;
    }

    drafts.value = nextDrafts;
    return true;
  }

  /** Discards an autosaved draft. */
  function deleteDraft(id: string): boolean {
    if (drafts.value[id] === undefined) return false;

    const nextDrafts = { ...drafts.value };
    delete nextDrafts[id];

    const write = writeToLocalStorage({
      docs: docs.value,
      drafts: nextDrafts,
      deletedAtMap: deletedAtMap.value,
      recentSearches: recentSearches.value
    });

    if (!write.ok) {
      console.error(`[vue-docs-engine] Draft delete failed: ${write.reason}`);
      return false;
    }

    drafts.value = nextDrafts;
    return true;
  }

  /**
   * Records a search term, de-duplicating case-insensitively and keeping only
   * the most recent {@link MAX_RECENT_SEARCHES} entries.
   */
  function addRecentSearch(term: string): void {
    const clean = term.trim();
    if (clean.length === 0) return;

    const nextSearches = [
      clean,
      ...recentSearches.value.filter((entry) => entry.toLowerCase() !== clean.toLowerCase())
    ].slice(0, MAX_RECENT_SEARCHES);

    const write = writeToLocalStorage({
      docs: docs.value,
      drafts: drafts.value,
      deletedAtMap: deletedAtMap.value,
      recentSearches: nextSearches
    });

    if (!write.ok) return;
    recentSearches.value = nextSearches;
  }

  /** `true` when the engine can actually persist changes. */
  const isPersistent = (): boolean => storageAvailable;

  return {
    docs,
    drafts,
    recentSearches,
    isPersistent,
    saveDoc,
    deleteDoc,
    saveDraft,
    deleteDraft,
    addRecentSearch
  };
}

/** The storage keys the engine owns, exported for diagnostics. */
export const STORAGE_KEYS = Object.freeze({
  primary: STORAGE_KEY,
  backup: STORAGE_BACKUP_KEY
});
