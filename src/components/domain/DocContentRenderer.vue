<script setup lang="ts">
import { useRouter } from 'vue-router';

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

/** Buttons currently showing a transient confirmation, so timeouts never stack. */
const pendingLabels = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

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
    const encoded = copyButton.dataset['clipboard'];
    if (encoded === undefined) return;

    let code: string;
    try {
      code = decodeURIComponent(encoded);
    } catch {
      setTransientLabel(copyButton, 'Failed', 'Copy');
      return;
    }

    const revertTo = copyButton.textContent ?? 'Copy';
    copyToClipboard(code)
      .then(() => {
        setTransientLabel(copyButton, 'Copied', revertTo);
      })
      .catch(() => {
        setTransientLabel(copyButton, 'Failed', revertTo);
      });
    return;
  }

  const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
  if (anchor === null) return;

  const href = anchor.getAttribute('href');
  if (href === null) return;

  // In-document heading links are produced by the compiler and handled by
  // the router; absolute links must not be able to reach back into the app.
  if (href.startsWith('#')) return;

  if (href.startsWith('/docs/')) {
    // Let the router own navigation so history, scroll restoration and the
    // active sidebar entry all stay in step.
    event.preventDefault();
    void router.push(href);
    return;
  }

  if (/^https?:\/\//i.test(href)) {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
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
