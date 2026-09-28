/**
 * Reference-counted background scroll lock.
 *
 * A modal dialog and the mobile navigation drawer can be open at the same
 * time. Counting holders means the first one to lock takes the page's
 * original `overflow` value and the last one to release restores it, so
 * closing the inner overlay never leaves the page scrollable while an outer
 * one is still up.
 *
 * State is module scoped on purpose: a per-caller counter would let one
 * component believe it owns the lock while another has already released it.
 */

let lockCount = 0;

/** The page's own `overflow` value, captured before the first lock. */
let previousOverflow = '';

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;

  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow;
  }
}
