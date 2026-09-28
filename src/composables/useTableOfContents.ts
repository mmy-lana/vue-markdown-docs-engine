import { getCurrentInstance, onUnmounted, ref } from 'vue';

/**
 * Tracks which document heading is currently in view.
 *
 * A single `IntersectionObserver` replaces scroll listeners: the browser does
 * the intersection maths off the main thread, and the callback only fires when
 * the answer changes.
 */

/** Top inset matching the 64px sticky header, plus breathing room. */
const ROOT_MARGIN_TOP = '-80px 0px -65% 0px';

/** Fraction of a heading that must be visible before it counts as active. */
const THRESHOLD = 0.1;

export function useTableOfContents() {
  const activeHeadingId = ref<string>('');
  let observer: IntersectionObserver | null = null;
  let headings: readonly { id: string }[] = [];

  function disconnect(): void {
    observer?.disconnect();
    observer = null;
  }

  function observe(): void {
    disconnect();

    if (typeof window === 'undefined' || headings.length === 0) return;

    const callback: IntersectionObserverCallback = (entries) => {
      // Prefer the entry closest to the top of the viewport: entries are not
      // guaranteed to arrive in visual order, and the first intersecting entry
      // is not reliably the one the reader is looking at.
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      const first = visible[0];
      if (first !== undefined) {
        activeHeadingId.value = first.target.id;
      }
    };

    observer = new IntersectionObserver(callback, {
      rootMargin: ROOT_MARGIN_TOP,
      threshold: THRESHOLD
    });

    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element !== null) {
        observer.observe(element);
      }
    }
  }

  /**
   * Points the observer at a newly rendered document.
   *
   * Must be called after the document's HTML is in the DOM, otherwise there
   * is nothing to observe.
   */
  function initObserver(nextHeadings: readonly { id: string }[]): void {
    headings = nextHeadings;
    activeHeadingId.value = '';
    // A re-render replaces the heading elements, so the old ones are stale.
    requestAnimationFrame(observe);
  }

  /** Stops tracking and releases the observer. */
  function cleanupObserver(): void {
    headings = [];
    activeHeadingId.value = '';
    disconnect();
  }

  // `getCurrentInstance` guards the composable when it is used outside a
  // component, where the lifecycle hook would otherwise warn.
  if (getCurrentInstance() !== null) {
    onUnmounted(cleanupObserver);
  }

  return {
    activeHeadingId,
    initObserver,
    cleanupObserver
  };
}
