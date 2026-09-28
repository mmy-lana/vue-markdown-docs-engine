<script lang="ts">
/**
 * Module-scoped dialog registry.
 *
 * This block runs once per module load, not once per component instance. The
 * focus-trap stack and the scroll lock have to be shared: a registry declared
 * inside `<script setup>` would be re-created for every dialog, so each dialog
 * would consider itself topmost, a single Escape would dismiss the entire
 * chain, and the scroll lock would be restored by whichever dialog closed last.
 */

/** Selects every natively focusable, non-disabled descendant. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/** Stack of open dialogs, innermost last. */
const dialogStack: symbol[] = [];

/** Number of dialogs currently holding the background scroll lock. */
let openDialogCount = 0;

/** The page's own `overflow` value, captured before the first dialog opened. */
let previousBodyOverflow = '';

export function isTopmostDialog(token: symbol): boolean {
  return dialogStack[dialogStack.length - 1] === token;
}

export function pushDialog(token: symbol): void {
  if (!dialogStack.includes(token)) {
    dialogStack.push(token);
  }
}

export function popDialog(token: symbol): void {
  const index = dialogStack.lastIndexOf(token);
  if (index !== -1) {
    dialogStack.splice(index, 1);
  }
}

/**
 * Reference-counted background scroll lock.
 *
 * The search palette and the editor can be open at the same time. The first
 * dialog to open takes the lock and the last one to close releases it, so a
 * nested dialog can never restore the page to a scrollable state while an
 * outer dialog is still up.
 */
export function lockBodyScroll(): void {
  if (openDialogCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openDialogCount += 1;
}

export function unlockBodyScroll(): void {
  openDialogCount = Math.max(0, openDialogCount - 1);
  if (openDialogCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
  }
}
</script>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';

/**
 * An accessible modal dialog.
 *
 * Implements the full WAI-ARIA dialog pattern:
 * - `role="dialog"` with `aria-modal="true"` and a resolvable accessible name.
 * - Focus moves to the first focusable descendant on open and is restored to
 *   the invoking element on close.
 * - Tab and Shift+Tab loop inside the dialog, including the case where focus
 *   has escaped the container entirely.
 * - Escape and a backdrop click both dismiss.
 * - Only the topmost dialog reacts to the keyboard, so nested dialogs unwind
 *   one at a time.
 * - Background scrolling is locked while at least one dialog is open.
 */

/** Identifies this instance within the module-scoped dialog stack. */
const dialogToken = Symbol('base-modal');

const props = withDefaults(
  defineProps<{
    /** Whether the dialog is mounted and interactive. */
    isOpen: boolean;
    /** Accessible name, used unless `labelledBy` is supplied. */
    ariaLabel: string;
    /** Id of the visible heading, preferred over `ariaLabel` when present. */
    labelledBy?: string;
    /** Hides the close affordance in the top-right corner. */
    hideCloseButton?: boolean;
  }>(),
  { labelledBy: undefined, hideCloseButton: false }
);

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const modalContainer = ref<HTMLElement | null>(null);

let previouslyFocusedElement: HTMLElement | null = null;

/**
 * Returns the dialog's focusable elements in tab order, discarding anything
 * that is not actually rendered. Without the visibility filter a control that
 * is hidden or conditionally removed would silently become a trap dead end.
 */
function getFocusableElements(): HTMLElement[] {
  const container = modalContainer.value;
  if (container === null) return [];

  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true'
  );
}

function focusElement(element: HTMLElement | undefined): void {
  element?.focus();
}

function handleKeydown(event: KeyboardEvent): void {
  // Only the topmost dialog owns the keyboard while it is open.
  if (!props.isOpen || !isTopmostDialog(dialogToken)) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }

  if (event.key !== 'Tab') return;

  const container = modalContainer.value;
  if (container === null) return;

  const focusable = getFocusableElements();

  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  // Focus has escaped the dialog (browser chrome, a removed element, a
  // programmatic focus). Pull it back to the correct end of the loop.
  if (active === null || !container.contains(active)) {
    event.preventDefault();
    focusElement(event.shiftKey ? last : first);
    return;
  }

  if (event.shiftKey && active === first) {
    event.preventDefault();
    focusElement(last);
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    focusElement(first);
  }
}

function requestClose(): void {
  emit('close');
}

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (typeof document === 'undefined') return;

    if (isOpen) {
      previouslyFocusedElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      pushDialog(dialogToken);
      lockBodyScroll();
      window.addEventListener('keydown', handleKeydown);

      await nextTick();
      focusElement(getFocusableElements()[0] ?? modalContainer.value ?? undefined);
      return;
    }

    popDialog(dialogToken);
    unlockBodyScroll();
    window.removeEventListener('keydown', handleKeydown);

    // The invoking element may have been unmounted while the dialog was open.
    if (previouslyFocusedElement?.isConnected === true) {
      previouslyFocusedElement.focus();
    }
    previouslyFocusedElement = null;
  },
  { immediate: true }
);

onUnmounted(() => {
  if (typeof document === 'undefined') return;
  window.removeEventListener('keydown', handleKeydown);
  if (props.isOpen) {
    popDialog(dialogToken);
    unlockBodyScroll();
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 sm:p-6"
    >
      <div
        class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
        aria-hidden="true"
        @click="requestClose"
      />

      <div
        ref="modalContainer"
        role="dialog"
        aria-modal="true"
        :aria-label="labelledBy ? undefined : ariaLabel"
        :aria-labelledby="labelledBy"
        tabindex="-1"
        class="relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl outline-none sm:max-h-[85dvh] sm:rounded-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <button
          v-if="!hideCloseButton"
          type="button"
          class="absolute top-2.5 right-2.5 z-20 inline-flex size-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          aria-label="Close dialog"
          @click="requestClose"
        >
          <svg
            aria-hidden="true"
            class="size-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <slot />
      </div>
    </div>
  </Teleport>
</template>
