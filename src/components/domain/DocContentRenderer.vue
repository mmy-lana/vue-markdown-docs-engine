<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { readOversizedClipboard } from '@/composables/codeClipboardRegistry';

/**
 * Renders compiled document HTML and owns the behaviour of the markup inside
 * it.
 *
 * The HTML is produced by the engine's own compiler and passed through
 * DOMPurify, so the interactive elements it contains are known and finite:
 * the code card's copy button, and anchors. Both are handled by delegation
 * here rather than by the document view, which keeps the view presentational
 * and confines all DOM mutation of injected markup to one place.
 */
defineProps<{
  /** Sanitized HTML produced by the compiler. */
  html: string;
}>();

const router = useRouter();

/** Class the compiler puts on every code card's copy button. */
const COPY_BUTTON_CLASS = 'doc-code-copy-btn';

/**
 * URI schemes that must never be navigable from document content.
 *
 * The parser and the sanitizer already refuse to emit these, so this is
 * defence in depth: the rule is enforced again at the moment of interaction,
 * where a link that survived an earlier stage is cheapest to neutralise.
 */
const FORBIDDEN_SCHEMES = ['javascript:', 'vbscript:', 'data:', 'file:', 'blob:'] as const;

/** What the renderer should do with a link found in compiled document HTML. */
type LinkAction =
  /** Fragment link; the browser and the router already handle it. */
  | 'ignore'
  /** In-app document route; hand it to the router. */
  | 'route-internal'
  /** Off-site http(s) destination; open it in an isolated tab. */
  | 'open-external'
  /** Not navigable. */
  | 'block';

/**
 * Validates a destination against the page origin using the platform URL
 * parser rather than string prefixes.
 */
function isSafeExternalDestination(href: string, origin: string): boolean {
  const lowered = href.toLowerCase();
  for (const scheme of FORBIDDEN_SCHEMES) {
    if (lowered.startsWith(scheme)) return false;
  }

  try {
    const parsed = new URL(href, origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Decides how a link in document content should behave.
 *
 * The order matters. A protocol-relative URL such as `//example.test/path`
 * begins with `/` but resolves to a different host, so it must be classified
 * before the in-app route check can mistake it for a local path.
 */
function classifyLink(rawHref: string, origin: string): LinkAction {
  const href = rawHref.trim();
  if (href.length === 0) return 'block';

  if (href.startsWith('#')) return 'ignore';

  if (href.startsWith('//')) {
    return isSafeExternalDestination(href, origin) ? 'open-external' : 'block';
  }

  if (href.startsWith('/docs/')) return 'route-internal';

  return isSafeExternalDestination(href, origin) ? 'open-external' : 'block';
}

/** Buttons currently showing a transient confirmation, so timeouts never stack. */
const pendingLabels = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** Message announced to assistive technology after a clipboard attempt. */
const clipboardStatus = ref<string>('');

/**
 * Reads the snippet a copy button refers to.
 *
 * Most blocks carry their payload inline. A block too large for an attribute
 * is held in the compiler's in-memory registry and referenced by id, so the
 * markup stays small without truncating the code.
 *
 * @returns the code, or `null` when the reference is missing or malformed.
 */
function resolveClipboardPayload(button: HTMLElement): string | null {
  const encoded = button.dataset['clipboard'];
  if (encoded !== undefined) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }

  const reference = button.dataset['clipboardRef'];
  if (reference === undefined) return null;

  return readOversizedClipboard(reference) ?? null;
}

function setTransientLabel(button: HTMLElement, label: string, revertTo: string): void {
  const existing = pendingLabels.get(button);
  if (existing !== undefined) {
    clearTimeout(existing);
  }

  button.textContent = label;
  const timer = setTimeout(() => {
    button.textContent = revertTo;
    pendingLabels.delete(button);
  }, 2000);
  pendingLabels.set(button, timer);
}

/**
 * Copies text to the clipboard.
 *
 * The async Clipboard API is used where it is available, which in practice
 * means any secure context. The legacy path is kept for the remaining cases
 * and is allowed to reject, so a failure surfaces as "Failed" rather than
 * silently doing nothing.
 */
function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard !== undefined && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.top = '0';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();

    try {
      const copied = document.execCommand('copy');
      if (copied) {
        resolve();
      } else {
        reject(new Error('execCommand("copy") returned false'));
      }
    } catch (cause) {
      reject(cause instanceof Error ? cause : new Error('Copy failed'));
    } finally {
      document.body.removeChild(scratch);
    }
  });
}

function handleContentClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;

  const copyButton = event.target.closest<HTMLElement>(`.${COPY_BUTTON_CLASS}`);
  if (copyButton !== null) {
    const code = resolveClipboardPayload(copyButton);
    const revertTo = copyButton.textContent ?? 'Copy';

    if (code === null) {
      setTransientLabel(copyButton, 'Failed', revertTo);
      return;
    }

    copyToClipboard(code)
      .then(() => {
        clipboardStatus.value = 'Code snippet copied to clipboard';
        setTransientLabel(copyButton, 'Copied', revertTo);
      })
      .catch(() => {
        clipboardStatus.value = 'Failed to copy code snippet';
        setTransientLabel(copyButton, 'Failed', revertTo);
      });
    return;
  }

  const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
  if (anchor === null) return;

  const href = anchor.getAttribute('href');
  if (href === null) return;

  switch (classifyLink(href, window.location.origin)) {
    case 'route-internal':
      // Let the router own navigation so history, scroll restoration and the
      // active sidebar entry all stay in step.
      event.preventDefault();
      void router.push(href);
      break;

    case 'open-external':
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
      break;

    case 'block':
      // Content the engine cannot vouch for must not stay navigable, whatever
      // the sanitizer let through. Dropping the href leaves the text visible
      // while removing the destination.
      event.preventDefault();
      anchor.removeAttribute('href');
      anchor.setAttribute('aria-disabled', 'true');
      break;

    case 'ignore':
      // Fragment links are emitted by the compiler and handled natively.
      break;
  }
}
</script>

<template>
  <div
    class="prose prose-slate max-w-none dark:prose-invert"
    data-testid="doc-content"
    v-html="html"
    @click="handleContentClick"
  />
</template>
