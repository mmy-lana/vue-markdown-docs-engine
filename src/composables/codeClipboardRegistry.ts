/**
 * Backing store for the copy-to-clipboard payload on code cards.
 *
 * A snippet normally travels inline in a `data-clipboard` attribute, which
 * keeps the copy button working with nothing but the rendered HTML. That is
 * not viable for large blocks: the payload would inflate the DOM and every
 * serialisation of the tree. Snippets above the inline budget are therefore
 * held here and referenced by a short identifier instead.
 *
 * The store is module scoped and bounded, so it cannot grow without limit and
 * does not survive a reload. Identifiers exist only for the lifetime of the
 * page that produced them.
 */

/**
 * Largest copy payload carried inline in a `data-clipboard` attribute.
 *
 * 64 KB is far beyond any realistic snippet, so the inline path continues to
 * cover effectively all real content.
 */
export const MAX_INLINE_CLIPBOARD_LENGTH = 64 * 1024;

/** Number of oversized snippets retained before the oldest is evicted. */
const REGISTRY_CAPACITY = 64;

const entries = new Map<string, string>();
let sequence = 0;

function register(code: string): string {
  if (entries.size >= REGISTRY_CAPACITY) {
    const oldest = entries.keys().next();
    if (oldest.done !== true) {
      entries.delete(oldest.value);
    }
  }

  sequence += 1;
  const id = `clip-${sequence}`;
  entries.set(id, code);
  return id;
}

/** Resolves a reference previously returned by {@link buildClipboardAttributes}. */
export function readOversizedClipboard(reference: string): string | null {
  return entries.get(reference) ?? null;
}

/**
 * Builds the copy-button attribute for a snippet.
 *
 * `encodeURIComponent` escapes the double quote, so the encoded form is safe
 * inside a double-quoted attribute without further escaping.
 */
export function buildClipboardAttributes(code: string): string {
  const encoded = encodeURIComponent(code);
  if (encoded.length <= MAX_INLINE_CLIPBOARD_LENGTH) {
    return `data-clipboard="${encoded}"`;
  }
  return `data-clipboard-ref="${register(code)}"`;
}
