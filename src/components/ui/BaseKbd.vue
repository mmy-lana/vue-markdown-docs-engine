<script setup lang="ts">
/**
 * A keyboard shortcut badge.
 *
 * Decorative by default: the surrounding control carries the accessible name,
 * so the glyph itself is hidden from assistive technology.
 */
withDefaults(
  defineProps<{
    /** Visual weight of the badge. */
    size?: 'sm' | 'md';
  }>(),
  { size: 'sm' }
);

const sizeClasses = {
  sm: 'px-1.5 py-0.5 text-[0.6875rem]',
  md: 'px-2 py-1 text-xs'
} as const;
</script>

<template>
  <kbd
    aria-hidden="true"
    class="inline-flex items-center rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-sans font-medium text-slate-600 dark:text-slate-300 leading-none whitespace-nowrap select-none"
    :class="sizeClasses[size]"
  >
    <slot />
  </kbd>
</template>
